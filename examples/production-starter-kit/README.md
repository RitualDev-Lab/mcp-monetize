# 🚀 Production MCP Server Monetization Starter Kit

> Turn any Model Context Protocol (MCP) server into a paid, rate-limited commercial API in under 5 minutes using `@ritualdev-lab/mcp-monetize`, **Dodo Payments**, and **Stripe**.

---

## ⚡ What's Inside

| Feature | Description |
| :--- | :--- |
| **🛡️ Token-Bucket Rate Limiting** | Prevents burst hammering and agent loops with in-memory token buckets (10 burst, 2 refills/sec). |
| **🎁 Free Quota Tier** | Allows every new user 5 complimentary requests before requiring paid credit activation. |
| **💳 Dodo Payments Checkout** | Drop-in hosted checkout links attached to the user's `customer_id` / `userId`. |
| **⚡ Instant Webhook Engine** | Dedicated `webhook-server.ts` listening for `payment.succeeded` and `subscription.active` events with HMAC verification. |
| **💾 Persistent SQLite Storage** | Zero-dependency credit store using Node.js built-in `node:sqlite` (`starter_credits.db`). |
| **🔑 PASETO Capability Tokens** | Sub-millisecond (< 0.2ms) offline cryptographic capability token verification for high-throughput agents. |
| **🔌 Claude Desktop & Cursor Ready** | Exposes standard JSON-RPC 2.0 stdio transport compatible with Claude Desktop, Cursor, and Windsurf. |

---

## 🚀 Quickstart in 60 Seconds

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy the example configuration:
```bash
cp .env.example .env
```

Set your live Dodo Payments API key and product ID:
```env
MCP_MONETIZE_SECRET=fedcba9876543210fedcba9876543210fedcba9876543210
MCP_MONETIZE_SQLITE_PATH=./starter_credits.db
DODO_PRODUCT_ID=pdt_0NrFWlIkkreo5fOBIJWxI
DODO_CHECKOUT_URL=https://checkout.dodopayments.com/buy/pdt_0NrFWlIkkreo5fOBIJWxI
FREE_TIER_CALLS=5
PRICE_LABEL=$5 for 500 requests
```

### 3. Run the End-to-End Simulation
Test the full lifecycle (free calls &rarr; paywall hit &rarr; simulated checkout top-up &rarr; resumed execution):
```bash
npm run demo
```

### 4. Run Unit Tests
```bash
npm test
```

---

## 🛠️ How to Monetize Your Own MCP Tools

Wrap your existing tool handler with `withMcpMonetization`:

```typescript
import { withMcpMonetization, SqliteTokenStore } from "@ritualdev-lab/mcp-monetize";

const store = new SqliteTokenStore("./credits.db", 5); // 5 free calls

// Your existing MCP tool handler
const rawToolHandler = async (args: { query: string }) => {
  return {
    content: [{ type: "text", text: `Results for: ${args.query}` }]
  };
};

// Monetized handler with Dodo Payments checkout
export const monetizedTool = withMcpMonetization(rawToolHandler, {
  provider: "dodo",
  checkoutUrl: (userId) =>
    `https://checkout.dodopayments.com/buy/pdt_YOUR_PRODUCT_ID?customer_id=${encodeURIComponent(userId)}&quantity=1`,
  priceLabel: "$5 for 500 calls",
  freeTierCalls: 5,
  store
});
```

---

## 🌐 Running the Background Webhook Listener

To automatically fulfill credits when customers pay:

```bash
npm run webhook
```

Exposes:
- `POST http://localhost:4001/webhooks/dodo` (configured in Dodo Payments Dashboard)
- `POST http://localhost:4001/webhooks/stripe` (configured in Stripe Dashboard)
- `GET http://localhost:4001/credits/:userId` (inspect current credit balance)

---

## 💻 Claude Desktop & Cursor Integration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "monetized-starter": {
      "command": "npx",
      "args": [
        "-y",
        "tsx",
        "/absolute/path/to/examples/production-starter-kit/server.ts"
      ],
      "env": {
        "MCP_MONETIZE_SQLITE_PATH": "/absolute/path/to/starter_credits.db"
      }
    }
  }
}
```

---

## 📄 License
Apache-2.0 © [RitualDev Lab](https://ritualdev.in)
