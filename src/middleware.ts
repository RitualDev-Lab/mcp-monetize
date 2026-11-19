import crypto from "node:crypto";
import { generatePaywallResponse } from "./paywall.js";
import { MemoryTokenStore } from "./store.js";
import { McpCapabilityTokenManager } from "./capability.js";
import type { McpMonetizeOptions, McpToolCallResult } from "./types.js";

/**
 * Wraps an MCP tool handler with automated paywall, quota, credit verification,
 * and cryptographic capability token validation with server-side spend tracking.
 * Compatible with @modelcontextprotocol/sdk Server tool definitions.
 */
export function withMcpMonetization<TArgs extends Record<string, any> = Record<string, any>>(
  handler: (args: TArgs, extra?: any) => Promise<McpToolCallResult> | McpToolCallResult,
  options: McpMonetizeOptions
): (args: TArgs, extra?: any) => Promise<McpToolCallResult> {
  const freeTierCalls = options.freeTierCalls ?? 5;
  const priceLabel = options.priceLabel || "$0.05 / call";
  const store = options.store || new MemoryTokenStore(freeTierCalls);
  
  // Initialize capability manager with explicit secret or fallback environment variable
  let capabilityManager: McpCapabilityTokenManager | undefined = options.capabilityManager;
  if (!capabilityManager) {
    const secret = options.capabilitySecret || process.env.MCP_MONETIZE_SECRET;
    if (secret && secret.length >= 16) {
      capabilityManager = new McpCapabilityTokenManager(secret);
    }
  }

  return async (args: TArgs, extra?: any): Promise<McpToolCallResult> => {
    // 0. Cryptographic Capability Token Verification (Sub-millisecond offline path)
    const presentedToken =
      (args && (args.capabilityToken || args._capabilityToken)) ||
      (extra && (extra.capabilityToken || extra._capabilityToken));

    if (typeof presentedToken === "string") {
      if (!capabilityManager) {
        return {
          content: [
            {
              type: "text",
              text: "[MCP-MONETIZE] Capability token presented but capabilityManager secret is not configured.",
            },
          ],
          isError: true,
        };
      }

      const toolScope = options.requiredScope || (extra?.name ? `tool:${extra.name}` : undefined);
      const verification = capabilityManager.verifyToken(presentedToken, toolScope);

      if (verification.valid && verification.payload) {
        // Enforce server-side credit balance decrement on each call
        const spend = capabilityManager.spendToken(
          verification.payload.tokenId,
          verification.payload.creditsRemaining,
          1
        );

        if (!spend.allowed) {
          return {
            content: [
              {
                type: "text",
                text: "[MCP-MONETIZE] Insufficient capability token balance. Please acquire a fresh capability token.",
              },
            ],
            isError: true,
          };
        }

        // Authenticated cryptographically — bind identity to verified subject
        const tokenUser = verification.payload.subject;
        if (extra && typeof extra === "object") {
          extra.authenticatedUser = tokenUser;
        }

        return handler(args, extra);
      } else {
        return {
          content: [
            {
              type: "text",
              text: `[MCP-MONETIZE] Capability verification failed: ${verification.error || "Invalid token"}`,
            },
          ],
          isError: true,
        };
      }
    }

    // 1. Resolve User / Client Identifier from verified transport / session first
    let userId: string;
    if (options.getUserId) {
      userId = options.getUserId(args, extra);
    } else if (extra?.auth?.userId) {
      userId = String(extra.auth.userId);
    } else if (extra?.sessionId) {
      userId = String(extra.sessionId);
    } else if (extra?.connection?.id) {
      userId = String(extra.connection.id);
    } else if (args && typeof args.userId === "string" && options.allowClientSuppliedUserId !== false) {
      userId = args.userId;
    } else if (args && typeof args.apiKey === "string" && options.allowClientSuppliedUserId !== false) {
      userId = args.apiKey;
    } else {
      // Default to deterministic host identity hash for single-seat local agents (Claude Desktop / Cursor)
      const hostUser = process.env.USER || process.env.USERNAME || "local_agent";
      userId = `agent_${crypto.createHash("sha256").update(hostUser).digest("hex").slice(0, 16)}`;
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
