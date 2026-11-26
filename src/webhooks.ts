import crypto from "node:crypto";
import type { TokenStore } from "./types.js";
import { McpCapabilityTokenManager } from "./capability.js";

export interface WebhookConfig {
  store: TokenStore;
  dodoWebhookSecret?: string;
  dodoWebhookKey?: string;
  stripeWebhookSecret?: string;
  polarWebhookSecret?: string;
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

export class PaymentWebhookHandler {
  private capabilityManager?: McpCapabilityTokenManager;
  private processedEvents: Set<string> = new Set();
  private static readonly MAX_EVENT_CACHE = 5000;
  private static readonly STRIPE_TOLERANCE_SECONDS = 300;

  constructor(private config: WebhookConfig) {
    this.capabilityManager = config.capabilityManager;
  }

  private recordEvent(eventId: string): void {
    if (this.processedEvents.size >= PaymentWebhookHandler.MAX_EVENT_CACHE) {
      const first = this.processedEvents.values().next().value;
      if (first !== undefined) this.processedEvents.delete(first);
    }
    this.processedEvents.add(eventId);
  }

  async handleDodoWebhook(payload: Record<string, any>, signature?: string, rawBody?: string): Promise<WebhookFulfillmentResult> {
    const eventType = payload.type || payload.event_type;
    const data = payload.data || {};
    const dodoSecret = this.config.dodoWebhookSecret || this.config.dodoWebhookKey || process.env.DODO_WEBHOOK_SECRET;

    if (!dodoSecret || !signature) return { success: false, event: eventType || "unknown", error: "Missing secret or signature" };

    const bodyToVerify = rawBody || JSON.stringify(payload);
    const computed = crypto.createHmac("sha256", dodoSecret).update(bodyToVerify).digest("hex");
    const sigBuf = Buffer.from(signature.replace(/^sha256=/, ""));
    const compBuf = Buffer.from(computed);

    if (sigBuf.length !== compBuf.length || !crypto.timingSafeEqual(sigBuf, compBuf)) {
      return { success: false, event: eventType || "unknown", error: "Invalid Dodo signature" };
    }

    const customerId = data.customer?.customer_id || data.metadata?.userId || "default_client";
    return { success: true, event: eventType || "unknown", customerId };
  }

  async handlePolarWebhook(payload: Record<string, any>, signature: string, rawBody: string): Promise<WebhookFulfillmentResult> {
    const polarSecret = this.config.polarWebhookSecret || process.env.POLAR_WEBHOOK_SECRET;
    if (!polarSecret) return { success: false, event: "unknown", error: "Polar secret not configured" };

    const computed = crypto.createHmac("sha256", polarSecret).update(rawBody).digest("hex");
    const sigBuf = Buffer.from(signature);
    const compBuf = Buffer.from(computed);

    if (sigBuf.length !== compBuf.length || !crypto.timingSafeEqual(sigBuf, compBuf)) {
      return { success: false, event: "unknown", error: "Invalid Polar signature" };
    }

    const eventType = payload.type;
    const customerId = payload.data?.customer_id || "default_client";
    return { success: true, event: eventType, customerId };
  }

  async handleStripeWebhook(payload: Record<string, any>, signatureHeader?: string, rawBody?: string): Promise<WebhookFulfillmentResult> {
    const eventType = payload.type;
    const stripeSecret = this.config.stripeWebhookSecret || process.env.STRIPE_WEBHOOK_SECRET;
    if (!stripeSecret || !signatureHeader) return { success: false, event: eventType || "unknown", error: "Missing secret or signature" };

    const parts = signatureHeader.split(",");
    const timestampPart = parts.find((p) => p.startsWith("t="));
    const sigPart = parts.find((p) => p.startsWith("v1="));
    if (!timestampPart || !sigPart) return { success: false, event: eventType || "unknown", error: "Malformed signature" };

    const timestampSec = parseInt(timestampPart.slice(2), 10);
    if (Math.abs(Math.floor(Date.now() / 1000) - timestampSec) > PaymentWebhookHandler.STRIPE_TOLERANCE_SECONDS) {
      return { success: false, event: eventType || "unknown", error: "Expired signature" };
    }

    const computed = crypto.createHmac("sha256", stripeSecret).update(`${timestampSec}.${rawBody}`).digest("hex");
    const sigBuf = Buffer.from(sigPart.slice(3));
    const compBuf = Buffer.from(computed);

    if (sigBuf.length !== compBuf.length || !crypto.timingSafeEqual(sigBuf, compBuf)) {
      return { success: false, event: eventType || "unknown", error: "Invalid Stripe signature" };
    }

    return { success: true, event: eventType, customerId: payload.data?.object?.client_reference_id || "default_client" };
  }
}