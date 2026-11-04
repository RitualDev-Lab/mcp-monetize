import type { TokenStore, UserCredits } from "../types.js";

export interface UpstashRedisOptions {
  url: string;
  token: string;
  keyPrefix?: string;
  defaultFreeCalls?: number;
}

/**
 * Serverless-compatible Redis Token Store for Upstash or standard HTTP Redis proxies.
 */
export class UpstashRedisTokenStore implements TokenStore {
  private url: string;
  private token: string;
  private prefix: string;
  private defaultFreeCalls: number;

  constructor(options: UpstashRedisOptions) {
    this.url = options.url.replace(/\/$/, "");
    this.token = options.token;
    this.prefix = options.keyPrefix || "mcp_credits:";
    this.defaultFreeCalls = options.defaultFreeCalls ?? 5;
  }

  private async command(cmd: string, ...args: any[]): Promise<any> {
    const res = await fetch(`${this.url}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([cmd, ...args]),
    });
    const json = (await res.json()) as any;
    return json.result;
  }

  async getUser(userId: string): Promise<UserCredits> {
    const key = `${this.prefix}${userId}`;
    const raw = await this.command("GET", key);

    if (!raw) {
      const newUser: UserCredits = {
        userId,
        freeCallsRemaining: this.defaultFreeCalls,
        paidCredits: 0,
        totalCallsMade: 0,
        isSubscriber: false,
      };
      await this.saveUser(newUser);
      return newUser;
    }

    try {
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      return {
        userId,
        freeCallsRemaining: this.defaultFreeCalls,
        paidCredits: 0,
        totalCallsMade: 0,
        isSubscriber: false,
      };
    }
  }

  async saveUser(user: UserCredits): Promise<void> {
    const key = `${this.prefix}${user.userId}`;
    await this.command("SET", key, JSON.stringify(user));
  }

  async decrementCredit(userId: string): Promise<boolean> {
    const user = await this.getUser(userId);

    // Active subscription
    if (user.isSubscriber) {
      if (user.subscriptionExpiresAt && new Date(user.subscriptionExpiresAt) < new Date()) {
        user.isSubscriber = false;
      } else {
        user.totalCallsMade += 1;
        await this.saveUser(user);
        return true;
      }
    }

    // Free tier
    if (user.freeCallsRemaining > 0) {
      user.freeCallsRemaining -= 1;
      user.totalCallsMade += 1;
      await this.saveUser(user);
      return true;
    }

    // Paid credits
    if (user.paidCredits > 0) {
      user.paidCredits -= 1;
      user.totalCallsMade += 1;
      await this.saveUser(user);
      return true;
    }

    return false;
  }

  async addPaidCredits(userId: string, count: number): Promise<void> {
    const user = await this.getUser(userId);
    user.paidCredits += count;
    await this.saveUser(user);
  }
}
