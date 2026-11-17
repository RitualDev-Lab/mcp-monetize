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

export class UniversalCreditsManager {
  private signingSecret: string;

  constructor(signingSecret?: string) {
    this.signingSecret = signingSecret || "ritual-mcp-universal-clearinghouse-secret-key-32b";
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

  public verifyVoucher(voucher: SignedCreditVoucher): boolean {
    if (Date.now() > voucher.expiresAt) return false;

    const payload = `${voucher.voucherId}:${voucher.userId}:${voucher.credits}:${voucher.issuedAt}:${voucher.expiresAt}`;
    const expectedSig = crypto.createHmac("sha256", this.signingSecret).update(payload).digest("hex");

    return crypto.timingSafeEqual(Buffer.from(voucher.signature), Buffer.from(expectedSig));
  }
}
