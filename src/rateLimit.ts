// ============================================================
// src/utils/rate-limit.ts
// 动态限流工具：基于订阅档位实现 RPM（每分钟请求数）限制
// ============================================================

/**
 * 档位限速配置 (Requests Per Minute)
 */
export const TIER_CONFIG: Record<string, number> = {
    FREE: 30,
    STARTER: 60,
    PRO: 300,
    SCALE: 1000,
};

export interface RateLimitResult {
    isAllowed: boolean;
    currentUsage: number;
    limit: number;
    remaining: number;
}

/**
 * 核心逻辑：使用 Cloudflare KV 实现固定窗口限流
 */
export async function checkRateLimit(
    key: string,
    userTier: string,
    env: any
): Promise<RateLimitResult> {
    // 1. 确定限速阈值
    const tier = userTier.toUpperCase();
    const limit = TIER_CONFIG[tier] || TIER_CONFIG.FREE;

    // 2. 使用当前分钟作为时间桶
    const currentMinute = Math.floor(Date.now() / 60000);
    const storageKey = `ratelimit:${key}:${currentMinute}`;

    // 3. 读取当前请求计数
    const kvValue = await env.UNISKILL_KV.get(storageKey);
    const usageCount = kvValue ? parseInt(kvValue, 10) : 0;

    // 4. 判断是否超限
    if (usageCount >= limit) {
        return {
            isAllowed: false,
            currentUsage: usageCount,
            limit,
            remaining: 0,
        };
    }

    // 5. 增加计数并设置 2 分钟 TTL
    const newUsage = usageCount + 1;
    await env.UNISKILL_KV.put(storageKey, newUsage.toString(), { expirationTtl: 120 });

    return {
        isAllowed: true,
        currentUsage: newUsage,
        limit,
        remaining: limit - newUsage,
    };
}
