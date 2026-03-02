// ============================================================
// src/utils/billing.ts
// 计费工具：负责 KV 中信用额度的查询与扣减
//
// ⚠️ 安全变更：KV 的 Key 为 token 的 SHA-256 哈希值，不存原始 token
//    调用方须先通过 hashToken() 计算哈希，再传入此模块。
// ============================================================

/**
 * Reads the current credit balance for a token hash from KV.
 * KV schema: key = SHA-256(rawToken), value = integer string (e.g. "10")
 *
 * 参数 tokenHash 必须是已哈希的值（由 hashToken() 产生）。
 * Returns:
 *  -1  → hash not found in KV (token invalid or never provisioned)
 *   0  → token exists but has no remaining credits
 *  >0  → available credits
 */
export async function getCredits(kv: KVNamespace, tokenHash: string): Promise<number> {
    const raw = await kv.get(tokenHash);
    // hash 不存在时返回 -1，区分"无效 token"和"零余额"
    if (raw === null) return -1;
    const credits = parseInt(raw, 10);
    return isNaN(credits) ? 0 : credits;
}

/**
 * Deducts exactly 1 credit from the token hash's balance and persists it back to KV.
 * NOTE: Cloudflare KV does not support atomic decrement; this is a best-effort write.
 *       For high-concurrency production use, consider Durable Objects instead.
 *
 * 参数 tokenHash 必须是已哈希的值（由 hashToken() 产生）。
 */
export async function deductCredit(
    kv: KVNamespace,
    tokenHash: string,
    currentCredits: number
): Promise<void> {
    // 将新余额写回 KV
    await kv.put(tokenHash, String(currentCredits - 1));
}
