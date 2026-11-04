# 💳 mcp-monetize

> **Drop-in billing, credit tracking, and paywall middleware for Model Context Protocol (MCP) servers.**  
> Monetize your AI agent tools in 3 lines of code with [Dodo Payments](https://dodopayments.com) & Stripe.

[![npm version](https://img.shields.io/badge/npm-v0.1.0-blue.svg)](https://npmjs.com/package/mcp-monetize)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![MCP Compatible](https://img.shields.io/badge/MCP-1.0%2B-purple.svg)](https://modelcontextprotocol.io)

---

## ⚡ The Problem

Developers are publishing thousands of Model Context Protocol (MCP) servers for Claude Desktop, Cursor, and Windsurf. But until now:
- There was **no standard way to charge users** per tool invocation or per month.
- Tool creators bear the heavy server, LLM API, and scraping costs while users consume unlimited queries for free.

`mcp-monetize` solves this by giving MCP server creators an effortless 3-line drop-in middleware that manages quotas, verifies credits, and returns interactive payment links directly inside the agent chat when quotas run out.

---

## 🚀 Quickstart (3 Lines of Code)

### 1. Install
```bash
npm install mcp-monetize
# or
pnpm add mcp-monetize
```

### 2. Wrap your MCP tool handler

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { withMcpMonetization } from "mcp-monetize";
import { z } from "zod";

const server = new McpServer({ name: "market-oracle", version: "1.0.0" });

server.tool(
  "query_stock_valuation",
  { ticker: z.string() },
  withMcpMonetization(
    async ({ ticker }) => {
      const data = await fetchValuation(ticker);
      return { content: [{ type: "text", text: `Valuation for ${ticker}: $142.50` }] };
    },
    {
      // Your Dodo Payments or Stripe payment link
      checkoutUrl: "https://checkout.dodopayments.com/buy/pdt_0NpjONGugY5QkrFDUaPva",
      priceLabel: "$5 for 1,000 queries",
      freeTierCalls: 5 // 5 free queries for every new user
    }
  )
);
```

---

## 🖼️ How the Agent Sees the Paywall

When a user in **Claude Desktop**, **Cursor**, or **Windsurf** exhausts their free calls, the agent automatically receives structured markdown prompting the user to top up:

```markdown
🔒 Usage Limit Reached for `query_stock_valuation`

Your complimentary tool credits have been exhausted. To continue executing queries with uninterrupted speed:

### 💳 Unlock Instant Access ($5 for 1,000 queries)
👉 [Click Here to Activate / Top-Up Credits via Secure Checkout](https://checkout.dodopayments.com/buy/pdt_xyz)

---
*User Ref: `dev_client_01` • Payments securely powered by Dodo Payments & Stripe.*
```

Once the user completes payment via UPI, Credit Card, or Apple Pay, their webhook or API key activates paid credits and execution resumes seamlessly!

---

## ⚙️ Configuration Options

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `checkoutUrl` | `string \| (userId: string) => string` | **Required** | Dodo Payments product link or Stripe Payment link. Can be dynamic function. |
| `freeTierCalls` | `number` | `5` | Number of free calls given to each new user before paywall triggers. |
| `priceLabel` | `string` | `"$0.05 / call"` | Pricing description displayed inside the paywall message. |
| `provider` | `"dodo" \| "stripe" \| "custom"` | `"dodo"` | Payment provider tag. |
| `store` | `TokenStore` | `MemoryTokenStore` | Storage engine (`MemoryTokenStore` or `JsonFileTokenStore`). |
| `getUserId` | `(args, extra) => string` | Automatic | Custom function to extract workspace or user ID. |
| `customPaywallMessage`| `(info) => string` | Standard template | Optional custom paywall markdown generator. |

---

## 💾 Storage Adapters

### 1. In-Memory (Default)
Fastest, zero-dependency. Great for local desktop tools.
```typescript
import { MemoryTokenStore } from "mcp-monetize";
const store = new MemoryTokenStore(5);
```

### 2. SQLite Database Persistence
Built-in `node:sqlite` store with zero native dependencies. Supports thread-safe transactions and atomic balances.
```typescript
import { SqliteTokenStore } from "mcp-monetize/adapters/sqlite";
const store = new SqliteTokenStore("./data/mcp-credits.sqlite", 10);
```

### 3. Serverless Redis / Upstash
Designed for cloud-hosted MCP servers (Render, Fly.io, Railway, AWS Lambda).
```typescript
import { RedisTokenStore } from "mcp-monetize/adapters/redis";
const store = new RedisTokenStore({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  defaultFreeCredits: 10
});
```

### 4. JSON File Persistence
Zero database dependencies; persists user credits across server restarts in `mcp-credits.json`.
```typescript
import { JsonFileTokenStore } from "mcp-monetize";
const store = new JsonFileTokenStore("./data/credits.json", 10);
```

---

## 🤝 Webhook Fulfillment Engine (Turnkey Dodo & Stripe)

Use the built-in `PaymentWebhookHandler` to process checkouts and replenish user credits automatically:

```typescript
import { PaymentWebhookHandler, SqliteTokenStore } from "mcp-monetize";

const store = new SqliteTokenStore("./data/tokens.sqlite");
const webhooks = new PaymentWebhookHandler({
  store,
  dodoWebhookKey: process.env.DODO_PAYMENTS_WEBHOOK_KEY,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET
});

// In your Express or Fastify server:
app.post("/api/webhooks/dodo", async (req, res) => {
  const result = await webhooks.handleDodoWebhook(req.body, req.headers["x-dodo-signature"]);
  res.status(result.success ? 200 : 400).json(result);
});
```

---

## 🔐 Cryptographic License Key Verification

For off-line or client-side MCP distribution (where users supply a license key in `claude_desktop_config.json`):

```typescript
import { McpLicenseValidator } from "mcp-monetize";

const validator = new McpLicenseValidator("your_hmac_secret_key_min_32_chars");

// Issue a 30-day license key:
const token = validator.generateLicenseKey("user_456", 30);

// Verify inside your tool:
const check = validator.verifyLicense(token);
if (check.valid) {
  console.log(`Verified user ${check.userId}, expires: ${check.expiresAt}`);
}
```

---

## 📦 Turnkey Starter Kit & Production Examples

Looking for ready-to-deploy boilerplates? Check the `examples/` directory:
1. `examples/01-weather-api-server.ts` — Pay-per-query API ($5 for 500 calls).
2. `examples/02-sql-agent-server.ts` — Monthly recurring subscription with HMAC license verification.
3. `examples/03-web-scraper-server.ts` — Usage credits with turnkey Dodo checkout webhook.

👉 **Get the complete package with instant setup at [ritualdev.in/mcp-starter-kit](https://ritualdev.in/mcp-starter-kit)**.

---

## 📜 License
MIT © [RitualDev Lab](https://ritualdev.in)
