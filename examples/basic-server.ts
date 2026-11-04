import { withMcpMonetization, MemoryTokenStore } from "../src/index.js";

// Mocking an MCP server tool registration
async function main() {
  const customStore = new MemoryTokenStore(2); // 2 free calls for demo

  const originalHandler = async (args: { query: string }) => {
    return {
      content: [
        {
          type: "text" as const,
          text: `🔍 Search result for "${args.query}": 42 data records processed.`,
        },
      ],
    };
  };

  const monetizedHandler = withMcpMonetization(originalHandler, {
    provider: "dodo",
    checkoutUrl: (userId) =>
      `https://checkout.dodopayments.com/buy/pdt_sample?customer_id=${encodeURIComponent(userId)}`,
    priceLabel: "$5 for 1,000 queries",
    freeTierCalls: 2,
    store: customStore,
  });

  console.log("--- Call 1 (Free tier) ---");
  const res1 = await monetizedHandler({ query: "open source LLMs", userId: "dev_alex" });
  console.log(res1.content[0].text);

  console.log("\n--- Call 2 (Free tier) ---");
  const res2 = await monetizedHandler({ query: "agent security", userId: "dev_alex" });
  console.log(res2.content[0].text);

  console.log("\n--- Call 3 (Quota Exhausted -> Paywall) ---");
  const res3 = await monetizedHandler({ query: "enterprise SOC2", userId: "dev_alex" });
  console.log(res3.content[0].text);

  console.log("\n--- User Tops Up 100 Credits ---");
  customStore.addPaidCredits("dev_alex", 100);

  console.log("\n--- Call 4 (Using Paid Credit) ---");
  const res4 = await monetizedHandler({ query: "enterprise SOC2", userId: "dev_alex" });
  console.log(res4.content[0].text);
}

main().catch(console.error);
