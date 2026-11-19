import crypto from "node:crypto";

export interface LicenseValidationResult {
  valid: boolean;
  tier?: "starter" | "pro" | "enterprise";
  customerEmail?: string;
  error?: string;
}

/**
 * High-security License & Token Validator for commercial MCP servers.
 * Features unambiguous delimiter parsing, constant-time HMAC validation, and zero hardcoded secrets.
 */
export class McpLicenseValidator {
  private signingSecret: string;

  constructor(signingSecret?: string) {
    const secret = signingSecret || process.env.MCP_MONETIZE_SECRET;
    if (!secret || secret.length < 16) {
      throw new Error(
        "McpLicenseValidator requires a secure signing secret key of at least 16 bytes (recommended 32+ bytes, configured via constructor or MCP_MONETIZE_SECRET env variable). Default hardcoded secrets are strictly prohibited."
      );
    }
    this.signingSecret = secret;
  }

  /**
   * Generates a tamper-proof commercial license key.
   * Format: MCP-<TIER>-<BASE64URL_PAYLOAD>-<HMAC_16>
   */
  generateLicenseKey(payload: { customerEmail: string; tier: string; expiresAt?: string }): string {
    const raw = `${payload.customerEmail}:${payload.tier}:${payload.expiresAt || "lifetime"}`;
    const hmac = crypto.createHmac("sha256", this.signingSecret).update(raw).digest("hex").slice(0, 16);
    const encoded = Buffer.from(raw).toString("base64url");
    return `MCP-${payload.tier.toUpperCase()}-${encoded}-${hmac.toUpperCase()}`;
  }

  /**
   * Validates a customer license key offline in < 0.1ms without external network requests.
   * Tolerates hyphens inside base64url payloads and performs constant-time cryptographic verification.
   */
  validateLicenseKey(key: string): LicenseValidationResult {
    const prefix = "MCP-";
    if (!key || typeof key !== "string" || !key.startsWith(prefix)) {
      return { valid: false, error: "Invalid license format. Must start with MCP-" };
    }

    const withoutPrefix = key.slice(prefix.length);
    const firstDash = withoutPrefix.indexOf("-");
    const lastDash = withoutPrefix.lastIndexOf("-");

    if (firstDash === -1 || lastDash === -1 || firstDash === lastDash) {
      return { valid: false, error: "Malformed license key structure." };
    }

    const tier = withoutPrefix.slice(0, firstDash);
    const encodedPayload = withoutPrefix.slice(firstDash + 1, lastDash);
    const receivedHmac = withoutPrefix.slice(lastDash + 1);

    try {
      const raw = Buffer.from(encodedPayload, "base64url").toString("utf8");
      const [email, expectedTier, expiresAt] = raw.split(":");

      const computedHmac = crypto
        .createHmac("sha256", this.signingSecret)
        .update(raw)
        .digest("hex")
        .slice(0, 16)
        .toUpperCase();

      const compBuf = Buffer.from(computedHmac);
      const recvBuf = Buffer.from(receivedHmac.toUpperCase());

      // Constant-time comparison
      if (compBuf.length !== recvBuf.length || !crypto.timingSafeEqual(compBuf, recvBuf)) {
        return { valid: false, error: "Cryptographic signature mismatch. License is invalid or revoked." };
      }

      if (expiresAt !== "lifetime" && new Date(expiresAt).getTime() < Date.now()) {
        return { valid: false, error: "License key has expired." };
      }

      return {
        valid: true,
        tier: (expectedTier || tier).toLowerCase() as any,
        customerEmail: email,
      };
    } catch {
      return { valid: false, error: "Failed to decode license signature." };
    }
  }
}
