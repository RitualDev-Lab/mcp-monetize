import test from "node:test";
import assert from "node:assert/strict";
import { withMcpMonetization, MemoryTokenStore } from "../src/index.js";

test("mcp-monetize allows calls within free tier quota", async () => {
  const store = new MemoryTokenStore(3);
  let callCount = 0;

  const tool = withMcpMonetization(
    async (args: { input: string }) => {
      callCount++;
      return { content: [{ type: "text" as const, text: `Echo: ${args.input}` }] };
    },
    {
      checkoutUrl: "https://checkout.dodopayments.com/buy/pdt_test",
      freeTierCalls: 3,
      store,
    }
  );

  const res1 = await tool({ input: "call 1", userId: "user_1" });
  assert.equal(res1.isError, undefined);
  assert.equal(res1.content[0].text, "Echo: call 1");

  const res2 = await tool({ input: "call 2", userId: "user_1" });
  assert.equal(res2.isError, undefined);

  const res3 = await tool({ input: "call 3", userId: "user_1" });
  assert.equal(res3.isError, undefined);
  assert.equal(callCount, 3);
});

test("mcp-monetize triggers paywall when quota is exhausted", async () => {
  const store = new MemoryTokenStore(1);

  const tool = withMcpMonetization(
    async () => ({ content: [{ type: "text" as const, text: "Success" }] }),
    {
      checkoutUrl: "https://checkout.dodopayments.com/buy/pdt_test",
      priceLabel: "$5 / month",
      freeTierCalls: 1,
      store,
    }
  );

  // Call 1: Success (consumes 1 free call)
  const res1 = await tool({ userId: "user_quota" });
  assert.equal(res1.isError, undefined);

  // Call 2: Blocked by Paywall
  const res2 = await tool({ userId: "user_quota" });
  assert.equal(res2.isError, true);
  assert.match(res2.content[0].text, /Usage Limit Reached/);
  assert.match(res2.content[0].text, /https:\/\/checkout\.dodopayments\.com\/buy\/pdt_test/);
  assert.match(res2.content[0].text, /\$5 \/ month/);
});

test("mcp-monetize resumes execution after paid credits top-up", async () => {
  const store = new MemoryTokenStore(0); // 0 free calls

  const tool = withMcpMonetization(
    async (args: { query: string }) => ({
      content: [{ type: "text" as const, text: `Result for ${args.query}` }],
    }),
    {
      checkoutUrl: "https://checkout.dodopayments.com/buy/pdt_test",
      freeTierCalls: 0,
      store,
    }
  );

  // Call 1: Immediate paywall
  const res1 = await tool({ query: "test", userId: "buyer_1" });
  assert.equal(res1.isError, true);

  // Top up 10 paid credits
  store.addPaidCredits("buyer_1", 10);

  // Call 2: Now authorized
  const res2 = await tool({ query: "test", userId: "buyer_1" });
  assert.equal(res2.isError, undefined);
  assert.equal(res2.content[0].text, "Result for test");

  const user = store.getUser("buyer_1");
  assert.equal(user.paidCredits, 9);
});

test("mcp-monetize subscriber status bypasses paywall without consuming credits", async () => {
  const store = new MemoryTokenStore(0);
  store.setSubscription("vip_user", true);

  const tool = withMcpMonetization(
    async () => ({ content: [{ type: "text" as const, text: "VIP Access" }] }),
    {
      checkoutUrl: "https://checkout.dodopayments.com/buy/pdt_sub",
      store,
    }
  );

  const res = await tool({ userId: "vip_user" });
  assert.equal(res.isError, undefined);
  assert.equal(res.content[0].text, "VIP Access");
});

test("McpLicenseValidator generates and verifies tamper-proof license keys", () => {
  const { McpLicenseValidator } = require("../src/index.js");
  const validator = new McpLicenseValidator("secret_test_key_123");

  const license = validator.generateLicenseKey({
    customerEmail: "founder@client.com",
    tier: "pro",
  });

  assert.match(license, /^MCP-PRO-/);

  const res = validator.validateLicenseKey(license);
  assert.equal(res.valid, true);
  assert.equal(res.tier, "pro");
  assert.equal(res.customerEmail, "founder@client.com");

  // Tampered key should fail
  const tampered = license.slice(0, -3) + "XYZ";
  const failRes = validator.validateLicenseKey(tampered);
  assert.equal(failRes.valid, false);
});

test("PaymentWebhookHandler fulfills Dodo and Stripe events", async () => {
  const { PaymentWebhookHandler, MemoryTokenStore } = require("../src/index.js");
  const store = new MemoryTokenStore(0);
  const handler = new PaymentWebhookHandler({ store });

  // Dodo payment.succeeded event
  await handler.handleDodoWebhook({
    type: "payment.succeeded",
    data: {
      customer: { customer_id: "buyer_dodo" },
      metadata: { credits: 500 },
    },
  });

  const user = store.getUser("buyer_dodo");
  assert.equal(user.paidCredits, 500);

  // Stripe subscription event
  await handler.handleStripeWebhook({
    type: "customer.subscription.created",
    data: {
      object: {
        customer: "buyer_stripe",
      },
    },
  });

  const subUser = store.getUser("buyer_stripe");
  assert.equal(subUser.isSubscriber, true);
});
