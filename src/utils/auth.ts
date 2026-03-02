// ============================================================
// src/utils/auth.ts
// 鉴权工具：负责提取和初步验证 Bearer token，以及 Token 哈希化
// ============================================================

/**
 * Extracts the Bearer token from the Authorization header.
 * Expected format: "Authorization: Bearer us-xxxx"
 * Returns null if the header is missing or malformed.
 */
export function extractBearerToken(request: Request): string | null {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return null;
    }
    // 去掉 "Bearer " 前缀，获取原始 token 字符串
    return authHeader.slice(7).trim();
}

/**
 * Validates that a token follows the UniSkill token format: must start with "us-".
 */
export function isValidTokenFormat(token: string): boolean {
    return token.startsWith("us-") && token.length > 5;
}

/**
 * Returns a masked version of the token for safe logging (e.g. "us-test****").
 */
export function maskToken(token: string): string {
    return token.slice(0, 8) + "****";
}

/**
 * Returns the SHA-256 hex digest of a raw token string.
 * This is the value used as the KV key — the raw token is NEVER persisted.
 *
 * 安全原则：KV 中仅存储哈希，即便数据库泄露也无法反推原始 Token。
 */
export async function hashToken(rawToken: string): Promise<string> {
    const data = new TextEncoder().encode(rawToken);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}
