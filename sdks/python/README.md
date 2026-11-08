# mcp-monetize Python SDK

Drop-in billing, paywall & PASETO capability token middleware for Model Context Protocol (MCP) servers in Python.

Compatible with [FastMCP](https://github.com/jlowin/fastmcp) and standard Python MCP architectures.

## Installation

```bash
pip install mcp-monetize
```

## Quickstart with FastMCP

```python
from mcp_monetize import require_capability, PasetoCapabilityManager

# Initialize token manager with secret key
manager = PasetoCapabilityManager("your-32-byte-secret-key")

# Protect a FastMCP tool
@require_capability(scopes=["deep_analysis"], cost=5)
def deep_analysis(repo_url: str):
    return {"status": "analyzed", "repo": repo_url}
```
