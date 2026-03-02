# UniSkill Gateway

> **The Zero-Config AI Tool Layer.** Give your agent a token — it gets enterprise-grade web search, billing, and rate-limiting out of the box.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/your-org/uniskill-gateway)

---

## The Problem

Building AI agents is hard enough. Managing API keys, billing users, enforcing rate limits, and maintaining provider integrations shouldn't be your problem too.

Agents need tools. Tools need keys. Keys need billing. Billing needs infrastructure.

**UniSkill collapses that entire stack into a single HTTP call.**

---

## What is UniSkill Gateway?

UniSkill is a **managed API gateway for AI Agents**, built on Cloudflare's global edge network. It gives every agent a single `Bearer us-xxxx` token that unlocks a growing library of AI tools — no per-tool API key management, no infrastructure, no configuration.

```
Your Agent  ──►  POST /v1/search  ──►  UniSkill Gateway  ──►  Tavily (Advanced)
                 Authorization: Bearer us-xxxx
```

UniSkill handles:

- ✅ **Authentication** — one token per agent, validated at the edge
- ✅ **Credit billing** — prepaid credits stored in Cloudflare KV, deducted per successful call
- ✅ **Provider key pooling** — enterprise API keys managed by UniSkill, not your agents
- ✅ **Failure safety** — credits are never deducted on upstream errors

---

## Zero-Config Value Proposition

Traditional agent tool setup requires your team to:

| Task | Traditional | UniSkill |
|------|-------------|----------|
| Obtain a search API key | Sign up, verify, get approved | ✅ Included |
| Handle billing per user | Build billing system | ✅ Credit-based, built-in |
| Manage rate limits | Custom middleware | ✅ Handled at gateway |
| Rotate or secure keys | DevOps overhead | ✅ Cloudflare Secrets |
| Add a new tool | New integration, new key | ✅ One-line route addition |

**Your agent makes one POST request. UniSkill handles everything else.**

---

## Quickstart

### 1. Get a UniSkill Token

Tokens are issued in the format `us-xxxx`. To provision one for local testing:

```bash
npx wrangler kv:key put --binding=UNISKILL_KV "us-myagent01" "100"
```

### 2. Call a Skill

```bash
curl -X POST https://your-gateway.workers.dev/v1/search \
  -H "Authorization: Bearer us-myagent01" \
  -H "Content-Type: application/json" \
  -d '{"query": "latest breakthroughs in agentic AI 2025"}'
```

### 3. Check Your Balance in the Response

Every response includes a `_uniskill` metadata block:

```json
{
  "results": [ ...search results... ],
  "_uniskill": {
    "credits_used": 1,
    "credits_remaining": 99,
    "token_prefix":  "us-myage****"
  }
}
```

---

## API Reference

### `GET /`

Health check. No authentication required.

**Response:** `{ "status": "ok", "service": "UniSkill Gateway" }`

---

### `POST /v1/search`

Proxies a web search to Tavily using a pooled enterprise key with `advanced` depth by default.

**Headers**

| Header | Required | Value |
|--------|----------|-------|
| `Authorization` | ✅ | `Bearer us-xxxx` |
| `Content-Type` | ✅ | `application/json` |

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | `string` | ✅ | The search query |
| `search_depth` | `"basic" \| "advanced"` | ❌ | Defaults to `"advanced"` |
| `max_results` | `number` | ❌ | Max results to return |
| `include_answer` | `boolean` | ❌ | Include AI-generated answer |
| `include_domains` | `string[]` | ❌ | Restrict to these domains |
| `exclude_domains` | `string[]` | ❌ | Exclude these domains |

**Error Codes**

| Status | Meaning |
|--------|---------|
| `400` | Bad request or missing `query` |
| `401` | Missing, malformed, or unknown token |
| `402` | Insufficient credits |
| `404` | Skill route not found |
| `405` | Method not allowed |
| `502` | Upstream provider error (no credit deducted) |

---

## Project Structure

```
uniskill-gateway/
├── src/
│   ├── index.ts           # Entry point & route table
│   ├── routes/
│   │   └── search.ts      # POST /v1/search → Tavily proxy
│   └── utils/
│       ├── auth.ts        # Token extraction & validation
│       ├── billing.ts     # KV credit read & deduction
│       └── response.ts    # Shared JSON response helpers
├── wrangler.toml          # Cloudflare Workers config
├── tsconfig.json
└── package.json
```

---

## Self-Hosting

### Prerequisites
- Node.js ≥ 18
- A [Cloudflare account](https://dash.cloudflare.com)
- A [Tavily API key](https://tavily.com)

### Deploy in 3 Steps

```bash
# 1. Create KV namespaces
npx wrangler kv:namespace create UNISKILL_KV
npx wrangler kv:namespace create UNISKILL_KV --preview
# → Paste the returned IDs into wrangler.toml

# 2. Set your Tavily key as a secret (never stored in source)
npx wrangler secret put TAVILY_API_KEY

# 3. Deploy
npm run deploy
```

### Local Development

```bash
# Create .dev.vars in project root
echo "TAVILY_API_KEY=tvly-xxxxxxxxxxxxxxxxxxxx" > .dev.vars

npm run dev   # Starts at http://localhost:8787
```

---

## Extending UniSkill — Adding a New Skill

UniSkill is designed to grow. Adding a new tool takes two steps:

**1.** Create `src/routes/<skill>.ts`:

```typescript
import type { Env } from "../index.ts";

export async function handleSkill(
  request: Request,
  env: Env,
  token: string
): Promise<Response> {
  // your skill logic here
}
```

**2.** Register it in `src/index.ts`:

```typescript
const ROUTES = {
  "/v1/search": handleSearch,
  "/v1/<skill>": handleSkill,   // ← one line
};
```

Billing, auth, and routing are handled automatically.

---

## Roadmap

- [ ] `POST /v1/scrape` — URL content extraction
- [ ] `POST /v1/reason` — LLM reasoning with managed keys
- [ ] Admin dashboard — credit top-up and usage analytics
- [ ] Webhook-based credit alerts

---

## License

MIT © UniSkill
