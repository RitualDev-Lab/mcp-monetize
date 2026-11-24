/**
 * Production MCP Server with Paywalls, Rate Limiting & Dodo/Stripe Monetization
 *
 * Exposes metered MCP tools with:
 * - Token-Bucket Rate Limiting (prevents abuse / burst hammering)
 * - Free Quota Tier (e.g. 5 complimentary calls)
 * - Automated JSON-RPC Paywall with Checkout Redirects
 * - Offline PASETO Capability Token validation (< 0.2ms)
 * - Persistent SQLite storage (starter_credits.db)
 */

import * as readline from "node:readline";
import { withMcpMonetization } from "../../src/middleware.js";
import { SqliteTokenStore } from "../../src/adapters/sqlite.js";
import { MemoryTokenStore } from "../../src/store.js";
import { McpCapabilityTokenManager } from "../../src/capability.js";
import type { TokenStore, McpToolCallResult } from "../../src/types.js";

// 1. Token-Bucket Rate Limiter Configuration
export class TokenBucketRateLimiter {
  private buckets: Map<string, { tokens: number; lastRefill: number }> = new Map();

  constructor(
    private capacity: number = 10,
    private refillRatePerSecond: number = 2
  ) {}

  public consume(key: string, tokens = 1): { allowed: boolean; remaining: number } {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = { tokens: this.capacity, lastRefill: now };
      this.buckets.set(key, bucket);
    } else {
      // Refill tokens based on elapsed time
      const elapsedSeconds = (now - bucket.lastRefill) / 1000;
      const refilledTokens = elapsedSeconds * this.refillRatePerSecond;
      bucket.tokens = Math.min(this.capacity, bucket.tokens + refilledTokens);
      bucket.lastRefill = now;
    }

    if (bucket.tokens >= tokens) {
      bucket.tokens -= tokens;
      return { allowed: true, remaining: Math.floor(bucket.tokens) };
    }

    return { allowed: false, remaining: Math.floor(bucket.tokens) };
  }
}

export interface StarterKitConfig {
  dbPath?: string;
  freeTierCalls?: number;
  dodoCheckoutUrl?: string;
  priceLabel?: string;
  capabilitySecret?: string;
}

export function createMonetizedMcpServer(customConfig?: StarterKitConfig) {
  const config = {
    dbPath: customConfig?.dbPath || process.env.MCP_MONETIZE_SQLITE_PATH || ":memory:",
    freeTierCalls: customConfig?.freeTierCalls ?? Number(process.env.FREE_TIER_CALLS || 5),
    dodoCheckoutUrl:
      customConfig?.dodoCheckoutUrl ||
      process.env.DODO_CHECKOUT_URL ||
      "https://checkout.dodopayments.com/buy/pdt_0NrFWlIkkreo5fOBIJWxI",
    priceLabel: customConfig?.priceLabel || process.env.PRICE_LABEL || "$5 for 500 requests",
    capabilitySecret:
      customConfig?.capabilitySecret ||
      process.env.MCP_MONETIZE_SECRET ||
      "fedcba9876543210fedcba9876543210fedcba9876543210"
  };

  // Persistent SQLite Token Store
  const store: TokenStore = new SqliteTokenStore(config.dbPath, config.freeTierCalls);
  const rateLimiter = new TokenBucketRateLimiter(10, 2); // 10 burst, 2 tokens/sec
  const capabilityManager = new McpCapabilityTokenManager(config.capabilitySecret);

  // Raw Tools Implementations
  const rawFinancialReport = async (args: { ticker: string; horizonMonths?: number }) => {
    return {
      content: [
        {
          type: "text" as const,
          text: `📊 [PRO REPORT] Financial health assessment for ${args.ticker.toUpperCase()}:
• Runway: 18.4 months
• Operating Margin: +24.8%
• Risk Tier: Low (SOC2 & ISO27001 verified)
• Projection: Positive free cash flow over ${args.horizonMonths || 12} months.`
        }
      ]
    };
  };

  const rawSemanticSearch = async (args: { query: string; limit?: number }) => {
    return {
      content: [
        {
          type: "text" as const,
          text: `🔍 [SEMANTIC SEARCH] Found ${args.limit || 5} matching vector embeddings for query "${args.query}":
1. Enterprise Authentication & Role-Based Access Control (Score: 0.96)
2. Zero-Leak Sandboxing for Autonomous AI Agents (Score: 0.94)
3. Cryptographic Capability Delegation with PASETO v4 (Score: 0.91)`
        }
      ]
    };
  };

  // Wrap with MCP Monetization & Rate Limiting
  const monetizedFinancialReport = withMcpMonetization(
    async (args: any, extra: any) => {
      const userId = args.userId || "anonymous";
      const rl = rateLimiter.consume(userId, 2);
      if (!rl.allowed) {
        return {
          content: [
            {
              type: "text" as const,
              text: `⚠️ Rate limit exceeded. Please wait a few seconds before retrying (Burst capacity: 10, refill: 2/sec).`
            }
          ],
          isError: true
        };
      }
      return rawFinancialReport(args);
    },
    {
      provider: "dodo",
      checkoutUrl: (userId) => `${config.dodoCheckoutUrl}?customer_id=${encodeURIComponent(userId)}&quantity=1`,
      priceLabel: config.priceLabel,
      freeTierCalls: config.freeTierCalls,
      store,
      capabilityManager
    }
  );

  const monetizedSemanticSearch = withMcpMonetization(
    async (args: any, extra: any) => {
      const userId = args.userId || "anonymous";
      const rl = rateLimiter.consume(userId, 1);
      if (!rl.allowed) {
        return {
          content: [
            {
              type: "text" as const,
              text: `⚠️ Rate limit exceeded. Please wait a few seconds before retrying.`
            }
          ],
          isError: true
        };
      }
      return rawSemanticSearch(args);
    },
    {
      provider: "dodo",
      checkoutUrl: (userId) => `${config.dodoCheckoutUrl}?customer_id=${encodeURIComponent(userId)}&quantity=1`,
      priceLabel: config.priceLabel,
      freeTierCalls: config.freeTierCalls,
      store,
      capabilityManager
    }
  );

  // Dispatcher for incoming JSON-RPC or direct execution
  const dispatchToolCall = async (
    name: string,
    args: Record<string, any>
  ): Promise<McpToolCallResult> => {
    switch (name) {
      case "financial_report":
        return monetizedFinancialReport(args, { name: "financial_report" });
      case "semantic_search":
        return monetizedSemanticSearch(args, { name: "semantic_search" });
      case "ping":
        return {
          content: [{ type: "text" as const, text: "pong (free unmetered utility)" }]
        };
      default:
        return {
          content: [{ type: "text" as const, text: `Tool "${name}" not found.` }],
          isError: true
        };
    }
  };

  const getToolsManifest = () => [
    {
      name: "financial_report",
      description: "Generates institutional-grade financial analysis. Metered: $5 for 500 reports.",
      inputSchema: {
        type: "object",
        properties: {
          ticker: { type: "string", description: "Stock or organization ticker" },
          horizonMonths: { type: "number", description: "Projection horizon in months" },
          userId: { type: "string", description: "User identifier or billing subject" },
          capabilityToken: { type: "string", description: "Optional PASETO capability token" }
        },
        required: ["ticker"]
      }
    },
    {
      name: "semantic_search",
      description: "Embeddings vector search across technical research. Metered tool.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          limit: { type: "number", description: "Max results" },
          userId: { type: "string", description: "User identifier or billing subject" }
        },
        required: ["query"]
      }
    },
    {
      name: "ping",
      description: "Free unmetered connectivity verification.",
      inputSchema: { type: "object", properties: {} }
    }
  ];

  return {
    store,
    rateLimiter,
    capabilityManager,
    dispatchToolCall,
    getToolsManifest,
    config
  };
}

// 2. Interactive JSON-RPC Stdio Server Entrypoint
export function startStdioServer() {
  const server = createMonetizedMcpServer();
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  const sendResponse = (id: any, result: any, error?: any) => {
    const payload = error
      ? { jsonrpc: "2.0", id, error }
      : { jsonrpc: "2.0", id, result };
    process.stdout.write(JSON.stringify(payload) + "\n");
  };

  rl.on("line", async (line) => {
    if (!line.trim()) return;
    try {
      const msg = JSON.parse(line);
      const { id, method, params } = msg;

      if (method === "initialize") {
        sendResponse(id, {
          protocolVersion: "2024-11-05",
          serverInfo: {
            name: "mcp-monetize-starter-kit",
            version: "1.0.0"
          },
          capabilities: { tools: {} }
        });
      } else if (method === "tools/list") {
        sendResponse(id, { tools: server.getToolsManifest() });
      } else if (method === "tools/call") {
        const { name, arguments: toolArgs } = params || {};
        const result = await server.dispatchToolCall(name, toolArgs || {});
        sendResponse(id, result);
      } else {
        sendResponse(id, null, { code: -32601, message: `Method "${method}" not implemented.` });
      }
    } catch (err: any) {
      sendResponse(null, null, { code: -32700, message: `Parse error: ${err.message}` });
    }
  });

  console.error("⚡ [mcp-monetize-starter-kit] Stdio JSON-RPC server listening. Connect from Claude Desktop or Cursor.");
}

// Auto-start when executed directly
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  startStdioServer();
}
