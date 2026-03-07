// ============================================================
// src/utils/billing.ts
// 计费工具：负责 KV 中信用额度的查询与扣减，以及回写 Supabase
//
// ⚠️ 安全变更：KV 的 Key 为 key 的 SHA-256 哈希值，不存原始 key
//    调用方须先通过 hashKey() 计算哈希，再传入此模块。
// ============================================================

/**
 * Reads the current credit balance for a key hash from KV.
 * KV schema: key = SHA-256(rawKey), value = integer string (e.g. "10")
 *
 * 参数 keyHash 必须是已哈希的值（由 hashKey() 产生）。
 * Returns:
 *  -1  → hash not found in KV (key invalid or never provisioned)
 *   0  → key exists but has no remaining credits
 *  >0  → available credits
 */
export async function getCredits(kv: KVNamespace, keyHash: string): Promise<number> {
    const raw = await kv.get(keyHash);
    // hash 不存在时返回 -1，区分"无效 key"和"零余额"
    if (raw === null) return -1;
    const credits = parseInt(raw, 10);
    return isNaN(credits) ? 0 : credits;
}

/**
 * Pushes the new credit balance back to Supabase via the Vercel Webhook.
 * Also sends skillName so the webhook can insert a credit_events row.
 * Fire-and-forget: failures are logged but silently swallowed.
 *
 * 将扣减后的新余额通过 Vercel Webhook 同步到 Supabase，同时传递技能名以便写入 credit_events 表。
 */
async function syncToSupabase(
    webhookUrl: string,
    adminKey: string,
    keyHash: string,
    newBalance: number,
    skillName: string,
    cost: number
): Promise<void> {
    try {
        const res = await fetch(webhookUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                // Logic: Vercel expects X-Admin-Secret for secure webhook sync
                "X-Admin-Secret": adminKey,
            },
            // 新增 skillName 和 amount 字段，供 Webhook 写入 credit_events 表
            body: JSON.stringify({ hash: keyHash, newBalance, skillName, amount: -cost }),
        });
        if (!res.ok) {
            // 记录同步失败的状态码，方便排查
            console.error(`[Sync] Webhook returned ${res.status}: ${await res.text()}`);
        } else {
            console.log(`[Sync] Supabase updated → ...${keyHash.slice(-6)} balance=${newBalance} skill=${skillName}`);
        }
    } catch (err) {
        // 网络层错误（如 DNS 失败）：仅记录，不抛出，避免影响主流程
        console.error("[Sync] Failed to reach Vercel Webhook:", err);
    }
}

/**
 * Deducts `cost` credits from the key hash's balance,
 * persists it to KV, then syncs the new balance to Supabase.
 * skillName is forwarded to the webhook for credit_events logging.
 *
 * 参数 keyHash 必须是已哈希的值（由 hashKey() 产生）。
 * 参数 skillName 为技能名称，传给 Webhook 以写入 credit_events 表。
 */
export async function deductCredit(
    kv: KVNamespace,
    keyHash: string,
    currentCredits: number,
    cost = 1,
    webhookUrl?: string,
    adminKey?: string,
    skillName = "unknown"
): Promise<void> {
    const newBalance = currentCredits - cost;

    // Step 1: 将扣减后的新余额写回 KV（主账本）
    await kv.put(keyHash, String(newBalance));

    // Step 2: 异步回写 Supabase（前端账本），同时传递技能名以写入 credit_events 表
    // 若环境变量未配置，则退化为仅写 KV 的旧行为，不影响现有逻辑
    if (webhookUrl && adminKey) {
        await syncToSupabase(webhookUrl, adminKey, keyHash, newBalance, skillName, cost);
    } else {
        console.warn("[Sync] VERCEL_WEBHOOK_URL or ADMIN_KEY not set. Skipping Supabase sync.");
    }
}
