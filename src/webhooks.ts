import crypto from "node:crypto";
import type { TokenStore } from "./types.js";
import { McpCapabilityTokenManager } from "./capability.js";

export interface WebhookConfig {
  store: TokenStore;
  dodoWebhookSecret?: string;
  dodoWebhookKey?: string; // Backwards-compatible alias for dodoWebhookSecret
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
 * enforces cryptographic HMAC signatures, rejects replays, and issues capability tokens.
 */
export class PaymentWebhookHandler {
  private capabilityManager?: McpCapabilityTokenManager;
  private processedEvents: Set<string> = new Set();
  private static readonly MAX_EVENT_CACHE = 5000;
  private static readonly STRIPE_TOLERANCE_SECONDS = 300; // 5 minute replay tolerance

  constructor(private config: WebhookConfig) {
    this.capabilityManager = config.capabilityManager;
  }

  private recordEvent(eventId: string): void {
    if (this.processedEvents.size >= PaymentWebhookHandler.MAX_EVENT_CACHE) {
      const first = this.processedEvents.values().next().value;
      if (first !== undefined) {
        this.processedEvents.delete(first);
      }
    }
    this.processedEvents.add(eventId);
  }

  /**
   * Process Dodo Payments incoming webhook payload with HMAC-SHA256 signature verification.
   * Fails closed: refuses unsigned or unauthenticated requests.
   */
  async handleDodoWebhook(
    payload: Record<string, any>,
    signature?: string,
    rawBody?: string
  ): Promise<WebhookFulfillmentResult> {
    const eventType = payload.type || payload.event_type;
    const data = payload.data || {};

    const dodoSecret =
      this.config.dodoWebhookSecret ||
      this.config.dodoWebhookKey ||
      process.env.DODO_WEBHOOK_SECRET ||
      process.env.DODO_PAYMENTS_WEBHOOK_KEY;

    // 1. Fail closed: signature verification is strictly mandatory
    if (!dodoSecret) {
      return {
        success: false,
        event: eventType || "unknown",
        error: "Dodo webhook secret is not configured; refusing to process unverified webhook (fail closed).",
      };
    }

    if (!signature) {
      return {
        success: false,
        event: eventType || "unknown",
        error: "Missing webhook signature header",
      };
    }

    const bodyToVerify = rawBody || JSON.stringify(payload);
    const computed = crypto.createHmac("sha256", dodoSecret).update(bodyToVerify).digest("hex");

    const sigBuf = Buffer.from(signature.replace(/^sha256=/, ""));
    const compBuf = Buffer.from(computed);

    if (sigBuf.length !== compBuf.length || !crypto.timingSafeEqual(sigBuf, compBuf)) {
      return {
        success: false,
        event: eventType || "unknown",
        error: "Invalid Dodo Payments signature",
      };
    }

    // 2. Replay protection by event ID
    const eventId = payload.id || payload.event_id || data.payment_id || data.subscription_id;
    if (eventId) {
      const eventKey = `dodo_${eventId}`;
      if (this.processedEvents.has(eventKey)) {
        return {
          success: false,
          event: eventType || "unknown",
          error: "Duplicate webhook event detected (replay rejected)",
        };
      }
      this.recordEvent(eventKey);
    }

    const customerId =
      data.customer?.customer_id ||
      data.metadata?.customer_id ||
      data.metadata?.userId ||
      "default_client";

    // 3. Fulfill one-time credit top-up
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

      // Capability token issuance upon successful payment
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

    // 4. Fulfill recurring subscription activation
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
   * Fails closed: refuses unsigned requests, enforces timestamp tolerance, and deduplicates event IDs.
   */
  async handleStripeWebhook(
    payload: Record<string, any>,
    signatureHeader?: string,
    rawBody?: string
  ): Promise<WebhookFulfillmentResult> {
    const eventType = payload.type;
    const data = payload.data?.object || {};

    const stripeSecret = this.config.stripeWebhookSecret || process.env.STRIPE_WEBHOOK_SECRET;

    // 1. Fail closed: secret and header are strictly mandatory
    if (!stripeSecret) {
      return {
        success: false,
        event: eventType || "unknown",
        error: "Stripe webhook secret is not configured; refusing to process unverified webhook (fail closed).",
      };
    }

    if (!signatureHeader) {
      return {
        success: false,
        event: eventType || "unknown",
        error: "Missing stripe-signature header; refusing to process unverified webhook (fail closed).",
      };
    }

    // 2. Verify Stripe signature header (t=timestamp,v1=signature) and validate timestamp tolerance
    const parts = signatureHeader.split(",");
    const timestampPart = parts.find((p) => p.startsWith("t="));
    const sigPart = parts.find((p) => p.startsWith("v1="));

    if (!timestampPart || !sigPart) {
      return {
        success: false,
        event: eventType || "unknown",
        error: "Malformed stripe-signature header",
      };
    }

    const timestampSec = parseInt(timestampPart.slice(2), 10);
    const nowSec = Math.floor(Date.now() / 1000);
    if (isNaN(timestampSec) || Math.abs(nowSec - timestampSec) > PaymentWebhookHandler.STRIPE_TOLERANCE_SECONDS) {
      return {
        success: false,
        event: eventType || "unknown",
        error: "Stripe webhook signature timestamp expired or outside tolerance window (replay protection)",
      };
    }

    const signature = sigPart.slice(3);
    const bodyToVerify = rawBody || JSON.stringify(payload);
    const signedPayload = `${timestampSec}.${bodyToVerify}`;

    const computed = crypto.createHmac("sha256", stripeSecret).update(signedPayload).digest("hex");

    const sigBuf = Buffer.from(signature);
    const compBuf = Buffer.from(computed);

    if (sigBuf.length !== compBuf.length || !crypto.timingSafeEqual(sigBuf, compBuf)) {
      return {
        success: false,
        event: eventType || "unknown",
        error: "Stripe signature mismatch",
      };
    }

    // 3. Deduplicate by Stripe event ID
    if (payload.id) {
      const eventKey = `stripe_${payload.id}`;
      if (this.processedEvents.has(eventKey)) {
        return {
          success: false,
          event: eventType || "unknown",
          error: "Duplicate Stripe event detected (replay rejected)",
        };
      }
      this.recordEvent(eventKey);
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
