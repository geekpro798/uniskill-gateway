// ============================================================
// src/routes/admin.ts
// 管理端签发接口：供受信任的后端（如 Vercel）调用，生成 Key 并注入信用
// ============================================================

import { hashKey } from "../utils/auth.ts";
import { GATEWAY_VERSION } from "../utils/response.ts";
import type { Env } from "../index.ts";

// 默认签发的初始信用点数
const DEFAULT_INITIAL_CREDITS = 50;

// ── Step 1: 鉴权已在 index.ts 统一处理 ───────────────────
import { SkillKeys } from "../utils/skill-keys.ts";

/**
 * Handles POST /v1/admin/provision
 * Called by a trusted backend (e.g. Vercel) to create a new UniSkill API key.
 */
export async function handleProvision(request: Request, env: Env): Promise<Response> {
    // ... (鉴权已在入口 index.ts 完成)

    // ── Step 2: 解析请求体 ───────────────────────────────
    let initialCredits = DEFAULT_INITIAL_CREDITS;
    let providedHash: string | undefined = undefined;
    let userTier = "FREE";

    try {
        const body = await request.json() as any;
        if (body.credits) initialCredits = Number(body.credits);
        if (body.hash) providedHash = body.hash;
        if (body.tier) userTier = body.tier.toUpperCase();
    } catch { /* ignore */ }

    // ── Step 3: 确定 Hash ───────────────────────────────
    let rawKey: string | undefined = undefined;
    let keyHash: string;

    if (providedHash) {
        keyHash = providedHash;
    } else {
        rawKey = `us-${crypto.randomUUID()}`;
        keyHash = await hashKey(rawKey);
    }

    // ── Step 4: 写入 KV（使用平台化标准 Key）───────────────
    // 逻辑：写入积分，Key 必须符合 user:credits:{hash} 格式
    await env.UNISKILL_KV.put(SkillKeys.credits(keyHash), String(initialCredits));

    // 逻辑：写入档位，Key 符合 tier:{hash} 格式
    await env.UNISKILL_KV.put(SkillKeys.tier(keyHash), userTier);

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
