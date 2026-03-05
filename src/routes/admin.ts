// ============================================================
// src/routes/admin.ts
// 管理端签发接口：供受信任的后端（如 Vercel）调用，生成 Key 并注入信用
// ============================================================

import { hashKey } from "../utils/auth.ts";
import { GATEWAY_VERSION } from "../utils/response.ts";
import type { Env } from "../index.ts";

// 默认签发的初始信用点数
const DEFAULT_INITIAL_CREDITS = 50;

/**
 * Handles POST /v1/admin/provision
 * Called by a trusted backend (e.g. Vercel) to create a new UniSkill API key.
 *
 * Security model:
 *   - X-Admin-Secret must match ADMIN_KEY (injected via Cloudflare Secret).
 *   - The raw key is returned ONCE to the caller and never stored.
 *   - Only the SHA-256 hash is persisted in KV as the lookup key.
 */
export async function handleProvision(request: Request, env: Env): Promise<Response> {

    // ── Step 1: 鉴权已在 index.ts 统一处理 ───────────────────
    // 已通过 Authorization: Bearer {ADMIN_KEY} 验证

    // ── Step 2: 解析可选的请求体参数 ─────────────────────────
    let initialCredits = DEFAULT_INITIAL_CREDITS;
    let providedHash: string | undefined = undefined;
    let userTier = "FREE";

    try {
        const body = await request.json() as Record<string, unknown>;
        if (typeof body.credits === "number" && body.credits > 0) {
            initialCredits = Math.floor(body.credits);
        }
        if (typeof body.hash === "string" && body.hash.length > 0) {
            providedHash = body.hash;
        }
        if (typeof body.tier === "string" && body.tier.length > 0) {
            userTier = body.tier.toUpperCase();
        }
    } catch {
        // 无 body 或解析失败均使用默认值
    }

    // ── Step 3 & 4: 确定要写入的 Hash ────────────────────────
    let rawKey: string | undefined = undefined;
    let keyHash: string;

    if (providedHash) {
        // 核心目标：如果主站传来了 hash，必须使用并只写入这个 hash
        keyHash = providedHash;
    } else {
        // 向后兼容逻辑：如果没有传 hash，则本地生成一个全新的并做哈希
        rawKey = `us-${crypto.randomUUID()}`;
        keyHash = await hashKey(rawKey);
    }

    // ── Step 5: 将哈希值作为 Key 写入 KV，存储信用额度 ────────
    await env.UNISKILL_KV.put(keyHash, String(initialCredits));

    // ── Step 5.5: 存储用户档位信息 ───────────────────────────
    await env.UNISKILL_KV.put(`tier:${keyHash}`, userTier);

    // ── Step 6: 返回原始 Key（仅此一次）和元数据 ────────────
    return new Response(
        JSON.stringify({
            success: true,
            raw_key: rawKey,        // 仅返回给前端一次，绝不二次存储
            initial_credits: initialCredits,
            tier: userTier,
            _uniskill: {
                request_id: request.headers.get("cf-ray") ?? crypto.randomUUID(),
                version: GATEWAY_VERSION,
            },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
    );
}
