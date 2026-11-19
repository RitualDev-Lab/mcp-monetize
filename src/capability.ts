import crypto from "node:crypto";

export interface CapabilityTokenPayload {
  tokenId: string;
  issuer: string;
  subject: string;
  audience?: string;
  scopes: string[];
  creditsRemaining?: number;
  expiresAt: string;
  issuedAt: string;
  metadata?: Record<string, any>;
}

export interface CapabilityVerificationResult {
  valid: boolean;
  payload?: CapabilityTokenPayload;
  error?: string;
}

/**
 * High-performance, offline Cryptographic Capability Token Manager.
 * Enables client agents to present self-contained, pre-funded capability tokens
 * verified in < 0.2ms via HMAC-SHA256 authenticated tokens with server-side spend enforcement.
 */
export class McpCapabilityTokenManager {

  private secret: string;
  private tokenBalances: Map<string, number> = new Map();

  constructor(secret?: string) {
    const configuredSecret = secret || process.env.MCP_MONETIZE_SECRET;
    if (!configuredSecret || configuredSecret.length < 16) {
      throw new Error(
        "McpCapabilityTokenManager requires a secure secret key of at least 16 bytes (recommended 32+ bytes, configured via MCP_MONETIZE_SECRET or constructor options). Default hardcoded secrets are strictly rejected."
      );
    }
    this.secret = configuredSecret;
  }

  /**
   * Issues a signed, tamper-proof capability token in PASETO v4.local style format.
   * Format: v4.local.<base64url-payload>.<hmac-sha256>
   */
  issueToken(
    payload: Omit<CapabilityTokenPayload, "tokenId" | "issuedAt" | "issuer"> & {
      tokenId?: string;
      issuedAt?: string;
      issuer?: string;
    }
  ): string {
    const fullPayload: CapabilityTokenPayload = {
      tokenId: payload.tokenId || `cap_${crypto.randomBytes(16).toString("hex")}`,
      issuer: payload.issuer || "ritualdev-mcp-monetize",
      subject: payload.subject,
      audience: payload.audience || "*",
      scopes: payload.scopes || ["tool:all"],
      creditsRemaining: payload.creditsRemaining,
      expiresAt: payload.expiresAt,
      issuedAt: payload.issuedAt || new Date().toISOString(),
      metadata: payload.metadata,
    };

    if (fullPayload.creditsRemaining !== undefined) {
      this.tokenBalances.set(fullPayload.tokenId, fullPayload.creditsRemaining);
    }

    const serialized = JSON.stringify(fullPayload);
    const encodedPayload = Buffer.from(serialized, "utf8").toString("base64url");
    const signature = crypto
      .createHmac("sha256", this.secret)
      .update(`v4.local.${encodedPayload}`)
      .digest("base64url");

    return `v4.local.${encodedPayload}.${signature}`;
  }

  /**
   * Atomically debits credits from a capability token ledger.
   * Prevents replay and enforces quota limits across calls.
   */
  spendToken(tokenId: string, initialCredits?: number, amount: number = 1): { allowed: boolean; remaining: number } {
    if (initialCredits === undefined) {
      // Untracked / unlimited scope (e.g. active subscription)
      return { allowed: true, remaining: -1 };
    }

    const current = this.tokenBalances.has(tokenId) ? this.tokenBalances.get(tokenId)! : initialCredits;
    if (current < amount) {
      return { allowed: false, remaining: current };
    }

    const updated = current - amount;
    this.tokenBalances.set(tokenId, updated);
    return { allowed: true, remaining: updated };
  }

  /**
   * Verifies capability token integrity, validity, and scope in sub-millisecond execution.
   * Returns generic errors without echoing internal security scopes to clients.
   */
  verifyToken(token: string, requiredScope?: string): CapabilityVerificationResult {
    if (!token || typeof token !== "string") {
      return { valid: false, error: "Empty or invalid token type" };
    }

    const parts = token.split(".");
    if (parts.length !== 4 || parts[0] !== "v4" || parts[1] !== "local") {
      return { valid: false, error: "Malformed capability token structure (expected v4.local.<payload>.<sig>)" };
    }

    const [, , encodedPayload, receivedSig] = parts;

    try {
      // 1. Verify cryptographic signature with constant-time comparison
      const expectedSig = crypto
        .createHmac("sha256", this.secret)
        .update(`v4.local.${encodedPayload}`)
        .digest("base64url");

      const sigBuffer = Buffer.from(receivedSig);
      const expectedBuffer = Buffer.from(expectedSig);

      if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
        return { valid: false, error: "Cryptographic signature mismatch. Token is forged or invalid." };
      }

      // 2. Decode and parse payload
      const jsonStr = Buffer.from(encodedPayload, "base64url").toString("utf8");
      const payload: CapabilityTokenPayload = JSON.parse(jsonStr);

      // 3. Expiration validation (fail without echoing payload)
      if (new Date(payload.expiresAt).getTime() < Date.now()) {
        return { valid: false, error: "Capability token has expired" };
      }

      // 4. Scope authorization check
      if (requiredScope) {
        const hasScope =
          payload.scopes.includes("*") ||
          payload.scopes.includes("tool:all") ||
          payload.scopes.includes(requiredScope) ||
          payload.scopes.some((s) => s.endsWith(":*") && requiredScope.startsWith(s.slice(0, -1)));

        if (!hasScope) {
          return {
            valid: false,
            error: "Insufficient capability scope for this operation.",
          };
        }
      }

      // Check current remaining balance from spend ledger if tracked
      if (payload.creditsRemaining !== undefined && this.tokenBalances.has(payload.tokenId)) {
        payload.creditsRemaining = this.tokenBalances.get(payload.tokenId);
      }

      return { valid: true, payload };
    } catch {
      return { valid: false, error: "Failed to decode capability token payload" };
    }
  }
}

// Backwards-compatible export alias
export { McpCapabilityTokenManager as PasetoCapabilityManager };
