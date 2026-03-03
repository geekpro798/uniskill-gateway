// ============================================================
// src/routes/search.ts
// 搜索路由：处理 POST /v1/search，代理 Tavily Search API
// ============================================================

import { getCredits, deductCredit } from "../utils/billing.ts";
import { hashToken } from "../utils/auth.ts";
import { errorResponse, buildUniskillMeta } from "../utils/response.ts";
import type { Env } from "../index.ts";

// Tavily Search API 端点
const TAVILY_SEARCH_URL = "https://api.tavily.com/search";

// 本技能的信用消耗量（每次请求扣 1 点）
const SEARCH_COST = 1;

// 允许透传给 Tavily 的可选字段白名单（防止用户注入非预期参数）
const TAVILY_PASSTHROUGH_KEYS = [
    "search_depth",
    "max_results",
    "include_answer",
    "include_domains",
    "exclude_domains",
] as const;

/**
 * Handles POST /v1/search
 * Flow: credit check → Tavily proxy → credit deduction → return agent-optimized result
 *
 * Request body: { "query": "...", ...optional Tavily params }
 * Response:     { answer, results: [{title, url, content, score}], _uniskill }
 */
export async function handleSearch(
    request: Request,
    env: Env,
    token: string,
    ctx: ExecutionContext
): Promise<Response> {

    // ── Step 1: 对原始 Token 做 SHA-256 哈希，再用哈希值查询 KV 信用余额 ─────
    // 哈希化目的：KV 中仅存储不可逆的哈希值，即使 KV 数据泄露也无法还原真实 Token
    const tokenHash = await hashToken(token);
    const credits = await getCredits(env.UNISKILL_KV, tokenHash);

    if (credits === -1) {
        // KV 中不存在此哈希 → token 未签发或已被吊销
        return errorResponse("Invalid API token.", 401);
    }
    if (credits <= 0) {
        // token 合法但余额耗尽 → 返回 402 Payment Required
        return errorResponse("Insufficient credits. Please top up your account.", 402);
    }

    // ── Step 2: 解析请求体，验证必填的 query 字段 ────────────
    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return errorResponse("Invalid JSON body.", 400);
    }

    const query = body.query;
    if (!query || typeof query !== "string" || query.trim() === "") {
        return errorResponse('Request body must include a non-empty "query" field.', 400);
    }

    // ── Step 3: 构建 Tavily 请求载荷 ─────────────────────────
    // 默认使用 advanced 深度（企业托管 Key 可解锁更高质量结果）
    // 同时强制开启 include_answer，以便 Agent 能获取简洁的摘要答案
    const tavilyPayload: Record<string, unknown> = {
        api_key: env.TAVILY_API_KEY,  // TAVILY_API_KEY 通过 Cloudflare Secret 注入，不出现在代码或响应中
        query: query.trim(),
        search_depth: "advanced",
        include_answer: true,  // 让 Tavily 生成一个综合答案，AI Agent 可直接引用
    };

    // 将用户请求体中的白名单字段透传给 Tavily（允许用户自定义部分参数）
    for (const key of TAVILY_PASSTHROUGH_KEYS) {
        if (body[key] !== undefined) {
            tavilyPayload[key] = body[key];
        }
    }

    // ── Step 4: 代理请求到 Tavily ─────────────────────────────
    let tavilyRes: Response;
    try {
        tavilyRes = await fetch(TAVILY_SEARCH_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(tavilyPayload),
        });
    } catch {
        // 网络层错误（如 DNS 失败或超时），不扣信用
        return errorResponse("Failed to reach Tavily API. Please try again later.", 502);
    }

    // ── Step 5: 上游失败则透传错误状态码，不扣信用 ───────────
    if (!tavilyRes.ok) {
        const errBody = await tavilyRes.text();
        return new Response(errBody, {
            status: tavilyRes.status,
            headers: { "Content-Type": "application/json" },
        });
    }

    // ── Step 6: 成功后在后台异步扣除信用，并同步到 Supabase ──
    // waitUntil 确保扣费+回写操作在响应返回后继续执行，不阻塞主路径
    const newBalance = credits - SEARCH_COST;
    ctx.waitUntil(deductCredit(env.UNISKILL_KV, tokenHash, credits, SEARCH_COST, env.VERCEL_WEBHOOK_URL, env.ADMIN_KEY, "Web Search"));

    // ── Step 7: 构建 Agent 友好的结构化搜索响应 ──────────────
    const tavilyData = (await tavilyRes.json()) as {
        answer?: string;
        results?: Array<{
            title?: string;
            url?: string;
            content?: string;
            score?: number;
        }>;
        [key: string]: unknown;
    };

    // 将 Tavily results 规范化为 Agent 易于处理的格式
    const results = (tavilyData.results ?? []).map((r) => ({
        title: r.title ?? "",
        url: r.url ?? "",
        content: r.content ?? "",
        relevance_score: r.score ?? null,
    }));

    return new Response(
        JSON.stringify({
            // answer: Tavily 生成的综合答案字符串，Agent 可直接引用到对话上下文中
            answer: tavilyData.answer ?? null,
            // results: 规范化的搜索结果列表，每条含标题、链接、内容摘要和相关性分数
            results,
            total_results: results.length,
            // _uniskill 元数据块：告知 Agent 本次消耗的信用和剩余额度，以及请求追踪 ID
            _uniskill: buildUniskillMeta(SEARCH_COST, newBalance, request),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
    );
}
