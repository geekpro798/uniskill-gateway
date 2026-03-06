// src/index.ts
// Logic: Gateway entry point using key-based authentication
// 职责：环境类型声明 + 请求路由分发 + 全局中间件（统一鉴权与平台化执行）

import { hashKey } from "./utils/auth";
import { SkillKeys } from "./utils/skill-keys";
import { executeSkill } from "./engine/executor"; // 逻辑：引入核心执行引擎

// ── 环境变量类型声明 ──────────────────────────────────────────
export interface Env {
  UNISKILL_KV: KVNamespace;
  TAVILY_API_KEY: string; // 逻辑：与 executor.ts 和 .dev.vars 中的命名严格对齐
  JINA_API_KEY: string;
  NEWS_API_KEY: string;
  ADMIN_KEY: string;
  VERCEL_WEBHOOK_URL: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}

// Logic: Centralized CORS headers to prevent cross-origin errors on failure
// 逻辑：集中管理 CORS 头，防止失败响应时出现跨域错误掩盖真实状态码
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    // ── Preflight: Handle CORS ──
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // ── Step 1: Extract 'key' from Header ──
    // 逻辑：从 Authorization 头中提取原始 key
    const authHeader = request.headers.get("Authorization") || "";
    const rawKey = authHeader.replace("Bearer ", "").trim();

    if (!rawKey.startsWith("us-")) {
      return new Response("Invalid Key Format", { status: 401, headers: corsHeaders });
    }

    // ── Step 2: Generate key_hash for Storage Lookup ──
    // 逻辑：生成 key 的 SHA-256 哈希值，用于 KV 查询
    const keyHash = await hashKey(rawKey);

    // ── Step 3: Resolve Skill with Priority ──
    let body: any;
    try {
      body = await request.json();
    } catch {
      return new Response("Invalid JSON Body", { status: 400, headers: corsHeaders });
    }

    // 逻辑：不仅提取技能名，还要提取传给技能的具体参数 params
    const { skillName, params } = body;
    if (!skillName) {
      return new Response("Missing skillName in request body", { status: 400, headers: corsHeaders });
    }

    // 1. Try Private Vault
    let skillRaw = await env.UNISKILL_KV.get(SkillKeys.private(keyHash, skillName));

    // 2. Fallback to Official
    if (!skillRaw) {
      skillRaw = await env.UNISKILL_KV.get(SkillKeys.official(skillName));
    }

    if (!skillRaw) return new Response("Skill Not Found", { status: 404, headers: corsHeaders });

    // ── Step 4: Billing Check (The Bouncer) ──
    // 逻辑：执行前核对积分余额
    const creditKey = SkillKeys.credits(keyHash);
    let currentCreditsStr = await env.UNISKILL_KV.get(creditKey);
    let currentCredits = currentCreditsStr ? parseInt(currentCreditsStr, 10) : 0;

    // 逻辑：动态计算成本：Scrape 扣 20，Search/News 扣 10，其余扣 1
    let skillCost = 1;
    if (skillName === "uniskill_search" || skillName === "uniskill_news" || skillName === "news") {
      skillCost = 10;
    } else if (skillName === "uniskill_scrape" || skillName === "scrape") {
      skillCost = 20;
    }

    // 逻辑：如果积分不足以支付本次调用成本，返回 402 Payment Required 状态码
    if (currentCredits < skillCost) {
      return new Response(`Insufficient Credits. This skill costs ${skillCost}, but you have ${currentCredits}.`, { status: 402, headers: corsHeaders });
    }

    // ── Step 5: Engine Execution (The Muscle) ──
    // 逻辑：将解析好的 Markdown 规约、AI 参数和环境变量喂给引擎
    const executionResult = await executeSkill(skillRaw, params || {}, env);

    // ── Step 6: Post-Execution Billing ──
    // 逻辑：执行成功后，按照成本扣除积分并写回 KV
    await env.UNISKILL_KV.put(creditKey, (currentCredits - skillCost).toString());

    // 逻辑：返回引擎执行的结果（可能是清洗后的 Markdown，也可能是透传的 JSON）
    return new Response(executionResult, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json" // 根据您实际返回的数据类型，也可以是 text/markdown
      }
    });
  }
};
