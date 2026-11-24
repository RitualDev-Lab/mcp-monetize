import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import * as crypto from "node:crypto";
import { createMonetizedMcpServer, TokenBucketRateLimiter } from "./server.js";
import { createWebhookServer } from "./webhook-server.js";

describe("Production MCP Monetize Starter Kit Suite", () => {
  test("TokenBucketRateLimiter limits rapid burst calls", () => {
    const limiter = new TokenBucketRateLimiter(3, 1);
    assert.strictEqual(limiter.consume("user_1", 2).allowed, true);
    assert.strictEqual(limiter.consume("user_1", 1).allowed, true);
    // Capacity 3 is exhausted
    assert.strictEqual(limiter.consume("user_1", 1).allowed, false);
  });

  test("Server provides manifest of all tools", () => {
    const server = createMonetizedMcpServer({ freeTierCalls: 2 });
    const manifest = server.getToolsManifest();
    assert.strictEqual(manifest.length, 3);
    const names = manifest.map(m => m.name);
    assert.ok(names.includes("financial_report"));
    assert.ok(names.includes("semantic_search"));
    assert.ok(names.includes("ping"));
  });

  test("Executes free tier calls and triggers paywall on exhaustion", async () => {
    const server = createMonetizedMcpServer({ freeTierCalls: 2 });
    const userId = "test_user_quota";

    // Call 1 (Free)
    const res1 = await server.dispatchToolCall("financial_report", { ticker: "AAPL", userId });
    assert.ok(res1.content[0].text.includes("[PRO REPORT]"));
    assert.strictEqual(res1.isError, undefined);

    // Call 2 (Free)
    const res2 = await server.dispatchToolCall("financial_report", { ticker: "MSFT", userId });
    assert.ok(res2.content[0].text.includes("[PRO REPORT]"));

    // Call 3 (Quota Exhausted -> Paywall)
    const res3 = await server.dispatchToolCall("financial_report", { ticker: "GOOGL", userId });
    assert.ok(res3.content[0].text.includes("Free Quota Exhausted") || res3.content[0].text.includes("Payment"));
    assert.ok(res3.content[0].text.includes("checkout.dodopayments.com"));
  });

  test("Webhook server fulfills Dodo payments and replenishes quota", async () => {
    const server = createMonetizedMcpServer({ freeTierCalls: 1 });
    const userId = "test_user_webhook";
    const dodoSecret = "whsec_test_secret_123456789";

    const { webhookHandler } = createWebhookServer({
      store: server.store,
      dodoSecret
    });

    // Exhaust free tier
    await server.dispatchToolCall("financial_report", { ticker: "NVDA", userId });
    const blockedRes = await server.dispatchToolCall("financial_report", { ticker: "NVDA", userId });
    assert.ok(blockedRes.content[0].text.includes("checkout.dodopayments.com"));

    // Webhook event
    const payload = {
      type: "payment.succeeded",
      data: {
        payment_id: "pay_test_suite_123",
        amount: 500,
        currency: "USD",
        customer: { customer_id: userId },
        metadata: { userId, credits: 50 }
      }
    };
    const rawBody = JSON.stringify(payload);
    const sig = crypto.createHmac("sha256", dodoSecret).update(rawBody).digest("hex");

    const fulfillment = await webhookHandler.handleDodoWebhook(payload, sig, rawBody);
    assert.strictEqual(fulfillment.success, true);
    assert.strictEqual(fulfillment.creditsAdded, 50);

    // Resume execution
    const allowedRes = await server.dispatchToolCall("financial_report", { ticker: "NVDA", userId });
    assert.ok(allowedRes.content[0].text.includes("[PRO REPORT]"));
  });
});
