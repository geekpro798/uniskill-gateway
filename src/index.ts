// ============================================================
// src/index.ts — UniSkill Gateway Entry Point
// 职责：环境类型声明 + 请求路由分发（保持精简，业务逻辑下沉各模块）
// ============================================================

import { extractBearerToken, isValidTokenFormat } from "./utils/auth.ts";
import { errorResponse } from "./utils/response.ts";
import { handleSearch } from "./routes/search.ts";
import { handleProvision } from "./routes/admin.ts";

// ── 环境变量类型声明（与 wrangler.toml bindings 一一对应）──
export interface Env {
  /** KV 命名空间：存储 token → 信用额度映射 */
  UNISKILL_KV: KVNamespace;
  /** Tavily API Key，通过 Cloudflare Secret 注入，不进源码 */
  TAVILY_API_KEY: string;
  /** Admin 共享密钥，通过 Cloudflare Secret 注入，供 Vercel 后端调用 */
  ADMIN_KEY: string;
}

// ── 路由表：路径 → 处理函数 ──────────────────────────────────
// 扩展新技能路由时，只需在此处添加条目（路径使用 /v1/ 前缀做版本管理）
const ROUTES: Record<string, (req: Request, env: Env, token: string, ctx: ExecutionContext) => Promise<Response>> = {
  "/v1/search": handleSearch,
};

// ── 业务请求处理器 ─────────────────────────────────────────────
async function handleUserRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const { method, url } = request;
  const { pathname } = new URL(url);

  // ── 1. 全局鉴权：提取并校验 Bearer token 格式 ────────────
  const token = extractBearerToken(request);
  if (!token || !isValidTokenFormat(token)) {
    return errorResponse(
      "Missing or invalid Authorization header. Expected: Bearer us-xxxx",
      401
    );
  }

  // ── 2. 仅允许 POST 请求进入技能路由 ─────────────────────
  if (method !== "POST") {
    return errorResponse(`Method ${method} not allowed. Use POST.`, 405);
  }

  // ── 3. 路由分发 ──────────────────────────────────────────
  const handler = ROUTES[pathname];
  if (!handler) {
    return errorResponse(
      `Route ${pathname} not found. Available: ${Object.keys(ROUTES).join(", ")}`,
      404
    );
  }

  // ── 4. 执行对应路由处理器 ────────────────────────────────
  return handler(request, env, token, ctx);
}

// ── 主 Fetch 处理器 ───────────────────────────────────────────
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // 0. 健康检查：无需鉴权，供 uptime 监控使用
    if (url.pathname === "/") {
      return new Response(
        JSON.stringify({ status: "ok", service: "UniSkill Gateway" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // 1. Admin Area: For Vercel to sync credits
    // 管理区域：供 Vercel 同步积分
    if (url.pathname === "/admin/provision" || url.pathname === "/v1/admin/provision") {
      const authHeader = request.headers.get("Authorization");
      // Validate against the secret set in Wrangler
      // 校验是否与 Wrangler 中设置的暗号一致
      if (authHeader !== `Bearer ${env.ADMIN_KEY}`) {
        return new Response("Unauthorized Admin", { status: 401 });
      }
      if (request.method !== "POST") {
        return errorResponse(`Method ${request.method} not allowed. Use POST.`, 405);
      }
      return handleProvision(request, env);
    }

    // 2. User Area: For API consumption
    // 业务区域：供 API 实际使用
    return handleUserRequest(request, env, ctx);
  },
};
