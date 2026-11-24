/**
 * Interactive Demonstration of MCP Tool Monetization
 *
 * Runs through the complete monetization lifecycle:
 * 1. Free tier calls (1 to 5) succeed seamlessly.
 * 2. 6th call triggers the paywall with Dodo checkout redirect.
 * 3. Simulates customer checkout and webhook top-up.
 * 4. 7th call resumes using paid credits.
 */

import { createMonetizedMcpServer } from "./server.js";
import { PaymentWebhookHandler } from "../../src/webhooks.js";
import * as crypto from "node:crypto";

async function runDemo() {
  console.log("=================================================================");
  console.log("🚀 MCP Monetize Starter Kit: Live End-to-End Monetization Demo");
  console.log("=================================================================\n");

  const server = createMonetizedMcpServer({
    freeTierCalls: 3, // Set to 3 for quick demo
    dodoCheckoutUrl: "https://checkout.dodopayments.com/buy/pdt_0NrFWlIkkreo5fOBIJWxI",
    priceLabel: "$5 for 500 reports"
  });

  const userId = "dev_sarah_99";
  const tickerSymbols = ["AAPL", "NVDA", "MSFT", "AMZN"];

  console.log(`👤 User: ${userId} (Allocated: 3 complimentary free-tier reports)\n`);

  // Step 1: Free Tier Calls
  for (let i = 0; i < 3; i++) {
    const ticker = tickerSymbols[i];
    console.log(`--- [Call #${i + 1}] Requesting Financial Analysis for ${ticker} ---`);
    const res = await server.dispatchToolCall("financial_report", { ticker, userId });
    console.log(res.content[0].text);
    console.log();
  }

  // Step 2: Quota Exhausted Call (Paywall Trigger)
  console.log(`--- [Call #4] Requesting Financial Analysis for ${tickerSymbols[3]} (Quota Exhausted) ---`);
  const paywallRes = await server.dispatchToolCall("financial_report", { ticker: tickerSymbols[3], userId });
  console.log(paywallRes.content[0].text);
  console.log();

  // Step 3: Webhook Top-Up Simulation
  console.log("💳 >>> Customer completes checkout on Dodo Payments ($5) <<<");
  const webhookSecret = "whsec_demo_secret_key";
  const webhookHandler = new PaymentWebhookHandler({
    store: server.store,
    dodoWebhookSecret: webhookSecret
  });

  const webhookPayload = {
    type: "payment.succeeded",
    data: {
      payment_id: `pay_${Date.now()}`,
      status: "succeeded",
      amount: 500,
      currency: "USD",
      customer: {
        customer_id: userId,
        email: "sarah@example.com"
      },
      metadata: {
        userId,
        credits: 500
      }
    }
  };

  const rawBody = JSON.stringify(webhookPayload);
  const sig = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  const webhookResult = await webhookHandler.handleDodoWebhook(webhookPayload, sig, rawBody);

  console.log(`✅ Webhook Fulfillment: Added ${webhookResult.creditsAdded} credits to ${userId}.\n`);

  // Step 4: Resume Execution with Paid Credits
  console.log(`--- [Call #5] Requesting Financial Analysis for ${tickerSymbols[3]} (With Paid Credits) ---`);
  const paidRes = await server.dispatchToolCall("financial_report", { ticker: tickerSymbols[3], userId });
  console.log(paidRes.content[0].text);

  const status = server.store.getUser(userId);
  console.log(`\n🎉 Balance: ${status.paidCredits} paid credits remaining | Total calls made: ${status.totalCallsMade}`);
  console.log("=================================================================\n");
}

runDemo().catch(console.error);
