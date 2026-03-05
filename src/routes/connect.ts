// ============================================================
// src/routes/connect.ts
// 基础连接器：处理 POST /v1/connect，作为透明代理并扣除 1 积分
// ============================================================

import { getCredits, deductCredit } from "../utils/billing.ts";
import { hashToken } from "../utils/auth.ts";
import { errorResponse, buildUniskillMeta } from "../utils/response.ts";
import type { Env } from "../index.ts";

// 本技能的信用消耗量（每次请求扣 1 点）
const CONNECT_COST = 1;

/**
 * Handles POST /v1/connect
 * Flow: credit check → proxy fetch → credit deduction → return original response
 *
 * Request body: { "url": "...", "method": "...", "headers": {}, "data": {} }
 */
export async function handleConnect(
    request: Request,
    env: Env,
    token: string,
    ctx: ExecutionContext
): Promise<Response> {

    // ── Step 1: 对原始 Token 做 SHA-256 哈希，再用哈希值查询 KV 信用余额 ─────
    const tokenHash = await hashToken(token);
    const credits = await getCredits(env.UNISKILL_KV, tokenHash);

    if (credits === -1) {
        return errorResponse("Invalid API token.", 401);
    }
    if (credits <= 0) {
        return errorResponse("Insufficient credits. Please top up your account.", 402);
    }

    // ── Step 2: 解析请求体，验证必填的 url 字段 ────────────
    let body: any;
    try {
        body = await request.json();
    } catch {
        return errorResponse("Invalid JSON body.", 400);
    }

    const { url, method, headers: targetHeaders, data } = body;

    if (!url || typeof url !== "string") {
        return errorResponse('Request body must include a valid "url" field.', 400);
    }

    // ── Step 3: 执行代理请求 ─────────────────────────────
    let proxyResponse: Response;
    try {
        proxyResponse = await fetch(url, {
            method: method || "GET",
            headers: targetHeaders || {},
            body: (method && method !== "GET" && data) ? JSON.stringify(data) : null,
        });
    } catch (error: any) {
        // 网络层错误，不扣信用
        return errorResponse(`Failed to reach target URL: ${error.message}`, 502);
    }

    // ── Step 4: 成功后在后台异步扣除信用，并同步到 Supabase ──
    const newBalance = credits - CONNECT_COST;
    ctx.waitUntil(deductCredit(
        env.UNISKILL_KV,
        tokenHash,
        credits,
        CONNECT_COST,
        env.VERCEL_WEBHOOK_URL,
        env.ADMIN_KEY,
        "Basic Connector"
    ));

    // ── Step 5: 返回原始响应 ─────────────────────────────
    // 我们在此处透传原始响应，并注入 UniSkill 元数据头（非 Body 注入，以保持透明性）
    const responseHeaders = new Headers(proxyResponse.headers);
    const meta = buildUniskillMeta(CONNECT_COST, newBalance, request);
    responseHeaders.set("X-UniSkill-Consumed", CONNECT_COST.toString());
    responseHeaders.set("X-UniSkill-Balance", newBalance.toString());
    responseHeaders.set("X-UniSkill-Request-ID", String(meta.request_id));

    return new Response(proxyResponse.body, {
        status: proxyResponse.status,
        headers: responseHeaders,
    });
}
