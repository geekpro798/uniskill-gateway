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

// 允许透传给 Tavily 的可选字段白名单
const TAVILY_PASSTHROUGH_KEYS = [
    "search_depth",
    "max_results",
    "include_answer",
    "include_domains",
    "exclude_domains",
] as const;

/**
 * Handles POST /search
 * Flow: credit check → Tavily proxy → credit deduction → return result
 */
export async function handleSearch(
    request: Request,
    env: Env,
    token: string,
    ctx: ExecutionContext
): Promise<Response> {

    // ── Step 1: 哈希原始 token，再查 KV 中的信用额度 ─────────
    // KV Key = SHA-256(rawToken)，与 admin.ts 签发时的存储方式一致
    const tokenHash = await hashToken(token);
    const credits = await getCredits(env.UNISKILL_KV, tokenHash);

    if (credits === -1) {
        // token 在 KV 中不存在 → 未授权
        return errorResponse("Invalid API token.", 401);
    }
    if (credits <= 0) {
        // token 合法但余额为零 → 支付请求
        return errorResponse("Insufficient credits. Please top up your account.", 402);
    }

    // ── Step 2: 解析请求体 ────────────────────────────────────
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
    // 默认 advanced 深度（企业托管 Key 优势），用户可通过请求体覆盖
    const tavilyPayload: Record<string, unknown> = {
        api_key: env.TAVILY_API_KEY,
        query: query.trim(),
        search_depth: "advanced",
    };
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

    // ── Step 6: 成功后扣除 1 信用（使用哈希 Key）─────────────
    await deductCredit(env.UNISKILL_KV, tokenHash, credits);

    // ── Step 7: 透传 Tavily 结果，附加 UniSkill 元数据 ────────
    const tavilyData = (await tavilyRes.json()) as Record<string, unknown>;
    const COST = 1;
    const newBalance = credits - COST;

    // 🔥 CRITICAL: Use ctx.waitUntil to avoid delaying the user's response
    // 关键：使用 ctx.waitUntil 确保同步逻辑在后台运行，不影响用户获取 AI 结果的速度
    ctx.waitUntil(
        fetch("https://uniskill-web.vercel.app/api/webhook/sync-credits", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${env.ADMIN_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                hash: tokenHash,
                newBalance: newBalance
            })
        })
    );

    return new Response(
        JSON.stringify({
            ...tavilyData,
            // _uniskill 元数据块：由 buildUniskillMeta 统一构建，便于全局修改
            _uniskill: buildUniskillMeta(COST, newBalance, request),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
    );
}
