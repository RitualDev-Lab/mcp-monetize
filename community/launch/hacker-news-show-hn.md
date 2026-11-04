# 🚀 Hacker News Launch Kit: Show HN

---

## 📌 Post Details
- **Title**: Show HN: mcp-monetize – Charge users for Model Context Protocol tools in Claude and Cursor
- **Link**: https://github.com/RitualDev-Lab/mcp-monetize
- **Best Posting Time**: Tuesday / Wednesday / Thursday at 8:00 AM – 10:00 AM EST (12:00 PM – 2:00 PM UTC)

---

## 📝 First Comment (Text Submission or Follow-Up Comment)

> Hey HN!
>
> Over the last few months, Model Context Protocol (MCP) has exploded. We’ve seen hundreds of developers build and release awesome MCP servers for Claude Desktop, Cursor, and Windsurf.
>
> But as soon as developers build a server that calls expensive external APIs, web scraping clusters, or proprietary vector databases, they run into a huge problem: **users burn through thousands of queries, and the creator bears 100% of the cost with zero monetization mechanism**.
>
> We built **mcp-monetize** to solve this. It’s an open-source, 3-line drop-in middleware for `@modelcontextprotocol/sdk`:
>
> ```typescript
> server.tool(
>   "financial_deep_dive",
>   { ticker: z.string() },
>   withMcpMonetization(async ({ ticker }) => {
>     return { content: [{ type: "text", text: await analyzeStock(ticker) }] };
>   }, {
>     checkoutUrl: "https://checkout.dodopayments.com/buy/pdt_xyz",
>     priceLabel: "$5 for 1,000 queries",
>     freeTierCalls: 5 // 5 free queries for every new user
>   })
> );
> ```
>
> ### How it works under the hood:
> 1. When an agent calls the tool, `mcp-monetize` tracks client quotas locally in ephemeral memory, SQLite, or serverless Upstash Redis.
> 2. Once complimentary calls are exhausted, the tool returns a clean, structured interactive Markdown paywall directly to Claude/Cursor with a secure Dodo Payments or Stripe checkout link.
> 3. Included in the repo: pre-built webhook listeners (`payment.succeeded`, `subscription.active`), tamper-proof HMAC license verification, and 3 full production examples (Weather API, SQL Agent with recurring monthly subscription, and Web Scraper).
>
> Repo is MIT licensed: https://github.com/RitualDev-Lab/mcp-monetize
> 
> We also packaged an enterprise starter boilerplate with full Docker & Railway templates for $49 here: https://ritualdev.in/mcp-starter-kit
>
> Would love feedback on the paywall UX inside Claude Desktop and any other payment gateways people would like supported!
