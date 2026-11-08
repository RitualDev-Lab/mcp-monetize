"""FastMCP & Python Tool Monetization Decorator."""

import functools
from typing import List, Optional
from .paseto import PasetoCapabilityManager


class InsufficientCreditsError(Exception):
    pass


class UnauthorizedScopeError(Exception):
    pass


def require_capability(
    scopes: Optional[List[str]] = None,
    cost: int = 1,
    manager: Optional[PasetoCapabilityManager] = None
):
    """Decorator to enforce capability token scopes and credit balance on MCP tool calls."""
    required_scopes = scopes or []

    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            # Extract token from kwargs or context
            token = kwargs.pop("capability_token", None)
            if not token:
                # If no token passed, allow or check fallback
                return func(*args, **kwargs)

            if manager:
                res = manager.verify_token(token)
                if not res.valid:
                    raise PermissionError(f"Invalid capability token: {res.error}")

                payload = res.payload or {}
                token_scopes = payload.get("scope", [])
                balance = payload.get("bal", 0)

                # Scope check
                if "*" not in token_scopes and any(s not in token_scopes for s in required_scopes):
                    raise UnauthorizedScopeError(f"Token lacks required scopes: {required_scopes}")

                # Balance check
                if balance < cost:
                    raise InsufficientCreditsError(f"Insufficient credits: {balance} available, {cost} required")

            return func(*args, **kwargs)
        return wrapper
    return decorator
