import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { evaluateGuardian, type GuardianAlert, type GuardianFact } from "@arcbond/sdk";
import { createPublicClient, http, parseAbiItem, type Address } from "viem";

type Stored = {
  indexedTo: string;
  alerts: Array<GuardianAlert & { acked: boolean }>;
  seenFacts: string[];
};

const port = Number(process.env.PORT) || Number(process.env.GUARDIAN_PORT) || 8788;
const host = process.env.PORT ? "0.0.0.0" : (process.env.GUARDIAN_HOST ?? "127.0.0.1");
const rpcUrl = process.env.GUARDIAN_RPC_URL ?? process.env.PAY_RPC_URL ?? "https://rpc.testnet.arc.io";
const chainId = Number(process.env.GUARDIAN_CHAIN_ID ?? process.env.PAY_CHAIN_ID ?? 5042002);
const fromBlock = BigInt(process.env.GUARDIAN_FROM_BLOCK ?? process.env.PAY_START_BLOCK ?? 0);
const workspaces = (process.env.GUARDIAN_WORKSPACES ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter((value) => /^0x[0-9a-fA-F]{40}$/.test(value)) as Address[];
const statePath = process.env.GUARDIAN_STATE ?? "services/guardian/data/state.json";

const paymentEvent = parseAbiItem(
  "event PaymentExecuted(address indexed agent, address indexed recipient, uint256 amount, bytes32 indexed paymentId, uint64 periodId, uint256 spentInPeriod)",
);
const revokedEvent = parseAbiItem("event AgentRevoked(address indexed agent)");
const limitAbi = [
  { type: "function", name: "workspacePeriodLimit", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "spentInPeriod", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "reservedInPeriod", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "availableBalance", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

const client = createPublicClient({ transport: http(rpcUrl) });
let status: { ok: boolean; message: string; latestBlock: string; indexedTo: string; lag: string } = {
  ok: false,
  message: "Indexing has not run.",
  latestBlock: "0",
  indexedTo: "0",
  lag: "unknown",
};

function load(): Stored {
  try {
    return JSON.parse(readFileSync(statePath, "utf8")) as Stored;
  } catch {
    return { indexedTo: fromBlock.toString(), alerts: [], seenFacts: [] };
  }
}

function save(state: Stored) {
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, JSON.stringify(state));
}

async function indexOnce() {
  const state = load();
  const latest = await client.getBlockNumber();
  let cursor = BigInt(state.indexedTo);
  if (cursor < fromBlock) cursor = fromBlock;
  const facts: GuardianFact[] = [];
  const now = Math.floor(Date.now() / 1000);

  for (const workspace of workspaces) {
    if (cursor <= latest) {
      const payments = await client.getLogs({ address: workspace, event: paymentEvent, fromBlock: cursor, toBlock: latest });
      for (const log of payments) {
        const id = `${log.transactionHash}:${log.logIndex}`;
        if (state.seenFacts.includes(id)) continue;
        state.seenFacts.push(id);
        facts.push({
          id,
          kind: "payment",
          at: now,
          subject: workspace,
          amount: log.args.amount,
          detail: log.args.agent,
        });
      }
      const revokes = await client.getLogs({ address: workspace, event: revokedEvent, fromBlock: cursor, toBlock: latest });
      for (const log of revokes) {
        const id = `${log.transactionHash}:${log.logIndex}`;
        if (state.seenFacts.includes(id)) continue;
        state.seenFacts.push(id);
        facts.push({ id, kind: "revoked", at: now, subject: `${workspace}:${log.args.agent ?? ""}` });
      }
    }
    const [limit, spent, reserved, available] = await Promise.all([
      client.readContract({ address: workspace, abi: limitAbi, functionName: "workspacePeriodLimit" }),
      client.readContract({ address: workspace, abi: limitAbi, functionName: "spentInPeriod" }),
      client.readContract({ address: workspace, abi: limitAbi, functionName: "reservedInPeriod" }),
      client.readContract({ address: workspace, abi: limitAbi, functionName: "availableBalance" }),
    ]);
    facts.push({
      id: `limit:${workspace}:${latest.toString()}`,
      kind: "near_limit",
      at: now,
      subject: workspace,
      amount: spent + reserved,
      limit,
    });
    facts.push({
      id: `balance:${workspace}:${latest.toString()}`,
      kind: "low_balance",
      at: now,
      subject: workspace,
      amount: available,
    });
  }

  const fresh = evaluateGuardian(facts, now);
  for (const alert of fresh) {
    if (state.alerts.some((existing) => existing.rule === alert.rule && existing.subject === alert.subject && existing.evidence === alert.evidence)) {
      continue;
    }
    state.alerts.push({ ...alert, acked: false });
  }
  state.indexedTo = latest.toString();
  save(state);
  const lag = latest - cursor;
  status = {
    ok: true,
    message: workspaces.length ? "Indexed configured workspaces." : "No GUARDIAN_WORKSPACES configured. This is not a clean bill of health.",
    latestBlock: latest.toString(),
    indexedTo: state.indexedTo,
    lag: lag.toString(),
  };
}

async function loop() {
  try {
    await indexOnce();
  } catch (error) {
    status = {
      ok: false,
      message: error instanceof Error ? error.message : "RPC indexing failed.",
      latestBlock: status.latestBlock,
      indexedTo: load().indexedTo,
      lag: "unknown",
    };
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (url.pathname === "/health") {
    res.writeHead(status.ok ? 200 : 503, { "content-type": "application/json" });
    res.end(JSON.stringify({ ...status, chainId, workspaces: workspaces.length }));
    return;
  }
  if (url.pathname === "/alerts" && req.method === "GET") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ alerts: load().alerts, status }));
    return;
  }
  if (url.pathname === "/alerts/ack" && req.method === "POST") {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk as Buffer));
    req.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString() || "{}") as { id?: string };
      const state = load();
      const alert = state.alerts.find((item) => item.id === body.id);
      if (alert) alert.acked = true;
      save(state);
      res.writeHead(alert ? 200 : 404, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: Boolean(alert) }));
    });
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(port, host, () => {
  console.log(`ArcBond guardian listening on http://${host}:${port} chain ${chainId}`);
  void loop();
  setInterval(() => void loop(), 20_000);
});
