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

### 2. JSON File Persistence
Zero database dependencies; persists user credits across server restarts in `mcp-credits.json`.
```typescript
import { JsonFileTokenStore } from "mcp-monetize";
const store = new JsonFileTokenStore("./data/credits.json", 10);
```

---

## 🤝 Webhook Integration (Dodo Payments & Stripe)

When a customer pays, replenish their credits via your API or webhook:

```typescript
import { store } from "./server.js";

app.post("/webhook/dodo", async (req, res) => {
  const event = req.body;
  if (event.type === "payment.succeeded") {
    const customerId = event.data.customer.customer_id;
    const creditsPurchased = event.data.metadata.credits || 1000;

    store.addPaidCredits(customerId, creditsPurchased);
    console.log(`Credited ${creditsPurchased} calls to ${customerId}`);
  }
  res.sendStatus(200);
});
```

---

## 📜 License
MIT © [RitualDev Lab](https://ritualdev.in)
