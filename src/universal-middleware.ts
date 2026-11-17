import { EdgeBillingClearinghouse } from "./clearinghouse.js";

export interface UniversalMonetizeOptions {
  toolPriceCredits: Record<string, number>;
  creatorWallet: string;
  clearinghouse?: EdgeBillingClearinghouse;
  bypassUsers?: string[];
}

export interface McpCallRequest {
  method: string;
  params: {
    name: string;
    arguments?: Record<string, unknown>;
  };
  userId?: string;
}

export interface McpCallResponse {
  content?: Array<{ type: string; text: string }>;
  isError?: boolean;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * 3-Line Developer Integration SDK:
 * Wrap any MCP request handler with Universal Pre-Paid MCP Credits monetization
 */
export function withUniversalMcpMonetize<T extends (req: McpCallRequest) => Promise<McpCallResponse>>(
  handler: T,
  options: UniversalMonetizeOptions,
): (req: McpCallRequest) => Promise<McpCallResponse> {
  const clearinghouse = options.clearinghouse || new EdgeBillingClearinghouse();

  return async (req: McpCallRequest): Promise<McpCallResponse> => {
    if (req.method !== "tools/call") {
      return handler(req);
    }

    const toolName = req.params?.name;
    const price = options.toolPriceCredits[toolName] || 0;

    // Free tool call
    if (price <= 0) {
      return handler(req);
    }

    const userId = req.userId || "anonymous_agent";

    // Bypass list for internal testing
    if (options.bypassUsers && options.bypassUsers.includes(userId)) {
      return handler(req);
    }

    // Atomically debit Universal MCP Credits with 3.5% clearinghouse platform fee
    const debitResult = await clearinghouse.processToolCallDebit({
      userId,
      toolId: toolName,
      creditsCost: price,
      creatorWallet: options.creatorWallet,
    });

    if (!debitResult.success) {
      return {
        isError: true,
        error: {
          code: -32002, // Standard PaywallRequired error
          message: debitResult.error || "Insufficient Universal MCP Credits.",
          data: {
            requiredCredits: price,
            tool: toolName,
            checkoutUrl: "https://ritualdev.in/credits",
          },
        },
      };
    }

    // Execute downstream tool handler
    const response = await handler(req);

    // Attach transaction receipt metadata
    if (response.content && Array.isArray(response.content) && debitResult.transaction) {
      response.content.push({
        type: "text",
        text: `\n[Universal MCP Clearinghouse] Debited: ${price} credits | Tx: ${debitResult.transaction.id.substring(0, 11)}...`,
      });
    }

    return response;
  };
}
