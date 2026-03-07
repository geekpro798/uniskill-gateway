// src/index.ts
// Logic: Gateway entry point using key-based authentication
// 职责：环境类型声明 + 请求路由分发 + 全局中间件（统一鉴权与平台化执行）

import { hashKey } from "./utils/auth";
import { SkillKeys } from "./utils/skill-keys";
import { executeSkill } from "./engine/executor";
import { handleProvision } from "./routes/admin";
import { handleBasicConnector } from "./routes/basic-connector";
import { errorResponse } from "./utils/response";

// ── 环境变量类型声明 ──────────────────────────────────────────
export interface Env {
  UNISKILL_KV: KVNamespace;
  TAVILY_API_KEY: string;
  JINA_API_KEY: string;
  NEWS_API_KEY: string;
  ADMIN_KEY: string;
  VERCEL_WEBHOOK_URL: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}

// Logic: Centralized CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // ── Preflight: Handle CORS ──
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // ── Route: Admin Provisioning ──
    if (path === "/v1/admin/provision" && request.method === "POST") {
      const authHeader = request.headers.get("Authorization") || "";
      const adminSecret = authHeader.replace("Bearer ", "").trim();
      if (adminSecret !== env.ADMIN_KEY) {
        return errorResponse("Unauthorized Admin Access", 401);
      }
      return handleProvision(request, env);
    }

    // ── Route: Basic Connector (Transparent Proxy) ──
    if (path === "/v1/basic-connector" && request.method === "POST") {
      const authHeader = request.headers.get("Authorization") || "";
      const rawKey = authHeader.replace("Bearer ", "").trim();
      if (!rawKey.startsWith("us-")) {
        return errorResponse("Invalid Key Format", 401);
      }
      return handleBasicConnector(request, env, rawKey, ctx);
    }

    // ── Route: Default Skill Execution (Root POST) ──
    if (path === "/" && request.method === "POST") {
      // ── Step 1: Extract 'key' from Header ──
      const authHeader = request.headers.get("Authorization") || "";
      const rawKey = authHeader.replace("Bearer ", "").trim();

      if (!rawKey.startsWith("us-")) {
        return new Response("Invalid Key Format", { status: 401, headers: corsHeaders });
      }

      const keyHash = await hashKey(rawKey);

      // ── Step 2: Payload Parsing ──
      let body: any;
      try {
        body = await request.json();
      } catch {
        return new Response("Invalid JSON Body", { status: 400, headers: corsHeaders });
      }

      const { skillName, params } = body;
      if (!skillName) {
        return new Response("Missing skillName in request body", { status: 400, headers: corsHeaders });
      }

      // ── Step 3: Resolve Skill ──
      let skillRaw = await env.UNISKILL_KV.get(SkillKeys.private(keyHash, skillName));
      if (!skillRaw) {
        skillRaw = await env.UNISKILL_KV.get(SkillKeys.official(skillName));
      }

      if (!skillRaw) return new Response("Skill Not Found", { status: 404, headers: corsHeaders });

      // ── Step 4: Billing Check ──
      const creditKey = SkillKeys.credits(keyHash);
      let currentCreditsStr = await env.UNISKILL_KV.get(creditKey);
      let currentCredits = currentCreditsStr ? parseInt(currentCreditsStr, 10) : 0;

      let skillCost = 1;
      if (skillName === "uniskill_search" || skillName === "uniskill_news" || skillName === "news") {
        skillCost = 10;
      } else if (skillName === "uniskill_scrape" || skillName === "scrape") {
        skillCost = 20;
      }

      if (currentCredits < skillCost) {
        return new Response(`Insufficient Credits. This skill costs ${skillCost}, but you have ${currentCredits}.`, { status: 402, headers: corsHeaders });
      }

      // ── Step 5: Execution ──
      const executionResult = await executeSkill(skillRaw, params || {}, env);

      // ── Step 6: Post-Execution Billing ──
      await env.UNISKILL_KV.put(creditKey, (currentCredits - skillCost).toString());

      return new Response(executionResult, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }

    // Fallback for undefined routes
    return errorResponse("Not Found", 404);
  }
};
