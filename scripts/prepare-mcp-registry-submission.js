import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const registryEntries = [
  {
    name: "io.github.ritualdev-lab/mcp-monetize",
    title: "MCP Monetize",
    description: "Drop-in billing, paywalls, and sub-0.2ms PASETO v4 capability token middleware for Model Context Protocol (MCP) servers with Dodo Payments & Stripe support",
    version: "0.1.0",
    status: "active",
    repository: {
      url: "https://github.com/RitualDev-Lab/mcp-monetize",
      source: "github"
    },
    website: "https://ritualdev.in",
    packages: [
      {
        registryType: "npm",
        identifier: "mcp-monetize",
        version: "0.1.0",
        transport: { type: "stdio" }
      },
      {
        registryType: "pypi",
        identifier: "mcp-monetize",
        version: "0.1.0",
        transport: { type: "stdio" }
      }
    ]
  },
  {
    name: "io.github.ritualdev-lab/agentshield",
    title: "AgentShield Enterprise Kernel Sandbox",
    description: "Enterprise Zero-Leak Secret Defense & Kernel Sandbox for Autonomous AI Agents",
    version: "0.2.1",
    status: "active",
    repository: {
      url: "https://github.com/RitualDev-Lab/AgentShield",
      source: "github"
    },
    website: "https://ritualdev.in/agentshield",
    packages: [
      {
        registryType: "npm",
        identifier: "@ritualdev-lab/agentshield",
        version: "0.2.1",
        transport: { type: "stdio" }
      }
    ]
  },
  {
    name: "io.github.ritualdev-lab/dbshield",
    title: "DBShield Wire-Level Database Sandbox",
    description: "Deterministic Wire-Level AI Database Sandbox Proxy with Proof-of-Intent & Two-Phase Verification",
    version: "0.2.1",
    status: "active",
    repository: {
      url: "https://github.com/RitualDev-Lab/DBShield",
      source: "github"
    },
    website: "https://ritualdev.in/dbshield",
    packages: [
      {
        registryType: "npm",
        identifier: "@ritualdev-lab/dbshield",
        version: "0.2.1",
        transport: { type: "stdio" }
      }
    ]
  }
];

const outputPath = path.join(__dirname, '..', 'dist', 'mcp-registry-submission.json');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(registryEntries, null, 2));

console.log(`[MCP_REGISTRY] Compiled 3 server registry entries to: ${outputPath}`);
