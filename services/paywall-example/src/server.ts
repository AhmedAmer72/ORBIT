import { createServer } from "node:http";

import { ARC_TESTNET_CHAIN_ID, ARC_TESTNET_RPC, createArcBondPaywall, parseUsdc } from "@arcbond/sdk";
import { createPublicClient, http, isAddress, type Address } from "viem";

const chainId = Number(process.env.PAYWALL_CHAIN_ID ?? ARC_TESTNET_CHAIN_ID);
const rpcUrl = process.env.PAYWALL_RPC_URL ?? ARC_TESTNET_RPC;
const vault = process.env.PAYWALL_VAULT;
const recipient = process.env.PAYWALL_RECIPIENT;
const port = Number(process.env.PAYWALL_PORT ?? 8790);

if (!vault || !isAddress(vault) || !recipient || !isAddress(recipient)) {
  console.error("Set PAYWALL_VAULT and PAYWALL_RECIPIENT to the contract that settles the quote and the provider address.");
  process.exit(1);
}

const publicClient = createPublicClient({ transport: http(rpcUrl) });
const paywall = createArcBondPaywall({
  chainId,
  vault: vault as Address,
  recipient: recipient as Address,
  publicClient,
  fromBlock: BigInt(process.env.PAYWALL_FROM_BLOCK ?? 0),
});

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (req.method === "POST" && url.pathname === "/quote") {
    readJson(req, async (body) => {
      const quote = await paywall.createQuote({
        serviceId: String(body.serviceId ?? "data-lookup"),
        requestId: String(body.requestId ?? ""),
        amount: parseUsdc(String(body.amount ?? "0.50")),
      });
      send(res, 200, { ...quote, amount: quote.amount.toString() });
    });
    return;
  }
  if (req.method === "POST" && url.pathname === "/lookup") {
    readJson(req, async (body) => {
      try {
        const settlement = await paywall.verifyPayment({ quoteId: String(body.quoteId ?? "") });
        send(res, 200, {
          delivered: true,
          record: { chainId, rpcUrl },
          payment: { ...settlement, amount: settlement.amount.toString() },
        });
      } catch (error) {
        send(res, 402, { delivered: false, message: error instanceof Error ? error.message : "Payment was not verified." });
      }
    });
    return;
  }
  send(res, 404, { message: "Not found" });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Paywall example listening on http://127.0.0.1:${port}`);
});

function readJson(req: import("node:http").IncomingMessage, onBody: (body: Record<string, unknown>) => Promise<void>) {
  const chunks: Buffer[] = [];
  req.on("data", (chunk) => chunks.push(chunk as Buffer));
  req.on("end", () => {
    void onBody(JSON.parse(Buffer.concat(chunks).toString() || "{}") as Record<string, unknown>).catch((error) => {
      console.error(error);
    });
  });
}

function send(res: import("node:http").ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}
