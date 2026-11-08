import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { PaymentWebhookHandler } from "../src/webhooks.js";
import { MemoryTokenStore } from "../src/store.js";
import { McpCapabilityTokenManager } from "../src/capability.js";

test("PaymentWebhookHandler verifies Dodo HMAC signature and fulfills capability tokens", async () => {
  const store = new MemoryTokenStore(0);
  const capabilityManager = new McpCapabilityTokenManager("shared_secret");
  const dodoSecret = "whsec_dodo_enterprise_secret_2026";

  const handler = new PaymentWebhookHandler({
    store,
    dodoWebhookSecret: dodoSecret,
    capabilityManager,
  });

  const payload = {
    type: "payment.succeeded",
    data: {
      customer: { customer_id: "agent_developer_01" },
      metadata: { credits: 2500, scopes: "tool:search,tool:query" },
    },
  };

  const rawBody = JSON.stringify(payload);
  const validSignature = crypto.createHmac("sha256", dodoSecret).update(rawBody).digest("hex");

  // 1. Rejected on forged signature
  const rejected = await handler.handleDodoWebhook(payload, "forged_signature_hex", rawBody);
  assert.equal(rejected.success, false);
  assert.match(rejected.error || "", /Invalid Dodo Payments signature/);

  // 2. Accepted on valid signature
  const success = await handler.handleDodoWebhook(payload, validSignature, rawBody);
  assert.equal(success.success, true);
  assert.equal(success.creditsAdded, 2500);
  assert.ok(success.issuedCapabilityToken, "Must issue pre-funded capability token");

  // 3. Verify issued capability token with capabilityManager
  const verification = capabilityManager.verifyToken(success.issuedCapabilityToken!, "tool:search");
  assert.equal(verification.valid, true);
  assert.equal(verification.payload?.subject, "agent_developer_01");
  assert.equal(verification.payload?.creditsRemaining, 2500);
});

test("PaymentWebhookHandler verifies Stripe signature and fulfills checkout session", async () => {
  const store = new MemoryTokenStore(0);
  const stripeSecret = "whsec_stripe_test_key_12345";
  const handler = new PaymentWebhookHandler({
    store,
    stripeWebhookSecret: stripeSecret,
  });

  const payload = {
    type: "checkout.session.completed",
    data: {
      object: {
        client_reference_id: "agent_stripe_user",
        metadata: { credits: 500 },
      },
    },
  };

  const rawBody = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = crypto.createHmac("sha256", stripeSecret).update(`${timestamp}.${rawBody}`).digest("hex");
  const signatureHeader = `t=${timestamp},v1=${signature}`;

  const res = await handler.handleStripeWebhook(payload, signatureHeader, rawBody);
  assert.equal(res.success, true);
  assert.equal(res.customerId, "agent_stripe_user");
  assert.equal(res.creditsAdded, 500);
});
