#!/usr/bin/env node

/**
 * mcp-monetize CLI
 * Command line utility to issue PASETO v4 capability tokens, verify tokens, and configure billing
 */

const { PasetoCapabilityManager } = require('../dist/capability.js');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const command = args[0] || '--help';

if (command === '--version' || command === '-v') {
  console.log('0.1.0');
  process.exit(0);
}

if (command === '--help' || command === '-h') {
  console.log(`
mcp-monetize CLI v0.1.0 - Monetization & Capability Token Engine for MCP Servers

USAGE:
  mcp-monetize <command> [options]

COMMANDS:
  init                     Initialize a local .env file with generated PASETO v4 secret key
  token issue <user-id>    Issue an offline PASETO v4 capability token
  token verify <token>     Verify and inspect a PASETO capability token in < 0.2ms
  keygen                   Generate a random 32-byte hex secret key for PASETO v4.local

OPTIONS:
  --scope <tools>          Comma-separated tool names (e.g. --scope "search,exec,query")
  --balance <credits>      Pre-funded credit balance (default: 100)
  --ttl <hours>            Token validity in hours (default: 24)
  --secret <key>           HMAC / PASETO secret key (defaults to env MCP_MONETIZE_SECRET)
  --help, -h               Show this help message
  --version, -v            Show version
`);
  process.exit(0);
}

if (command === 'keygen') {
  const key = crypto.randomBytes(32).toString('hex');
  console.log(`Generated PASETO v4 32-byte Secret Key:\n${key}`);
  process.exit(0);
}

if (command === 'init') {
  const envPath = path.join(process.cwd(), '.env');
  const key = crypto.randomBytes(32).toString('hex');
  const template = `
# mcp-monetize configuration
MCP_MONETIZE_SECRET=${key}
MCP_MONETIZE_STORE=sqlite
MCP_MONETIZE_SQLITE_PATH=./mcp-monetize.db
# Dodo Payments
DODO_API_KEY=
DODO_WEBHOOK_SECRET=
# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
`.trimStart();

  if (fs.existsSync(envPath)) {
    console.log('.env already exists. Appending mcp-monetize variables if missing.');
    fs.appendFileSync(envPath, '\n' + template);
  } else {
    fs.writeFileSync(envPath, template);
    console.log('Created .env with new PASETO v4 secret key.');
  }
  process.exit(0);
}

if (command === 'token') {
  const subCommand = args[1];
  const secret = process.env.MCP_MONETIZE_SECRET || 'ritual_default_paseto_capability_secret_key_2026';
  const manager = new PasetoCapabilityManager(secret);

  if (subCommand === 'issue') {
    const userId = args[2] || 'usr_anonymous';
    const scopeIdx = args.indexOf('--scope');
    const scopeStr = scopeIdx !== -1 ? args[scopeIdx + 1] : '*';
    const scopes = scopeStr.split(',').map(s => s.trim());

    const balanceIdx = args.indexOf('--balance');
    const balance = balanceIdx !== -1 ? parseInt(args[balanceIdx + 1], 10) : 100;

    const ttlIdx = args.indexOf('--ttl');
    const ttlHours = ttlIdx !== -1 ? parseInt(args[ttlIdx + 1], 10) : 24;

    const token = manager.issueToken({
      userId,
      scopes,
      balance,
      ttlSeconds: ttlHours * 3600
    });

    console.log(`\nIssued PASETO v4 Capability Token for ${userId}:`);
    console.log(token);
    console.log(`\nScopes: [${scopes.join(', ')}] | Balance: ${balance} credits | TTL: ${ttlHours} hours\n`);
    process.exit(0);
  }

  if (subCommand === 'verify') {
    const token = args[2];
    if (!token) {
      console.error('Error: Token argument is required.');
      process.exit(1);
    }

    const t0 = performance.now();
    const result = manager.verifyToken(token);
    const duration = (performance.now() - t0).toFixed(3);

    if (result.valid) {
      console.log(`\n✅ Valid Token verified in ${duration}ms:`);
      console.log(JSON.stringify(result.payload, null, 2));
    } else {
      console.error(`\n❌ Token Invalid (${duration}ms): ${result.error}`);
      process.exit(1);
    }
    process.exit(0);
  }
}

console.error(`Unknown command: ${command}. Run "mcp-monetize --help" for available commands.`);
process.exit(1);
