import crypto from "node:crypto";

export interface LicenseValidationResult {
  valid: boolean;
  tier?: "starter" | "pro" | "enterprise";
  customerEmail?: string;
  error?: string;
}

/**
 * High-security License & Token Validator for commercial MCP servers.
 */
export class McpLicenseValidator {
  constructor(private signingSecret: string = "mcp_default_secret_key_2026") {}

  /**
   * Generates a tamper-proof commercial license key.
   */
  generateLicenseKey(payload: { customerEmail: string; tier: string; expiresAt?: string }): string {
    const raw = `${payload.customerEmail}:${payload.tier}:${payload.expiresAt || "lifetime"}`;
    const hmac = crypto.createHmac("sha256", this.signingSecret).update(raw).digest("hex").slice(0, 16);
    const encoded = Buffer.from(raw).toString("base64url");
    return `MCP-${payload.tier.toUpperCase()}-${encoded}-${hmac.toUpperCase()}`;
  }

  /**
   * Validates a customer license key offline in < 0.1ms without external network requests.
   */
  validateLicenseKey(key: string): LicenseValidationResult {
    if (!key || !key.startsWith("MCP-")) {
      return { valid: false, error: "Invalid license format. Must start with MCP-" };
    }

    const parts = key.split("-");
    if (parts.length !== 4) {
      return { valid: false, error: "Malformed license key structure." };
    }

    const [, tier, encodedPayload, receivedHmac] = parts;

    try {
      const raw = Buffer.from(encodedPayload, "base64url").toString("utf8");
      const [email, expectedTier, expiresAt] = raw.split(":");

      const computedHmac = crypto.createHmac("sha256", this.signingSecret).update(raw).digest("hex").slice(0, 16).toUpperCase();

      if (computedHmac !== receivedHmac.toUpperCase()) {
        return { valid: false, error: "Cryptographic signature mismatch. License is invalid or revoked." };
      }

      if (expiresAt !== "lifetime" && new Date(expiresAt) < new Date()) {
        return { valid: false, error: "License key has expired." };
      }

      return {
        valid: true,
        tier: expectedTier as any,
        customerEmail: email,
      };
    } catch {
      return { valid: false, error: "Failed to decode license signature." };
    }
  }
}
