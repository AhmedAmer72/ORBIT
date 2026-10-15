import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = Object.fromEntries(
  fs
    .readFileSync(path.join(root, ".env"), "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.trim().startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
    }),
);

const agentOnly = process.argv.includes("--agent-only");
const server = agentOnly
  ? null
  : spawn("npx", ["tsx", "services/payments/src/server.ts"], {
  cwd: root,
  shell: true,
  stdio: ["ignore", "pipe", "pipe"],
  env: process.env,
});
server?.stdout.on("data", (chunk) => process.stdout.write(chunk));
server?.stderr.on("data", (chunk) => process.stderr.write(chunk));

async function waitForHealth() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch("http://127.0.0.1:8787/health");
      if (response.ok) return await response.json();
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("The payments service did not start.");
}

try {
  const health = await waitForHealth();
  console.log(`health intents=${health.paymentIntents} version=${health.factoryVersion} relayer=${health.relayer}`);
  if (!health.paymentIntents) throw new Error("The configured factory does not support payment intents.");
  const child = spawn("npx", ["tsx", "scripts/pay-per-api.ts"], {
    cwd: root,
    shell: true,
    stdio: "inherit",
    env: {
      ...process.env,
      AGENT_PRIVATE_KEY: envFile.AGENT_PRIVATE_KEY,
      VAULT_ADDRESS: envFile.PAY_DEMO_VAULT,
      PAY_API_URL: "http://127.0.0.1:8787",
      PAY_RPC_URL: "https://rpc.testnet.arc.io",
      PAY_CHAIN_ID: "5042002",
      RECORD: "testnet",
    },
  });
  const code = await new Promise((resolve) => child.on("exit", resolve));
  if (code !== 0) process.exitCode = code ?? 1;
} finally {
  if (server && process.platform === "win32" && server.pid) {
    spawn("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    server?.kill();
  }
}
