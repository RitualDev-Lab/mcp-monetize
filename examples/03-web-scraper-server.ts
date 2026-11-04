import { withMcpMonetization, MemoryTokenStore, PaymentWebhookHandler } from "../src/index.js";

/**
 * Example 3: High-Concurrency Web Scraper & Browser MCP Server
 * Charges $0.02 per scraped URL with real-time Dodo Payments webhook top-up.
 */
async function runScraperServer() {
  const store = new MemoryTokenStore(1);
  const webhookHandler = new PaymentWebhookHandler({ store });

  const scrapePageHandler = async (args: { url: string }) => {
    return {
      content: [
        {
          type: "text" as const,
          text: `🌐 Scraped ${args.url}: 1,420 words extracted, clean markdown returned.`,
        },
      ],
    };
  };

  const monetizedScraper = withMcpMonetization(scrapePageHandler, {
    provider: "dodo",
    checkoutUrl: "https://checkout.dodopayments.com/buy/pdt_scraper_credits",
    priceLabel: "$10 for 500 Scrapes ($0.02 / URL)",
    freeTierCalls: 1,
    store,
  });

  console.log("=== Testing Web Scraper Server Monetization ===");

  console.log("\n--- Scrape 1 (Free) ---");
  const s1 = await monetizedScraper({ url: "https://news.ycombinator.com", userId: "scraper_bot_1" });
  console.log(s1.content[0].text);

  console.log("\n--- Scrape 2 (Paywall) ---");
  const s2 = await monetizedScraper({ url: "https://producthunt.com", userId: "scraper_bot_1" });
  console.log(s2.content[0].text);

  console.log("\n--- Simulating Dodo Payments Webhook Event: payment.succeeded ($10 top-up) ---");
  await webhookHandler.handleDodoWebhook({
    type: "payment.succeeded",
    data: {
      customer: { customer_id: "scraper_bot_1" },
      metadata: { credits: 500 },
    },
  });

  console.log("\n--- Scrape 3 (Executed with Purchased Credits) ---");
  const s3 = await monetizedScraper({ url: "https://producthunt.com", userId: "scraper_bot_1" });
  console.log(s3.content[0].text);
}

runScraperServer().catch(console.error);
