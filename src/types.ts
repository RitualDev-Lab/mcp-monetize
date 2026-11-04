export type PaymentProvider = "dodo" | "stripe" | "custom";

export interface UserCredits {
  userId: string;
  freeCallsRemaining: number;
  paidCredits: number;
  totalCallsMade: number;
  isSubscriber: boolean;
  subscriptionExpiresAt?: string;
}

export interface TokenStore {
  getUser(userId: string): Promise<UserCredits | null> | UserCredits | null;
  saveUser(user: UserCredits): Promise<void> | void;
  decrementCredit(userId: string): Promise<boolean> | boolean;
}

export interface McpMonetizeOptions {
  /** Payment gateway provider (defaults to 'dodo') */
  provider?: PaymentProvider;
  /** Checkout or top-up payment URL (e.g. Dodo Payments product link or Stripe Payment Link) */
  checkoutUrl: string | ((userId: string) => string);
  /** Number of complimentary calls given to a new user before paywall activates (default: 5) */
  freeTierCalls?: number;
  /** Human-readable price or unit description (e.g. "$0.05 / query" or "$9 / month") */
  priceLabel?: string;
  /** Custom function to derive the user or workspace ID from tool call arguments or headers */
  getUserId?: (args: Record<string, any>, extra?: any) => string;
  /** Storage adapter for persistence. Defaults to in-memory store */
  store?: TokenStore;
  /** Custom paywall markdown generator */
  customPaywallMessage?: (info: { userId: string; checkoutUrl: string; priceLabel: string }) => string;
}

export interface McpToolCallResult {
  content: Array<{
    type: "text";
    text: string;
  }>;
  isError?: boolean;
}
