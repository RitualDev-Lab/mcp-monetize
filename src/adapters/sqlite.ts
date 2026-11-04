import type { TokenStore, UserCredits } from "../types.js";

/**
 * High-performance, zero-external-dependency SQLite storage adapter for mcp-monetize.
 * Uses Node.js 22+ built-in node:sqlite DatabaseSync or fallback in-memory SQLite.
 */
export class SqliteTokenStore implements TokenStore {
  private db: any;

  constructor(dbPath: string = ":memory:", private defaultFreeCalls: number = 5) {
    try {
      // Dynamic import or require of node:sqlite
      const { DatabaseSync } = require("node:sqlite");
      this.db = new DatabaseSync(dbPath);
      this.initSchema();
    } catch (err: any) {
      console.warn("[mcp-monetize] node:sqlite not available, falling back to mock memory storage.");
    }
  }

  private initSchema() {
    if (!this.db) return;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS mcp_user_credits (
        user_id TEXT PRIMARY KEY,
        free_calls INTEGER NOT NULL,
        paid_credits INTEGER NOT NULL,
        total_calls INTEGER NOT NULL,
        is_subscriber INTEGER NOT NULL DEFAULT 0,
        subscription_expires_at TEXT
      );
    `);
  }

  getUser(userId: string): UserCredits {
    if (!this.db) {
      return {
        userId,
        freeCallsRemaining: this.defaultFreeCalls,
        paidCredits: 0,
        totalCallsMade: 0,
        isSubscriber: false,
      };
    }

    const stmt = this.db.prepare("SELECT * FROM mcp_user_credits WHERE user_id = ?");
    const row = stmt.get(userId) as any;

    if (!row) {
      const newUser: UserCredits = {
        userId,
        freeCallsRemaining: this.defaultFreeCalls,
        paidCredits: 0,
        totalCallsMade: 0,
        isSubscriber: false,
      };
      this.saveUser(newUser);
      return newUser;
    }

    return {
      userId: row.user_id,
      freeCallsRemaining: row.free_calls,
      paidCredits: row.paid_credits,
      totalCallsMade: row.total_calls,
      isSubscriber: Boolean(row.is_subscriber),
      subscriptionExpiresAt: row.subscription_expires_at || undefined,
    };
  }

  saveUser(user: UserCredits): void {
    if (!this.db) return;
    const stmt = this.db.prepare(`
      INSERT INTO mcp_user_credits (user_id, free_calls, paid_credits, total_calls, is_subscriber, subscription_expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        free_calls = excluded.free_calls,
        paid_credits = excluded.paid_credits,
        total_calls = excluded.total_calls,
        is_subscriber = excluded.is_subscriber,
        subscription_expires_at = excluded.subscription_expires_at
    `);

    stmt.run(
      user.userId,
      user.freeCallsRemaining,
      user.paidCredits,
      user.totalCallsMade,
      user.isSubscriber ? 1 : 0,
      user.subscriptionExpiresAt || null
    );
  }

  decrementCredit(userId: string): boolean {
    const user = this.getUser(userId);

    // Active subscriber always permitted
    if (user.isSubscriber) {
      if (user.subscriptionExpiresAt && new Date(user.subscriptionExpiresAt) < new Date()) {
        user.isSubscriber = false;
      } else {
        user.totalCallsMade += 1;
        this.saveUser(user);
        return true;
      }
    }

    // Free credits first
    if (user.freeCallsRemaining > 0) {
      user.freeCallsRemaining -= 1;
      user.totalCallsMade += 1;
      this.saveUser(user);
      return true;
    }

    // Paid credits
    if (user.paidCredits > 0) {
      user.paidCredits -= 1;
      user.totalCallsMade += 1;
      this.saveUser(user);
      return true;
    }

    return false;
  }

  addPaidCredits(userId: string, count: number): void {
    const user = this.getUser(userId);
    user.paidCredits += count;
    this.saveUser(user);
  }

  setSubscription(userId: string, isSubscriber: boolean, expiresAt?: string): void {
    const user = this.getUser(userId);
    user.isSubscriber = isSubscriber;
    user.subscriptionExpiresAt = expiresAt;
    this.saveUser(user);
  }
}
