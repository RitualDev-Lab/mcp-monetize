import crypto from "node:crypto";

export interface UniversalCreditPack {
  id: "STARTER_PACK" | "PRO_PACK" | "ENTERPRISE_PACK";
  name: string;
  priceUsd: number;
  credits: number;
  bonusPercentage: number;
}

export const UNIVERSAL_CREDIT_PACKS: Record<string, UniversalCreditPack> = {
  STARTER_PACK: {
    id: "STARTER_PACK",
    name: "Starter Credits",
    priceUsd: 5.0,
    credits: 500,
    bonusPercentage: 0,
  },
  PRO_PACK: {
    id: "PRO_PACK",
    name: "Pro Developer Credits",
    priceUsd: 20.0,
    credits: 2500, // 25% bonus credits
    bonusPercentage: 25,
  },
  ENTERPRISE_PACK: {
    id: "ENTERPRISE_PACK",
    name: "Enterprise Pool Credits",
    priceUsd: 50.0,
    credits: 7000, // 40% bonus credits
    bonusPercentage: 40,
  },
};

export interface SignedCreditVoucher {
  voucherId: string;
  userId: string;
  packId: string;
  credits: number;
  issuedAt: number;
  expiresAt: number;
  signature: string;
}

/**
 * Universal Pre-Paid MCP Credits Voucher Manager.
 * Features constant-time HMAC verification, replay defense, and zero hardcoded fallback secrets.
 */
export class UniversalCreditsManager {
  private signingSecret: string;
  private redeemedVouchers: Set<string> = new Set();

  constructor(signingSecret?: string) {
    const secret = signingSecret || process.env.MCP_MONETIZE_SECRET;
    if (!secret || secret.length < 16) {
      throw new Error(
        "UniversalCreditsManager requires a secure secret of at least 16 bytes (recommended 32+ bytes, configured via constructor or MCP_MONETIZE_SECRET env variable). Default hardcoded secrets are strictly prohibited."
      );
    }
    this.signingSecret = secret;
  }

  public mintVoucher(userId: string, packId: "STARTER_PACK" | "PRO_PACK" | "ENTERPRISE_PACK"): SignedCreditVoucher {
    const pack = UNIVERSAL_CREDIT_PACKS[packId];
    if (!pack) throw new Error(`Invalid credit pack ID: ${packId}`);

    const voucherId = `vouch_${crypto.randomUUID()}`;
    const issuedAt = Date.now();
    const expiresAt = issuedAt + 365 * 24 * 60 * 60 * 1000; // 1 year validity

    const payload = `${voucherId}:${userId}:${pack.credits}:${issuedAt}:${expiresAt}`;
    const signature = crypto.createHmac("sha256", this.signingSecret).update(payload).digest("hex");

    return {
      voucherId,
      userId,
      packId,
      credits: pack.credits,
      issuedAt,
      expiresAt,
      signature,
    };
  }

  /**
   * Cryptographically verifies a credit voucher.
   * Performs constant-time comparison, bounds checking, and replay verification.
   */
  public verifyVoucher(voucher: SignedCreditVoucher, options?: { autoRedeem?: boolean }): boolean {
    if (!voucher || !voucher.voucherId || !voucher.signature) {
      return false;
    }

    // Replay check
    if (this.redeemedVouchers.has(voucher.voucherId)) {
      return false;
    }

    if (Date.now() > voucher.expiresAt) {
      return false;
    }

    const payload = `${voucher.voucherId}:${voucher.userId}:${voucher.credits}:${voucher.issuedAt}:${voucher.expiresAt}`;
    const expectedSig = crypto.createHmac("sha256", this.signingSecret).update(payload).digest("hex");

    const sigBuf = Buffer.from(voucher.signature);
    const expBuf = Buffer.from(expectedSig);

    // Prevent throwing when buffers are different lengths
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return false;
    }

    if (options?.autoRedeem) {
      this.redeemedVouchers.add(voucher.voucherId);
    }

    return true;
  }

  /**
   * Atomically verifies and redeems a credit voucher.
   * Prevents repeated redemptions of the same voucher.
   */
  public redeemVoucher(voucher: SignedCreditVoucher): boolean {
    return this.verifyVoucher(voucher, { autoRedeem: true });
  }

  public isRedeemed(voucherId: string): boolean {
    return this.redeemedVouchers.has(voucherId);
  }
}
