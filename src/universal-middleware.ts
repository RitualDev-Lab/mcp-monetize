import crypto from "node:crypto";
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
  authenticated?: boolean;
  sessionId?: string;
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

    // Partition unauthenticated anonymous users by session rather than a global shared balance
    let userId: string;
    if (req.userId) {
      userId = req.userId;
    } else if (req.sessionId) {
      userId = `session_${req.sessionId}`;
    } else {
      userId = `anon_${crypto.randomUUID().slice(0, 8)}`;
    }

    // Bypass list ONLY permitted for verified authenticated sessions
    const isAuthenticated = Boolean(req.authenticated || req.userId);
    if (isAuthenticated && options.bypassUsers && options.bypassUsers.includes(userId)) {
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
          message: debitResult.error || "Insufficient Universal MCP Credits. Please top up your balance.",
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
