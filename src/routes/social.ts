// ============================================================
// src/routes/social.ts
// 社交技能路由（桩）：处理 POST /v1/social
// 当前版本返回 501 Coming Soon，预留完整接口结构供后续实现
// ============================================================

const SOCIAL_COST = 30;

import type { Env } from "../index.ts";

// 本路由占位符——未来集成社交媒体数据源（如 Twitter/X 或 Reddit API）时在此实现
/**
 * Handles POST /v1/social
 * Currently a stub. Returns 501 Not Implemented with a structured placeholder response.
 *
 * Planned functionality:
 *  - Search Twitter/X, Reddit, or LinkedIn for relevant posts
 *  - Apply credit deduction on successful requests
 *  - Return structured { posts: [...], _uniskill } response
 */
export async function handleSocial(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _request: Request,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _env: Env,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _key: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _ctx: ExecutionContext
): Promise<Response> {
    // 返回结构化的 501 响应，告知 Agent 此技能尚在开发中
    return new Response(
        JSON.stringify({
            success: false,
            coming_soon: true,
            skill: "social",
            planned_cost: SOCIAL_COST,
            message: "The /v1/social skill is under development and not yet available. " +
                "Please check back later or contact support for updates.",
            available_skills: ["/v1/search", "/v1/scrape", "/v1/news"],
        }),
        { status: 501, headers: { "Content-Type": "application/json" } }
    );
}
