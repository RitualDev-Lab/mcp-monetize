---
name: mcp-monetize
title: MCP Monetize
tagline: Drop-in billing, paywalls & credit middleware for MCP servers with Dodo & Stripe
description: Drop-in billing, credit tracking, and paywall middleware for Model Context Protocol (MCP) servers. Enables AI agent developers to monetize tools in Claude Desktop, Cursor, and Windsurf with usage quotas, sub-0.2ms PASETO v4 capability tokens, and interactive in-chat payment links via Dodo Payments and Stripe.
category: Developer Tools
use_cases:
  - Tool Monetization
  - In-Chat Paywalls
  - API Metering & Quotas
  - PASETO Capability Tokens
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
transport: stdio
command: npx
args: ["-y", "mcp-monetize"]
pricing:
  type: free
  license: MIT
environment_variables:
  - name: MCP_MONETIZE_SECRET
    required: true
    docs_url: https://github.com/RitualDev-Lab/mcp-monetize#readme
    description: 32-byte secret key used to mint and verify local PASETO v4 capability tokens. Generate instantly by running `npx mcp-monetize keygen`.
  - name: DODO_PAYMENTS_WEBHOOK_KEY
    required: false
    docs_url: https://app.dodopayments.com/developers
    description: Webhook secret from Dodo Payments Dashboard to automatically credit user balances upon successful payment.
  - name: STRIPE_WEBHOOK_SECRET
    required: false
    docs_url: https://dashboard.stripe.com/webhooks
    description: Webhook signing secret from Stripe Dashboard for automatic quota fulfillment.
---

# mcp-monetize

> Drop-in billing, credit tracking, and paywall middleware for Model Context Protocol (MCP) servers.

Monetize your AI agent tools in 3 lines of code with [Dodo Payments](https://dodopayments.com) & Stripe.

## Setup Requirements

| Variable Name | Required | Docs / Signup URL | Description |
|---|---|---|---|
| `MCP_MONETIZE_SECRET` | **Yes** | `https://github.com/RitualDev-Lab/mcp-monetize#readme` | 32-byte secret key used to mint and verify local PASETO v4 capability tokens. Run `npx mcp-monetize keygen` to generate. |
| `DODO_PAYMENTS_WEBHOOK_KEY` | No | `https://app.dodopayments.com/developers` | Webhook secret from Dodo Payments Dashboard to auto-credit user balances upon payment. |
| `STRIPE_WEBHOOK_SECRET` | No | `https://dashboard.stripe.com/webhooks` | Webhook signing secret from Stripe Dashboard for automatic quota fulfillment. |

## Quick Installation

```bash
npm install mcp-monetize
# or run CLI
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
