// ============================================================
// src/routes/admin.ts
// 管理端签发接口：供受信任的后端（如 Vercel）调用，生成 Token 并注入信用
// ============================================================

import { hashToken } from "../utils/auth.ts";
import { GATEWAY_VERSION } from "../utils/response.ts";
import type { Env } from "../index.ts";

// 默认签发的初始信用点数
const DEFAULT_INITIAL_CREDITS = 50;

/**
 * Handles POST /v1/admin/provision
 * Called by a trusted backend (e.g. Vercel) to create a new UniSkill API token.
 *
 * Security model:
 *   - X-Admin-Secret must match ADMIN_KEY (injected via Cloudflare Secret).
 *   - The raw token is returned ONCE to the caller and never stored.
 *   - Only the SHA-256 hash is persisted in KV as the lookup key.
 */
export async function handleProvision(request: Request, env: Env): Promise<Response> {

    // ── Step 1: 鉴权已在 index.ts 统一处理 ───────────────────
    // 已通过 Authorization: Bearer {ADMIN_KEY} 验证

    // ── Step 2: 解析可选的请求体参数 ─────────────────────────
    let initialCredits = DEFAULT_INITIAL_CREDITS;
    try {
        const body = await request.json() as Record<string, unknown>;
        if (typeof body.credits === "number" && body.credits > 0) {
            initialCredits = Math.floor(body.credits);
        }
    } catch {
        // 无 body 或解析失败均使用默认值
    }

    // ── Step 3: 生成原始 Token（用户唯一一次看到完整 Key）────
    // crypto.randomUUID() 在 Cloudflare Workers 运行时中原生支持
    const rawToken = `us-${crypto.randomUUID()}`;

    // ── Step 4: 对 Token 进行 SHA-256 哈希 ───────────────────
    // KV 中仅存储哈希值，即便数据库泄露也无法反推原始 Token
    const tokenHash = await hashToken(rawToken);

    // ── Step 5: 将哈希值作为 Key 写入 KV，存储信用额度 ────────
    await env.UNISKILL_KV.put(tokenHash, String(initialCredits));

    // ── Step 6: 返回原始 Token（仅此一次）和元数据 ────────────
    return new Response(
        JSON.stringify({
            success: true,
            raw_token: rawToken,        // 仅返回给前端一次，绝不二次存储
            initial_credits: initialCredits,
            _uniskill: {
                request_id: request.headers.get("cf-ray") ?? crypto.randomUUID(),
                version: GATEWAY_VERSION,
            },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
    );
}
