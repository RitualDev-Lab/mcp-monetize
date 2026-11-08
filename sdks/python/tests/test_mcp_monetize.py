import unittest
import time
from mcp_monetize import (
    PasetoCapabilityManager,
    require_capability,
    InsufficientCreditsError,
    UnauthorizedScopeError
)


class TestMcpMonetizePython(unittest.TestCase):
    def setUp(self):
        self.secret = "test_secret_key_32bytes_paseto_2026"
        self.manager = PasetoCapabilityManager(self.secret)

    def test_issue_and_verify_token(self):
        token = self.manager.issue_token(
            user_id="usr_123",
            scopes=["query", "search"],
            balance=50
        )
        self.assertTrue(token.startswith("v4.local."))

        res = self.manager.verify_token(token)
        self.assertTrue(res.valid)
        self.assertEqual(res.payload["sub"], "usr_123")
        self.assertEqual(res.payload["bal"], 50)
        self.assertIn("query", res.payload["scope"])

    def test_reject_tampered_token(self):
        token = self.manager.issue_token(user_id="usr_123", scopes=["*"], balance=10)
        tampered = token[:-4] + "dead"
        res = self.manager.verify_token(tampered)
        self.assertFalse(res.valid)
        self.assertIn("mismatch", res.error.lower())

    def test_reject_expired_token(self):
        token = self.manager.issue_token(user_id="usr_exp", scopes=["*"], ttl_seconds=-10)
        res = self.manager.verify_token(token)
        self.assertFalse(res.valid)
        self.assertIn("expired", res.error.lower())

    def test_decorator_enforcement(self):
        @require_capability(scopes=["admin"], cost=10, manager=self.manager)
        def secret_tool(x: int):
            return x * 2

        # 1. Valid token with scope and balance
        valid_tok = self.manager.issue_token("usr_ok", scopes=["admin"], balance=20)
        self.assertEqual(secret_tool(5, capability_token=valid_tok), 10)

        # 2. Token with insufficient balance
        poor_tok = self.manager.issue_token("usr_poor", scopes=["admin"], balance=5)
        with self.assertRaises(InsufficientCreditsError):
            secret_tool(5, capability_token=poor_tok)

        # 3. Token with unauthorized scope
        other_tok = self.manager.issue_token("usr_other", scopes=["read_only"], balance=50)
        with self.assertRaises(UnauthorizedScopeError):
            secret_tool(5, capability_token=other_tok)


if __name__ == "__main__":
    unittest.main()
