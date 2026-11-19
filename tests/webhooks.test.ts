import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { PaymentWebhookHandler } from "../src/webhooks.js";
import { MemoryTokenStore } from "../src/store.js";
import { McpCapabilityTokenManager } from "../src/capability.js";

test("PaymentWebhookHandler verifies Dodo HMAC signature and fulfills capability tokens", async () => {
  const store = new MemoryTokenStore(0);
  const capabilityManager = new McpCapabilityTokenManager("shared_secret_32bytes_enterprise_key");
  const dodoSecret = "whsec_dodo_enterprise_secret_2026";

  const handler = new PaymentWebhookHandler({
    store,
    dodoWebhookSecret: dodoSecret,
    capabilityManager,
  });

  const payload = {
    id: "evt_dodo_12345",
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

  // 2. Rejected when signature is missing (fail closed)
  const unsigned = await handler.handleDodoWebhook(payload, undefined, rawBody);
  assert.equal(unsigned.success, false);
  assert.match(unsigned.error || "", /Missing webhook signature header/);

  // 3. Accepted on valid signature
  const success = await handler.handleDodoWebhook(payload, validSignature, rawBody);
  assert.equal(success.success, true);
  assert.equal(success.creditsAdded, 2500);
  assert.ok(success.issuedCapabilityToken, "Must issue pre-funded capability token");

  // 4. Duplicate event replay rejected
  const replayed = await handler.handleDodoWebhook(payload, validSignature, rawBody);
  assert.equal(replayed.success, false);
  assert.match(replayed.error || "", /Duplicate webhook event/);

  // 5. Verify issued capability token with capabilityManager
  const verification = capabilityManager.verifyToken(success.issuedCapabilityToken!, "tool:search");
  assert.equal(verification.valid, true);
  assert.equal(verification.payload?.subject, "agent_developer_01");
  assert.equal(verification.payload?.creditsRemaining, 2500);
});

test("PaymentWebhookHandler verifies Stripe signature and fulfills checkout session with replay defense", async () => {
  const store = new MemoryTokenStore(0);
  const stripeSecret = "whsec_stripe_test_key_12345";
  const handler = new PaymentWebhookHandler({
    store,
    stripeWebhookSecret: stripeSecret,
  });

  const payload = {
    id: "evt_stripe_test_999",
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

  // 1. Rejected when signature header is missing (fail closed)
  const missingHeader = await handler.handleStripeWebhook(payload, undefined, rawBody);
  assert.equal(missingHeader.success, false);
  assert.match(missingHeader.error || "", /Missing stripe-signature header/);

  // 2. Rejected on expired timestamp (outside 300s tolerance window)
  const expiredTimestamp = (Math.floor(Date.now() / 1000) - 400).toString();
  const expiredSig = crypto.createHmac("sha256", stripeSecret).update(`${expiredTimestamp}.${rawBody}`).digest("hex");
  const expiredRes = await handler.handleStripeWebhook(payload, `t=${expiredTimestamp},v1=${expiredSig}`, rawBody);
  assert.equal(expiredRes.success, false);
  assert.match(expiredRes.error || "", /timestamp expired/);

  // 3. Accepted on valid signature
  const res = await handler.handleStripeWebhook(payload, signatureHeader, rawBody);
  assert.equal(res.success, true);
  assert.equal(res.customerId, "agent_stripe_user");
  assert.equal(res.creditsAdded, 500);

  // 4. Duplicate event replay rejected
  const replayRes = await handler.handleStripeWebhook(payload, signatureHeader, rawBody);
  assert.equal(replayRes.success, false);
  assert.match(replayRes.error || "", /Duplicate Stripe event/);
});

test("PaymentWebhookHandler fails closed when secrets are unset", async () => {
  const store = new MemoryTokenStore(0);
  const unconfiguredHandler = new PaymentWebhookHandler({ store });

  const dodoRes = await unconfiguredHandler.handleDodoWebhook({ type: "payment.succeeded" });
  assert.equal(dodoRes.success, false);
  assert.match(dodoRes.error || "", /Dodo webhook secret is not configured/);

  const stripeRes = await unconfiguredHandler.handleStripeWebhook({ type: "checkout.session.completed" });
  assert.equal(stripeRes.success, false);
  assert.match(stripeRes.error || "", /Stripe webhook secret is not configured/);
});
