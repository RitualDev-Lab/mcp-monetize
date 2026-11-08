import crypto from "node:crypto";
import type { TokenStore } from "./types.js";
import { McpCapabilityTokenManager } from "./capability.js";

export interface WebhookConfig {
  store: TokenStore;
  dodoWebhookSecret?: string;
  stripeWebhookSecret?: string;
  capabilityManager?: McpCapabilityTokenManager;
}

export interface WebhookFulfillmentResult {
  success: boolean;
  event: string;
  customerId?: string;
  creditsAdded?: number;
  issuedCapabilityToken?: string;
  error?: string;
}

/**
 * Enterprise Webhook Processor for Dodo Payments and Stripe Connect.
 * Automatically fulfills user credits, activates recurring subscriptions,
 * verifies cryptographic HMAC signatures, and issues signed PASETO capability tokens.
 */
export class PaymentWebhookHandler {
  private capabilityManager?: McpCapabilityTokenManager;

  constructor(private config: WebhookConfig) {
    this.capabilityManager = config.capabilityManager;
  }

  /**
   * Process Dodo Payments incoming webhook payload with HMAC-SHA256 signature verification.
   */
  async handleDodoWebhook(
    payload: Record<string, any>,
    signature?: string,
    rawBody?: string
  ): Promise<WebhookFulfillmentResult> {
    const eventType = payload.type || payload.event_type;
    const data = payload.data || {};

    // 1. Verify HMAC-SHA256 signature if webhook secret is configured
    if (this.config.dodoWebhookSecret) {
      if (!signature) {
        return { success: false, event: eventType || "unknown", error: "Missing webhook signature header" };
      }

      const bodyToVerify = rawBody || JSON.stringify(payload);
      const computed = crypto.createHmac("sha256", this.config.dodoWebhookSecret).update(bodyToVerify).digest("hex");

      const sigBuf = Buffer.from(signature.replace(/^sha256=/, ""));
      const compBuf = Buffer.from(computed);

      if (sigBuf.length !== compBuf.length || !crypto.timingSafeEqual(sigBuf, compBuf)) {
        return { success: false, event: eventType || "unknown", error: "Invalid Dodo Payments signature" };
      }
    }

    const customerId =
      data.customer?.customer_id ||
      data.metadata?.customer_id ||
      data.metadata?.userId ||
      "default_client";

    // 2. Fulfill one-time credit top-up
    if (eventType === "payment.succeeded") {
      const creditsToAdd = Number(data.metadata?.credits) || 1000;
      if (typeof (this.config.store as any).addPaidCredits === "function") {
        await Promise.resolve((this.config.store as any).addPaidCredits(customerId, creditsToAdd));
      } else {
        const user = await Promise.resolve(this.config.store.getUser(customerId));
        if (user) {
          user.paidCredits += creditsToAdd;
          await Promise.resolve(this.config.store.saveUser(user));
        }
      }

      // Optional capability token issuance upon successful payment
      let issuedCapabilityToken: string | undefined;
      if (this.capabilityManager) {
        issuedCapabilityToken = this.capabilityManager.issueToken({
          subject: customerId,
          scopes: data.metadata?.scopes ? String(data.metadata.scopes).split(",") : ["tool:all"],
          creditsRemaining: creditsToAdd,
          expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
        });
      }

      return {
        success: true,
        event: "payment.succeeded",
        customerId,
        creditsAdded: creditsToAdd,
        issuedCapabilityToken,
      };
    }

    // 3. Fulfill recurring subscription activation
    if (eventType === "subscription.active" || eventType === "subscription.renewed") {
      const expiresAt = data.next_billing_date || new Date(Date.now() + 31 * 86400000).toISOString();
      if (typeof (this.config.store as any).setSubscription === "function") {
        await Promise.resolve((this.config.store as any).setSubscription(customerId, true, expiresAt));
      } else {
        const user = await Promise.resolve(this.config.store.getUser(customerId));
        if (user) {
          user.isSubscriber = true;
          user.subscriptionExpiresAt = expiresAt;
          await Promise.resolve(this.config.store.saveUser(user));
        }
      }

      let issuedCapabilityToken: string | undefined;
      if (this.capabilityManager) {
        issuedCapabilityToken = this.capabilityManager.issueToken({
          subject: customerId,
          scopes: ["tool:all", "tier:subscriber"],
          expiresAt,
        });
      }

      return {
        success: true,
        event: "subscription.active",
        customerId,
        issuedCapabilityToken,
      };
    }

    return { success: true, event: eventType || "unhandled", customerId };
  }

  /**
   * Process Stripe incoming webhook payload with stripe-signature verification.
   */
  async handleStripeWebhook(
    payload: Record<string, any>,
    signatureHeader?: string,
    rawBody?: string
  ): Promise<WebhookFulfillmentResult> {
    const eventType = payload.type;
    const data = payload.data?.object || {};

    // 1. Verify Stripe signature header (t=timestamp,v1=signature)
    if (this.config.stripeWebhookSecret && signatureHeader) {
      const parts = signatureHeader.split(",");
      const timestampPart = parts.find((p) => p.startsWith("t="));
      const sigPart = parts.find((p) => p.startsWith("v1="));

      if (!timestampPart || !sigPart) {
        return { success: false, event: eventType || "unknown", error: "Malformed stripe-signature header" };
      }

      const timestamp = timestampPart.slice(2);
      const signature = sigPart.slice(3);
      const bodyToVerify = rawBody || JSON.stringify(payload);
      const signedPayload = `${timestamp}.${bodyToVerify}`;

      const computed = crypto.createHmac("sha256", this.config.stripeWebhookSecret).update(signedPayload).digest("hex");

      const sigBuf = Buffer.from(signature);
      const compBuf = Buffer.from(computed);

      if (sigBuf.length !== compBuf.length || !crypto.timingSafeEqual(sigBuf, compBuf)) {
        return { success: false, event: eventType || "unknown", error: "Stripe signature mismatch" };
      }
    }

    const customerId =
      data.client_reference_id ||
      data.metadata?.userId ||
      data.metadata?.customer_id ||
      data.customer ||
      "default_client";

    if (eventType === "checkout.session.completed") {
      const creditsToAdd = Number(data.metadata?.credits) || 1000;
      if (typeof (this.config.store as any).addPaidCredits === "function") {
        await Promise.resolve((this.config.store as any).addPaidCredits(customerId, creditsToAdd));
      }

      let issuedCapabilityToken: string | undefined;
      if (this.capabilityManager) {
        issuedCapabilityToken = this.capabilityManager.issueToken({
          subject: customerId,
          scopes: ["tool:all"],
          creditsRemaining: creditsToAdd,
          expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
        });
      }

      return {
        success: true,
        event: "checkout.session.completed",
        customerId,
        creditsAdded: creditsToAdd,
        issuedCapabilityToken,
      };
    }

    if (eventType === "customer.subscription.created" || eventType === "customer.subscription.updated") {
      if (typeof (this.config.store as any).setSubscription === "function") {
        await Promise.resolve((this.config.store as any).setSubscription(customerId, true));
      }
      return { success: true, event: eventType, customerId };
    }

    return { success: true, event: eventType, customerId };
  }
}
