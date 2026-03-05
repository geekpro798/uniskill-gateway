// ============================================================
// src/utils/auth.ts
// 鉴权工具：负责提取和初步验证 Bearer key，以及 Key 哈希化
// ============================================================

/**
 * Extracts the Bearer key from the Authorization header.
 * Expected format: "Authorization: Bearer us-xxxx"
 * Returns null if the header is missing or malformed.
 */
export function extractBearerKey(request: Request): string | null {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return null;
    }
    // 去掉 "Bearer " 前缀，获取原始 key 字符串
    return authHeader.slice(7).trim();
}

/**
 * Validates that a key follows the UniSkill key format: must start with "us-".
 */
export function isValidKeyFormat(key: string): boolean {
    return key.startsWith("us-") && key.length > 5;
}

/**
 * Returns a masked version of the key for safe logging (e.g. "us-test****").
 */
export function maskKey(key: string): string {
    return key.slice(0, 8) + "****";
}

/**
 * Returns the SHA-256 hex digest of a raw key string.
 * This is the value used as the KV key — the raw key is NEVER persisted.
 *
 * 安全原则：KV 中仅存储哈希，即便数据库泄露也无法反推原始 Key。
 */
export async function hashKey(rawKey: string): Promise<string> {
    const data = new TextEncoder().encode(rawKey);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}
