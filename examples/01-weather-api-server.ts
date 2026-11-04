import { withMcpMonetization, MemoryTokenStore } from "../src/index.js";

/**
 * Example 1: Monetized Weather API MCP Server
 * Gives users 3 free forecasts, then returns an instant payment link for 500 more calls.
 */
async function runWeatherServer() {
  const store = new MemoryTokenStore(3); // 3 complimentary calls

  const getForecastHandler = async (args: { city: string }) => {
    return {
      content: [
        {
          type: "text" as const,
          text: `⛅ Weather in ${args.city}: 72°F, Sunny, 10mph gentle breeze.`,
        },
      ],
    };
  };

  const monetizedForecast = withMcpMonetization(getForecastHandler, {
    provider: "dodo",
    checkoutUrl: (userId) =>
      `https://checkout.dodopayments.com/buy/pdt_weather_5?customer_id=${encodeURIComponent(userId)}`,
    priceLabel: "$5 for 500 forecasts",
    freeTierCalls: 3,
    store,
  });

  console.log("=== Testing Weather Server Monetization ===");

  for (let i = 1; i <= 4; i++) {
    console.log(`\n--- Forecast Request #${i} ---`);
    const res = await monetizedForecast({ city: "San Francisco", userId: "dev_user_42" });
    console.log(res.content[0].text);
  }
}

runWeatherServer().catch(console.error);
