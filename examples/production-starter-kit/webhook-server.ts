/**
 * Dedicated Webhook Fulfillment Server for Dodo Payments & Stripe
 *
 * Listens for payment notifications, verifies cryptographic signatures,
 * and atomically tops up user credits in the shared SQLite database.
 */

import * as http from "node:http";
import { PaymentWebhookHandler } from "../../src/webhooks.js";
import { SqliteTokenStore } from "../../src/adapters/sqlite.js";
import { McpCapabilityTokenManager } from "../../src/capability.js";
import type { TokenStore } from "../../src/types.js";

const PORT = Number(process.env.WEBHOOK_PORT || 4001);
const SQLITE_PATH = process.env.MCP_MONETIZE_SQLITE_PATH || "./starter_credits.db";
const DODO_SECRET = process.env.DODO_WEBHOOK_SECRET || "whsec_sample_secret";
const STRIPE_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "whsec_sample_stripe";
const CAPABILITY_SECRET =
  process.env.MCP_MONETIZE_SECRET || "fedcba9876543210fedcba9876543210fedcba9876543210";

export function createWebhookServer(options?: {
  store?: TokenStore;
  port?: number;
  dodoSecret?: string;
  stripeSecret?: string;
}) {
  const store = options?.store || new SqliteTokenStore(SQLITE_PATH, 5);
  const capabilityManager = new McpCapabilityTokenManager(CAPABILITY_SECRET);

  const webhookHandler = new PaymentWebhookHandler({
    store,
    dodoWebhookSecret: options?.dodoSecret || DODO_SECRET,
    stripeWebhookSecret: options?.stripeSecret || STRIPE_SECRET,
    capabilityManager
  });

  const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = parsedUrl.pathname;

    const sendJson = (status: number, data: any) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data, null, 2));
    };

    // Health check
    if (pathname === "/health" && req.method === "GET") {
      return sendJson(200, {
        status: "healthy",
        service: "mcp-monetize-webhook-server",
        storage: SQLITE_PATH,
        endpoints: [
          "POST /webhooks/dodo",
          "POST /webhooks/stripe",
          "GET /credits/:userId"
        ]
      });
    }

    // Inspect user credits
    if (pathname.startsWith("/credits/") && req.method === "GET") {
      const userId = decodeURIComponent(pathname.replace("/credits/", ""));
      const user = store.getUser(userId);
      return sendJson(200, user);
    }

    // Dodo Payments Webhook
    if (pathname === "/webhooks/dodo" && req.method === "POST") {
      let rawBody = "";
      req.on("data", (chunk) => { rawBody += chunk; });
      req.on("end", async () => {
        try {
          const sigHeader =
            (req.headers["webhook-signature"] as string) ||
            (req.headers["x-dodo-signature"] as string);

          const payload = JSON.parse(rawBody || "{}");
          const result = await webhookHandler.handleDodoWebhook(payload, sigHeader, rawBody);

          return sendJson(result.success ? 200 : 400, result);
        } catch (err: any) {
          return sendJson(400, { success: false, error: `Invalid webhook payload: ${err.message}` });
        }
      });
      return;
    }

    // Stripe Webhook
    if (pathname === "/webhooks/stripe" && req.method === "POST") {
      let rawBody = "";
      req.on("data", (chunk) => { rawBody += chunk; });
      req.on("end", async () => {
        try {
          const sigHeader = req.headers["stripe-signature"] as string;
          const payload = JSON.parse(rawBody || "{}");
          const result = await webhookHandler.handleStripeWebhook(payload, sigHeader, rawBody);

          return sendJson(result.success ? 200 : 400, result);
        } catch (err: any) {
          return sendJson(400, { success: false, error: `Invalid webhook payload: ${err.message}` });
        }
      });
      return;
    }

    return sendJson(404, { error: "Route not found" });
  });

  return { server, webhookHandler, store };
}

// Auto-listen if executed directly
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  const { server } = createWebhookServer();
  server.listen(PORT, () => {
    console.log(`\n💳 [MCP Monetize Webhook Listener] Online at http://localhost:${PORT}`);
    console.log(`   Dodo Webhook:   http://localhost:${PORT}/webhooks/dodo`);
    console.log(`   Stripe Webhook: http://localhost:${PORT}/webhooks/stripe`);
    console.log(`   Health Check:   http://localhost:${PORT}/health\n`);
  });
}
