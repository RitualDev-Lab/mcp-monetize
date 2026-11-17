import assert from "node:assert";
import test from "node:test";
import {
  EdgeBillingClearinghouse,
  UniversalCreditsManager,
  UNIVERSAL_CREDIT_PACKS,
  withUniversalMcpMonetize,
} from "../src/index.js";

test("EdgeBillingClearinghouse - Debits credits atomically with 3.5% clearinghouse platform fee in <15ms", async () => {
  const clearinghouse = new EdgeBillingClearinghouse();
  const userId = "usr_agent_007";
  const creatorWallet = "wallet_creator_42";

  // Deposit 1,000 Universal MCP credits
  clearinghouse.depositCredits(userId, 1000);
  assert.strictEqual(clearinghouse.getBalance(userId), 1000);

  // Process tool call debit of 100 credits
  const result = await clearinghouse.processToolCallDebit({
    userId,
    toolId: "database_security_scan",
    creditsCost: 100,
    creatorWallet,
  });

  assert.strictEqual(result.success, true);
  assert.ok(result.transaction);

  // Verify 3.5% clearinghouse platform fee ($100 * 0.035 = 4 credits$)
  assert.strictEqual(result.transaction.platformFeeCredits, 4);
  // Verify creator receives 96 credits
  assert.strictEqual(result.transaction.creatorPayoutCredits, 96);
  assert.strictEqual(clearinghouse.getCreatorBalance(creatorWallet), 96);
  // User balance decremented by 100
  assert.strictEqual(clearinghouse.getBalance(userId), 900);

  // Verify latency is <15ms
  const stats = clearinghouse.getStats();
  assert.strictEqual(stats.totalTransactions, 1);
  assert.ok(stats.p99LatencyMs < 15.0);
});

test("UniversalCreditsManager - Mints and verifies tamper-proof credit vouchers", () => {
  const manager = new UniversalCreditsManager();
  const userId = "usr_dev_bob";

  const voucher = manager.mintVoucher(userId, "PRO_PACK");
  assert.strictEqual(voucher.credits, UNIVERSAL_CREDIT_PACKS.PRO_PACK.credits);
  assert.strictEqual(voucher.credits, 2500);

  // Valid signature
  assert.strictEqual(manager.verifyVoucher(voucher), true);

  // Tampered voucher
  const tampered = { ...voucher, credits: 99999 };
  assert.strictEqual(manager.verifyVoucher(tampered), false);
});

test("withUniversalMcpMonetize - 3-Line Developer SDK enfores paywall and debits credits", async () => {
  const clearinghouse = new EdgeBillingClearinghouse();
  const userId = "agent_client_1";
  clearinghouse.depositCredits(userId, 20);

  const mockToolHandler = async (req: any) => ({
    content: [{ type: "text", text: `Executed ${req.params.name}` }],
  });

  const monetizedHandler = withUniversalMcpMonetize(mockToolHandler, {
    toolPriceCredits: {
      "expensive_tool": 15,
      "free_tool": 0,
    },
    creatorWallet: "wallet_alice",
    clearinghouse,
  });

  // Call free tool - passes without debit
  const freeRes = await monetizedHandler({
    method: "tools/call",
    params: { name: "free_tool" },
    userId,
  });
  assert.strictEqual(freeRes.isError, undefined);
  assert.strictEqual(clearinghouse.getBalance(userId), 20);

  // Call expensive tool (15 credits) - succeeds and debits
  const paidRes = await monetizedHandler({
    method: "tools/call",
    params: { name: "expensive_tool" },
    userId,
  });
  assert.strictEqual(paidRes.isError, undefined);
  assert.strictEqual(clearinghouse.getBalance(userId), 5);

  // Call expensive tool again (costs 15, but balance is 5) - blocked with -32002
  const blockedRes = await monetizedHandler({
    method: "tools/call",
    params: { name: "expensive_tool" },
    userId,
  });
  assert.strictEqual(blockedRes.isError, true);
  assert.strictEqual(blockedRes.error?.code, -32002);
  assert.ok(blockedRes.error?.message.includes("Insufficient Universal MCP Credits"));
});
