// src/routes/notify.ts
// Native handler for uniskill_notify
// Stores notification in KV; polled by local notify-daemon.sh

import { corsHeaders } from "../utils/response";
import type { Env } from "../index";

const NOTIFY_KV_PREFIX = "user:notify:";

export async function handleNotify(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    }

    let body: any;
    try { body = await request.json(); } catch {
        return new Response(JSON.stringify({ error: "Invalid JSON" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }

    const title = String(body.title || "UniSkill").slice(0, 128).replace(/["\\]/g, '');
    const bodyText = String(body.body || body.message || "").slice(0, 256).replace(/["\\]/g, '');
    const userUid = (body.user_uid as string) || (request as any)._uniskill_user_uid || "unknown";
    console.log(`[Notify] Writing KV key: ${NOTIFY_KV_PREFIX}${userUid}`);

    await env.UNISKILL_KV.put(
        `${NOTIFY_KV_PREFIX}${userUid}`,
        JSON.stringify({ title, body: bodyText, timestamp: Date.now() }),
        { expirationTtl: 60 }
    );

    return new Response(JSON.stringify({
        success: true,
        message: `通知「${title}」已推送`,
        notification: { title, body: bodyText }
    }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
}

export async function handleNotifyPoll(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const userUid = url.searchParams.get("user_uid");
    if (!userUid) {
        return new Response(JSON.stringify({ error: "Missing user_uid" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }

    const kvKey = `${NOTIFY_KV_PREFIX}${userUid}`;
    const raw = await env.UNISKILL_KV.get(kvKey);
    if (!raw) {
        return new Response("null", {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }

    await env.UNISKILL_KV.delete(kvKey);
    return new Response(raw, {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
}
