import { withMcpMonetization, SqliteTokenStore } from "../src/index.js";

/**
 * Example 2: Enterprise SQL Agent MCP Server
 * Charges a recurring $19/mo subscription. Subscribed users execute unlimited queries.
 */
async function runSqlAgentServer() {
  // Uses in-memory or on-disk SQLite for persistent credit tracking
  const store = new SqliteTokenStore(":memory:", 2); // 2 free test queries

  const executeQueryHandler = async (args: { sql: string }) => {
    return {
      content: [
        {
          type: "text" as const,
          text: `📊 Executed [${args.sql}]: 14 rows returned in 2.4ms.`,
        },
      ],
    };
  };

  const monetizedSqlTool = withMcpMonetization(executeQueryHandler, {
    provider: "dodo",
    checkoutUrl: "https://checkout.dodopayments.com/buy/pdt_sql_sub_19",
    priceLabel: "$19 / month (Unlimited Queries)",
    freeTierCalls: 2,
    store,
  });

  console.log("=== Testing SQL Agent Monetization ===");

  console.log("\n--- Query 1 (Free) ---");
  const r1 = await monetizedSqlTool({ sql: "SELECT * FROM users LIMIT 5", userId: "corp_analyst" });
  console.log(r1.content[0].text);

  console.log("\n--- Query 2 (Free) ---");
  const r2 = await monetizedSqlTool({ sql: "SELECT count(*) FROM orders", userId: "corp_analyst" });
  console.log(r2.content[0].text);

  console.log("\n--- Query 3 (Exhausted -> Paywall) ---");
  const r3 = await monetizedSqlTool({ sql: "SELECT revenue FROM metrics", userId: "corp_analyst" });
  console.log(r3.content[0].text);

  console.log("\n--- Customer Activates $19/mo Subscription via Webhook ---");
  store.setSubscription("corp_analyst", true);

  console.log("\n--- Query 4 (Subscriber Unlimited Access) ---");
  const r4 = await monetizedSqlTool({ sql: "SELECT revenue FROM metrics", userId: "corp_analyst" });
  console.log(r4.content[0].text);
}

runSqlAgentServer().catch(console.error);
