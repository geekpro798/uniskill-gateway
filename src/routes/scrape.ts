// ============================================================
// src/routes/scrape.ts
// 网页抓取路由：处理 POST /v1/scrape，代理 Jina AI Reader API
// ============================================================

import { getCredits, deductCredit } from "../utils/billing.ts";
import { hashToken } from "../utils/auth.ts";
import { errorResponse, buildUniskillMeta } from "../utils/response.ts";
import type { Env } from "../index.ts";

// Jina AI Reader 端点前缀：将目标 URL 拼接在后面即可获取 Markdown 格式内容
// 例如：https://r.jina.ai/https://example.com
const JINA_READER_BASE = "https://r.jina.ai/";

// 本技能的信用消耗量（每次请求扣 1 点）
const SCRAPE_COST = 1;

/**
 * Handles POST /v1/scrape
 * Flow: credit check → Jina Reader proxy → credit deduction → return structured result
 *
 * Request body: { "url": "https://..." }
 * Response:     { url, markdown_content, _uniskill }
 */
export async function handleScrape(
    request: Request,
    env: Env,
    token: string,
    ctx: ExecutionContext
): Promise<Response> {

    // ── Step 1: 对原始 Token 做 SHA-256 哈希，再用哈希值查询 KV 信用余额 ─────
    // 安全原则：KV 中仅存储哈希值，绝不明文保存原始 Token
    const tokenHash = await hashToken(token);
    const credits = await getCredits(env.UNISKILL_KV, tokenHash);

    if (credits === -1) {
        // KV 中不存在此 hash → token 未被签发或无效
        return errorResponse("Invalid API token.", 401);
    }
    if (credits <= 0) {
        // token 合法但余额耗尽 → 返回 402 Payment Required
        return errorResponse("Insufficient credits. Please top up your account.", 402);
    }

    // ── Step 2: 解析请求体，验证 url 字段 ────────────────────
    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return errorResponse("Invalid JSON body.", 400);
    }

    const rawUrl = body.url;
    if (!rawUrl || typeof rawUrl !== "string" || rawUrl.trim() === "") {
        return errorResponse('Request body must include a non-empty "url" field.', 400);
    }

    // 基础 URL 格式校验（防止将恶意字符串拼入 Jina 端点）
    let targetUrl: string;
    try {
        targetUrl = new URL(rawUrl.trim()).toString();
    } catch {
        return errorResponse('The "url" field must be a valid absolute URL (e.g. https://example.com).', 400);
    }

    // ── Step 3: 调用 Jina AI Reader，获取目标页面的 Markdown 文本 ───────────
    // 拼接格式：https://r.jina.ai/{targetUrl}
    // Jina 会自动解析原始 HTML 并返回纯净的 Markdown / 文本内容
    let jinaRes: Response;
    try {
        jinaRes = await fetch(`${JINA_READER_BASE}${targetUrl}`, {
            method: "GET",
            headers: {
                // 使用 Cloudflare Secret 注入的 JINA_API_KEY 进行鉴权
                // 自定义 Header 可提升 Jina 的速率限制并解锁额外功能
                "Authorization": `Bearer ${env.JINA_API_KEY}`,
                // 要求 Jina 返回 Markdown 格式（而非默认 HTML or text）
                "Accept": "text/markdown, text/plain, */*",
                "X-Return-Format": "markdown",
            },
        });
    } catch {
        // 网络层错误（DNS / 超时），不扣信用
        return errorResponse("Failed to reach Jina AI Reader. Please try again later.", 502);
    }

    // ── Step 4: 上游失败则透传错误状态，不扣信用 ──────────────
    if (!jinaRes.ok) {
        const errText = await jinaRes.text();
        return new Response(
            JSON.stringify({ success: false, error: `Jina upstream error: ${errText}` }),
            { status: jinaRes.status, headers: { "Content-Type": "application/json" } }
        );
    }

    // ── Step 5: 成功获取内容后扣除信用，并同步到 Supabase ─────
    // 扣减操作在后台异步执行（waitUntil），不阻塞用户响应
    const newBalance = credits - SCRAPE_COST;
    ctx.waitUntil(deductCredit(env.UNISKILL_KV, tokenHash, credits, SCRAPE_COST, env.VERCEL_WEBHOOK_URL, env.ADMIN_KEY, "Web Scrape"));

    // ── Step 6: 构建 Agent 友好的结构化响应 ──────────────────
    const markdownContent = await jinaRes.text();

    return new Response(
        JSON.stringify({
            url: targetUrl,
            // markdown_content 包含 Jina 提取的完整 Markdown 文本，可直接放入 Agent 上下文
            markdown_content: markdownContent,
            // _uniskill 元数据块：包含剩余信用和请求 ID，供 Agent 追踪账单
            _uniskill: buildUniskillMeta(SCRAPE_COST, newBalance, request),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
    );
}
