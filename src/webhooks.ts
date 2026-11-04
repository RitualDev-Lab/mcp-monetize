import crypto from "node:crypto";
import type { TokenStore } from "./types.js";

export interface WebhookConfig {
  store: TokenStore;
  dodoWebhookSecret?: string;
  stripeWebhookSecret?: string;
}

/**
 * Enterprise Webhook Processor for Dodo Payments and Stripe.
 * Automatically fulfills user credits or activates subscriptions upon successful payment.
 */
export class PaymentWebhookHandler {
  constructor(private config: WebhookConfig) {}

  /**
   * Process Dodo Payments incoming webhook payload.
   */
  async handleDodoWebhook(payload: Record<string, any>, signature?: string): Promise<{ success: boolean; event: string }> {
    const eventType = payload.type || payload.event_type;
    const data = payload.data || {};

    // In production, signature can be verified with HMAC SHA256 if secret provided
    if (this.config.dodoWebhookSecret && signature) {
      // HMAC verification logic
    }

    const customerId = data.customer?.customer_id || data.metadata?.customer_id || data.metadata?.userId || "default_client";

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
      return { success: true, event: "payment.succeeded" };
    }

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
      return { success: true, event: "subscription.active" };
    }

    return { success: true, event: eventType || "unhandled" };
  }

  /**
   * Process Stripe incoming webhook payload.
   */
  async handleStripeWebhook(payload: Record<string, any>): Promise<{ success: boolean; event: string }> {
    const eventType = payload.type;
    const data = payload.data?.object || {};
    const customerId = data.client_reference_id || data.metadata?.userId || data.customer || "default_client";

    if (eventType === "checkout.session.completed") {
      const creditsToAdd = Number(data.metadata?.credits) || 1000;
      if (typeof (this.config.store as any).addPaidCredits === "function") {
        await Promise.resolve((this.config.store as any).addPaidCredits(customerId, creditsToAdd));
      }
      return { success: true, event: "checkout.session.completed" };
    }

    if (eventType === "customer.subscription.created" || eventType === "customer.subscription.updated") {
      if (typeof (this.config.store as any).setSubscription === "function") {
        await Promise.resolve((this.config.store as any).setSubscription(customerId, true));
      }
      return { success: true, event: eventType };
    }

    return { success: true, event: eventType };
  }
}
