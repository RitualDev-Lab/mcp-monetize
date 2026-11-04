import { generatePaywallResponse } from "./paywall.js";
import { MemoryTokenStore } from "./store.js";
import type { McpMonetizeOptions, McpToolCallResult } from "./types.js";

/**
 * Wraps an MCP tool handler with automated paywall, quota, and credit verification.
 * Compatible with @modelcontextprotocol/sdk Server tool definitions.
 *
 * @example
 * ```typescript
 * server.tool(
 *   "deep_research",
 *   { query: z.string() },
 *   withMcpMonetization(async (args) => {
 *     return { content: [{ type: "text", text: `Results for ${args.query}` }] };
 *   }, {
 *     checkoutUrl: "https://checkout.dodopayments.com/buy/pdt_xyz",
 *     priceLabel: "$5 for 500 queries",
 *     freeTierCalls: 5
 *   })
 * );
 * ```
 */
export function withMcpMonetization<TArgs extends Record<string, any> = Record<string, any>>(
  handler: (args: TArgs, extra?: any) => Promise<McpToolCallResult> | McpToolCallResult,
  options: McpMonetizeOptions
): (args: TArgs, extra?: any) => Promise<McpToolCallResult> {
  const freeTierCalls = options.freeTierCalls ?? 5;
  const priceLabel = options.priceLabel || "$0.05 / call";
  const store = options.store || new MemoryTokenStore(freeTierCalls);

  return async (args: TArgs, extra?: any): Promise<McpToolCallResult> => {
    // 1. Resolve User / Client Identifier
    let userId: string;
    if (options.getUserId) {
      userId = options.getUserId(args, extra);
    } else if (args && typeof args.userId === "string") {
      userId = args.userId;
    } else if (args && typeof args.apiKey === "string") {
      userId = args.apiKey;
    } else if (extra && extra.sessionId) {
      userId = String(extra.sessionId);
    } else {
      // Default to host/machine fallback identifier for single-seat local agents (Claude Desktop / Cursor)
      userId = process.env.USER || process.env.USERNAME || "default_client";
    }

    // 2. Resolve Checkout URL (can be dynamic function based on userId)
    const checkoutUrl =
      typeof options.checkoutUrl === "function"
        ? options.checkoutUrl(userId)
        : options.checkoutUrl;

    // 3. Attempt to decrement credit or verify active subscription
    const isAllowed = await Promise.resolve(store.decrementCredit(userId));

    if (!isAllowed) {
      return generatePaywallResponse({
        userId,
        checkoutUrl,
        priceLabel,
        toolName: extra?.name || (args as any)?._toolName,
        customMessage: options.customPaywallMessage,
      });
    }

    // 4. Authorized — execute tool logic
    return handler(args, extra);
  };
}

export const monetizeTool = withMcpMonetization;
