import fs from "node:fs";
import path from "node:path";
import type { TokenStore, UserCredits } from "./types.js";

export class MemoryTokenStore implements TokenStore {
  private users: Map<string, UserCredits> = new Map();

  constructor(private defaultFreeCalls: number = 5) {}

  getUser(userId: string): UserCredits {
    let user = this.users.get(userId);
    if (!user) {
      user = {
        userId,
        freeCallsRemaining: this.defaultFreeCalls,
        paidCredits: 0,
        totalCallsMade: 0,
        isSubscriber: false,
      };
      this.users.set(userId, user);
    }
    return user;
  }

  saveUser(user: UserCredits): void {
    this.users.set(user.userId, user);
  }

  decrementCredit(userId: string): boolean {
    const user = this.getUser(userId);

    // Active subscriber always allowed
    if (user.isSubscriber) {
      if (user.subscriptionExpiresAt && new Date(user.subscriptionExpiresAt) < new Date()) {
        user.isSubscriber = false;
      } else {
        user.totalCallsMade += 1;
        this.saveUser(user);
        return true;
      }
    }

    // Use free tier first
    if (user.freeCallsRemaining > 0) {
      user.freeCallsRemaining -= 1;
      user.totalCallsMade += 1;
      this.saveUser(user);
      return true;
    }

    // Use paid credits
    if (user.paidCredits > 0) {
      user.paidCredits -= 1;
      user.totalCallsMade += 1;
      this.saveUser(user);
      return true;
    }

    // Credits exhausted
    return false;
  }

  addPaidCredits(userId: string, credits: number): void {
    const user = this.getUser(userId);
    user.paidCredits += credits;
    this.saveUser(user);
  }

  setSubscription(userId: string, isSubscriber: boolean, expiresAt?: string): void {
    const user = this.getUser(userId);
    user.isSubscriber = isSubscriber;
    user.subscriptionExpiresAt = expiresAt;
    this.saveUser(user);
  }
}

export class JsonFileTokenStore extends MemoryTokenStore {
  private filePath: string;

  constructor(filePath?: string, defaultFreeCalls: number = 5) {
    super(defaultFreeCalls);
    this.filePath = filePath || path.join(process.cwd(), "mcp-credits.json");
    this.loadFromFile();
  }

  private loadFromFile(): void {
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, "utf8");
        const parsed = JSON.parse(raw);
        for (const [key, val] of Object.entries(parsed)) {
          this.saveUser(val as UserCredits);
        }
      } catch (err) {
        console.warn("[mcp-monetize] Could not read credit file:", err);
      }
    }
  }

  private persistToFile(): void {
    try {
      const data: Record<string, UserCredits> = {};
      // Access inherited users map
      const keys = (this as any).users?.keys() || [];
      for (const k of keys) {
        data[k] = (this as any).users.get(k);
      }
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), "utf8");
    } catch (err) {
      console.warn("[mcp-monetize] Could not persist credit file:", err);
    }
  }

  override saveUser(user: UserCredits): void {
    super.saveUser(user);
    this.persistToFile();
  }
}
