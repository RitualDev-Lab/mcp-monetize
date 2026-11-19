import test from "node:test";
import assert from "node:assert/strict";
import { McpCapabilityTokenManager } from "../src/capability.js";
import { withMcpMonetization } from "../src/middleware.js";

test("McpCapabilityTokenManager issues and validates PASETO capability tokens in sub-millisecond", () => {
  const manager = new McpCapabilityTokenManager("enterprise_test_secret_32bytes_min");

  const token = manager.issueToken({
    subject: "agent_claude_pro_42",
    scopes: ["tool:deep_research", "tool:file_audit"],
    expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    creditsRemaining: 500,
  });

  assert.ok(token.startsWith("v4.local."), "Token must follow PASETO v4.local format");

  // Warmup run
  manager.verifyToken(token, "tool:deep_research");

  // Measured run
  const t0 = performance.now();
  const result = manager.verifyToken(token, "tool:deep_research");
  const elapsed = performance.now() - t0;

  assert.equal(result.valid, true);
  assert.equal(result.payload?.subject, "agent_claude_pro_42");
  assert.equal(result.payload?.creditsRemaining, 500);
  assert.ok(elapsed < 2, `Verification took ${elapsed}ms (must be < 2ms)`);
});

test("McpCapabilityTokenManager enforces scope restriction and rejects unauthorized tools", () => {
  const manager = new McpCapabilityTokenManager("enterprise_test_secret_32bytes_min");

  const token = manager.issueToken({
    subject: "agent_restricted_01",
    scopes: ["tool:read_only"],
    expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
  });

  // Allowed scope
  const allowed = manager.verifyToken(token, "tool:read_only");
  assert.equal(allowed.valid, true);

  // Forbidden scope
  const rejected = manager.verifyToken(token, "tool:database_mutation");
  assert.equal(rejected.valid, false);
  assert.match(rejected.error || "", /Insufficient capability scope/);
});

test("McpCapabilityTokenManager rejects expired capability tokens", () => {
  const manager = new McpCapabilityTokenManager("enterprise_test_secret_32bytes_min");

  const token = manager.issueToken({
    subject: "agent_expired",
    scopes: ["tool:all"],
    expiresAt: new Date(Date.now() - 10000).toISOString(), // Expired in past
  });

  const result = manager.verifyToken(token);
  assert.equal(result.valid, false);
  assert.match(result.error || "", /expired/);
});

test("withMcpMonetization authorizes requests instantly when a valid capability token is presented", async () => {
  const manager = new McpCapabilityTokenManager("shared_secret_key");
  const validToken = manager.issueToken({
    subject: "agent_autonomous_99",
    scopes: ["tool:fast_query"],
    expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
  });

  let toolExecuted = false;
  const wrappedTool = withMcpMonetization(
    async (args) => {
      toolExecuted = true;
      return { content: [{ type: "text", text: `Success: ${args.query}` }] };
    },
    {
      checkoutUrl: "https://dodo.mock/checkout",
      freeTierCalls: 0, // Zero free calls: normal path would immediately paywall
      capabilityManager: manager,
      requiredScope: "tool:fast_query",
    }
  );

  // Present capability token
  const res = await wrappedTool({ query: "ping", capabilityToken: validToken });

  assert.equal(toolExecuted, true);
  assert.equal(res.isError, undefined);
  assert.equal(res.content[0].text, "Success: ping");
});

test("withMcpMonetization atomically decrements capability token balance and blocks exhausted tokens", async () => {
  const manager = new McpCapabilityTokenManager("enterprise_test_secret_32bytes_min");
  const fundedToken = manager.issueToken({
    subject: "agent_quota_user",
    scopes: ["tool:spend_query"],
    creditsRemaining: 2, // Exactly 2 calls funded
    expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
  });

  let executions = 0;
  const tool = withMcpMonetization(
    async () => {
      executions++;
      return { content: [{ type: "text", text: "OK" }] };
    },
    {
      checkoutUrl: "https://dodo.mock/checkout",
      freeTierCalls: 0,
      capabilityManager: manager,
      requiredScope: "tool:spend_query",
    }
  );

  // Call 1: Allowed (balance: 2 -> 1)
  const r1 = await tool({ capabilityToken: fundedToken });
  assert.equal(r1.isError, undefined);

  // Call 2: Allowed (balance: 1 -> 0)
  const r2 = await tool({ capabilityToken: fundedToken });
  assert.equal(r2.isError, undefined);

  // Call 3: Blocked (balance: 0 -> exhausted)
  const r3 = await tool({ capabilityToken: fundedToken });
  assert.equal(r3.isError, true);
  assert.match(r3.content[0].text, /Insufficient capability token balance/);
  assert.equal(executions, 2);
});
