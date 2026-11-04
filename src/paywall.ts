import type { McpToolCallResult } from "./types.js";

export function generatePaywallResponse(options: {
  userId: string;
  checkoutUrl: string;
  priceLabel: string;
  toolName?: string;
  customMessage?: (info: { userId: string; checkoutUrl: string; priceLabel: string }) => string;
}): McpToolCallResult {
  const { userId, checkoutUrl, priceLabel, toolName, customMessage } = options;

  if (customMessage) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: customMessage({ userId, checkoutUrl, priceLabel }),
        },
      ],
    };
  }

  const namePart = toolName ? `\`${toolName}\`` : "this MCP tool";

  const message = [
    `🔒 **Usage Limit Reached for ${namePart}**`,
    "",
    `Your complimentary tool credits have been exhausted. To continue executing queries with uninterrupted speed:`,
    "",
    `### 💳 Unlock Instant Access (${priceLabel})`,
    `👉 **[Click Here to Activate / Top-Up Credits via Secure Checkout](${checkoutUrl})**`,
    "",
    "---",
    `*User Ref: \`${userId}\` • Payments securely powered by Dodo Payments & Stripe.*`,
  ].join("\n");

  return {
    isError: true,
    content: [
      {
        type: "text",
        text: message,
      },
    ],
  };
}
