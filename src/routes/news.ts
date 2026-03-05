// ============================================================
// src/routes/news.ts
// 新闻搜索路由：处理 POST /v1/news，代理 Tavily News Search API
// ============================================================

import { getCredits, deductCredit } from "../utils/billing.ts";
import { hashKey } from "../utils/auth.ts";
import { errorResponse, buildUniskillMeta } from "../utils/response.ts";
import type { Env } from "../index.ts";

// Tavily Search API 端点（news 模式，与通用搜索共用同一 URL）
const TAVILY_SEARCH_URL = "https://api.tavily.com/search";

// 本技能的信用消耗量（每次请求扣 10 点）
const NEWS_COST = 10;

// Tavily 新闻请求中允许用户透传的可选字段白名单
const NEWS_PASSTHROUGH_KEYS = [
    "max_results",
    "include_domains",
    "exclude_domains",
] as const;

/**
 * Handles POST /v1/news
 * Flow: key check → Tavily News proxy → credit deduction → return structured articles
 *
 * Request body: { "query": "AI news today", ...optional fields }
 * Response:     { articles: [{title, url, content, published_date}], _uniskill }
 */
export async function handleNews(
    request: Request,
    env: Env,
    key: string,
    ctx: ExecutionContext
): Promise<Response> {

    // ── Step 1: 对原始 Key 做 SHA-256 哈希，再用哈希值查询 KV 信用余额 ─────
    // 安全原则：KV 中仅索引哈希，绝不明文存储原始 Key
    const keyHash = await hashKey(key);
    const credits = await getCredits(env.UNISKILL_KV, keyHash);

    if (credits === -1) {
        return errorResponse("Invalid API key.", 401);
    }
    if (credits <= 0) {
        return errorResponse("Insufficient credits. Please top up your account.", 402);
    }

    // ── Step 2: 解析请求体，验证 query 字段 ──────────────────
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

    // ── Step 3: 构建 Tavily 新闻搜索请求载荷 ─────────────────
    // topic: "news" 告知 Tavily 使用新闻专用索引（比通用搜索更新鲜）
    // search_depth: "basic" 对新闻而言已足够，同时保持低延迟
    const tavilyPayload: Record<string, unknown> = {
        api_key: env.TAVILY_API_KEY,
        query: query.trim(),
        topic: "news",
        search_depth: "basic",
        include_answer: false, // 新闻场景下让 Agent 自己汇总
    };

    // 合并用户可选的白名单字段
    for (const key of NEWS_PASSTHROUGH_KEYS) {
        if (body[key] !== undefined) {
            tavilyPayload[key] = body[key];
        }
    }

    // ── Step 4: 代理请求到 Tavily News Search ────────────────
    let tavilyRes: Response;
    try {
        tavilyRes = await fetch(TAVILY_SEARCH_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(tavilyPayload),
        });
    } catch {
        // 网络层错误，不扣信用
        return errorResponse("Failed to reach Tavily API. Please try again later.", 502);
    }

    // ── Step 5: 上游失败则透传错误，不扣信用 ─────────────────
    if (!tavilyRes.ok) {
        const errBody = await tavilyRes.text();
        return new Response(errBody, {
            status: tavilyRes.status,
            headers: { "Content-Type": "application/json" },
        });
    }

    // ── Step 6: 成功后在后台异步扣除信用，并同步到 Supabase ──
    const newBalance = credits - NEWS_COST;
    ctx.waitUntil(deductCredit(env.UNISKILL_KV, keyHash, credits, NEWS_COST, env.VERCEL_WEBHOOK_URL, env.ADMIN_KEY, "News Search"));

    // ── Step 7: 构建 Agent 友好的新闻结构化响应 ──────────────
    // Tavily 返回结果中 results[] 每条含 title、url、content、published_date 等字段
    const tavilyData = (await tavilyRes.json()) as {
        results?: Array<{
            title?: string;
            url?: string;
            content?: string;
            published_date?: string;
            score?: number;
        }>;
        [key: string]: unknown;
    };

    // 将 Tavily results 映射为统一的 articles 格式，Agent 可直接消费
    const articles = (tavilyData.results ?? []).map((r) => ({
        title: r.title ?? "",
        url: r.url ?? "",
        content: r.content ?? "",
        published_date: r.published_date ?? null,
        relevance_score: r.score ?? null,
    }));

    return new Response(
        JSON.stringify({
            // articles 数组：每条包含标题、链接、摘要、发布日期，AI Agent 可直接引用
            articles,
            total_results: articles.length,
            // _uniskill 元数据块：包含本次消耗的信用和剩余额度
            _uniskill: buildUniskillMeta(NEWS_COST, newBalance, request),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
    );
}
