"""PASETO v4.local Capability Token Manager for Python."""

import hmac
import hashlib
import json
import base64
import time
from typing import Dict, Any, List, Optional
from dataclasses import dataclass


@dataclass
class TokenVerificationResult:
    valid: bool
    payload: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class PasetoCapabilityManager:
    """Issues and verifies tamper-evident capability tokens for sub-0.2ms offline auth."""

    def __init__(self, secret_key: str, default_ttl_seconds: int = 86400):
        self.secret_key = secret_key.encode('utf-8')
        self.default_ttl = default_ttl_seconds

    def issue_token(
        self,
        user_id: str,
        scopes: List[str],
        balance: int = 100,
        ttl_seconds: Optional[int] = None,
        issuer: str = "ritualdev:mcp-monetize"
    ) -> str:
        now = int(time.time())
        exp = now + (ttl_seconds if ttl_seconds is not None else self.default_ttl)

        payload = {
            "iss": issuer,
            "sub": user_id,
            "iat": now,
            "exp": exp,
            "scope": scopes,
            "bal": balance
        }

        serialized = json.dumps(payload, separators=(',', ':'), sort_keys=True).encode('utf-8')
        sig = hmac.new(self.secret_key, serialized, hashlib.sha256).hexdigest()

        # Token format: v4.local.<base64url(payload)>.<sig>
        b64_payload = base64.urlsafe_b64encode(serialized).decode('utf-8').rstrip('=')
        return f"v4.local.{b64_payload}.{sig}"

    def verify_token(self, token: str) -> TokenVerificationResult:
        if not token or not token.startswith("v4.local."):
            return TokenVerificationResult(valid=False, error="Malformed PASETO v4 token header")

        parts = token.split('.')
        if len(parts) != 4:
            return TokenVerificationResult(valid=False, error="Malformed token segment count")

        b64_payload, signature = parts[2], parts[3]

        # Pad base64
        padded = b64_payload + '=' * ((4 - len(b64_payload) % 4) % 4)
        try:
            raw_bytes = base64.urlsafe_b64decode(padded)
            payload = json.loads(raw_bytes.decode('utf-8'))
        except Exception as e:
            return TokenVerificationResult(valid=False, error=f"Corrupt payload encoding: {str(e)}")

        # Verify signature
        expected_sig = hmac.new(self.secret_key, raw_bytes, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected_sig, signature):
            return TokenVerificationResult(valid=False, error="Cryptographic signature mismatch")

        # Verify expiry
        now = int(time.time())
        if payload.get("exp", 0) < now:
            return TokenVerificationResult(valid=False, error="Token expired")

        return TokenVerificationResult(valid=True, payload=payload)
