---
name: mcp-monetize
tagline: Drop-in billing, paywalls & credit middleware for MCP servers with Dodo & Stripe
description: Drop-in billing, credit tracking, and paywall middleware for Model Context Protocol (MCP) servers. Enables MCP developers to monetize AI tools with usage quotas, sub-0.2ms PASETO v4 capability tokens, and instant in-chat payment links via Dodo Payments and Stripe.
category: Developer Tools
use_cases:
  - Tool Monetization
  - API Metering & Quotas
  - In-Chat Paywalls
  - PASETO v4 Capability Tokens
  - AI Billing & Subscriptions
getting_started:
  - "Check remaining MCP credit balance: get_balance"
  - "Generate an in-chat top-up checkout link: create_checkout"
  - "Verify PASETO capability token: verify_token <token>"
  - "Tool: check_quota: Checks real-time tool invocation allowances and credits"
tags:
  - monetization
  - billing
  - payments
  - mcp
  - stripe
  - dodo-payments
  - ai-agents
  - developer-tools
documentation_url: https://github.com/RitualDev-Lab/mcp-monetize#readme
repository: https://github.com/RitualDev-Lab/mcp-monetize
homepage: https://ritualdev.in/mcp-builder
npm: mcp-monetize
pypi: mcp-monetize
pricing:
  type: free
  license: MIT
---

# mcp-monetize

> Drop-in billing, credit tracking, and paywall middleware for Model Context Protocol (MCP) servers.

Monetize your AI agent tools in 3 lines of code with [Dodo Payments](https://dodopayments.com) & Stripe.

## Features

- **3-Line Middleware**: Wrap any MCP tool handler with `withMcpMonetization`.
- **In-Chat Payment Links**: Returns interactive checkout links directly in Claude Desktop, Cursor, or Windsurf when free quotas expire.
- **Sub-0.2ms Capability Tokens**: High-performance local token verification using PASETO v4.
- **Multi-Gateway**: Native support for Dodo Payments (Global + India UPI/Cards) and Stripe.
- **Zero Lock-in**: 100% open-source MIT license.

## Quick Installation

```bash
npm install mcp-monetize
# or
npx mcp-monetize --help
```

## Stdio MCP Server Config

```json
{
  "mcpServers": {
    "mcp-monetize": {
      "command": "npx",
      "args": ["-y", "mcp-monetize"]
    }
  }
}
```
