import type { IncomingMessage, ServerResponse } from "node:http";

import { formatUsdc, readFactoryVersion } from "@arcbond/sdk";
import { type PublicClient, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import type { PayConfig } from "./config";
import { PayError, SERVICE_PRICE } from "./config";
import type { PaymentsDb } from "./db";
import { createQuote, deliverQuote, quoteResponse } from "./provider";
import { readIntent, submitIntent } from "./relay";

const MAX_BODY = 32_768;
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 60;
const hits = new Map<string, number[]>();

export type HttpDeps = {
  db: PaymentsDb;
  config: PayConfig;
  publicClient: PublicClient;
  walletClient: WalletClient | null;
  relayerAddress: `0x${string}` | null;
};

function allow(req: IncomingMessage, res: ServerResponse): boolean {
  const ip = req.socket.remoteAddress ?? "local";
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((stamp) => now - stamp < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS) {
    send(res, 429, { error: "rate_limited", message: "Too many requests. Try again in a minute." });
    return false;
  }
  recent.push(now);
  hits.set(ip, recent);
  return true;
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  res.end(payload);
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY) throw new PayError(413, "body_too_large", "The request body is larger than 32 KB.");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new PayError(400, "invalid_json", "The request body is not JSON.");
  }
}

export function createHandler(deps: HttpDeps) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "content-type",
      });
      res.end();
      return;
    }
    if (!allow(req, res)) return;
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    try {
      if (req.method === "GET" && url.pathname === "/health") {
        const deployment = deps.config.factory
          ? await readFactoryVersion(deps.publicClient, deps.config.factory)
          : { version: null, supportsPaymentIntents: false };
        send(res, 200, {
          ok: true,
          service: "arc-network-record",
          price: SERVICE_PRICE.toString(),
          priceDisplay: formatUsdc(SERVICE_PRICE),
          chainId: deps.config.chainId,
          recipient: deps.config.recipient ?? null,
          factory: deps.config.factory ?? null,
          factoryVersion: deployment.version?.toString() ?? null,
          paymentIntents: deployment.supportsPaymentIntents,
          relayerConfigured: Boolean(deps.walletClient),
          relayer: deps.relayerAddress,
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/provider/quotes") {
        send(res, 201, await createQuote(deps.db, deps.config, deps.publicClient, (await readBody(req)) as { vault?: unknown; record?: unknown }));
        return;
      }

      const quoteMatch = url.pathname.match(/^\/provider\/quotes\/([^/]+)$/);
      if (req.method === "GET" && quoteMatch) {
        const quote = deps.db.getQuote(decodeURIComponent(quoteMatch[1]));
        if (!quote) throw new PayError(404, "quote_not_found", "No quote exists with that id.");
        send(res, 200, quoteResponse(quote));
        return;
      }

      if (req.method === "POST" && url.pathname === "/provider/deliveries") {
        const body = (await readBody(req)) as { quoteId?: unknown };
        if (typeof body.quoteId !== "string") throw new PayError(400, "invalid_request", "quoteId is required.");
        send(res, 200, await deliverQuote(deps.db, deps.config, deps.publicClient, body.quoteId));
        return;
      }

      if (req.method === "POST" && url.pathname === "/relay/intents") {
        if (!deps.walletClient || !deps.relayerAddress) {
          throw new PayError(503, "relayer_unconfigured", "PAY_RELAYER_PRIVATE_KEY is not set. The relay cannot submit transactions.");
        }
        send(
          res,
          200,
          await submitIntent({
            db: deps.db,
            config: deps.config,
            publicClient: deps.publicClient,
            walletClient: deps.walletClient,
            relayer: deps.relayerAddress,
            body: await readBody(req),
          }),
        );
        return;
      }

      const intentMatch = url.pathname.match(/^\/relay\/intents\/(0x[0-9a-fA-F]{64})$/);
      if (req.method === "GET" && intentMatch) {
        send(
          res,
          200,
          await readIntent({
            db: deps.db,
            config: deps.config,
            publicClient: deps.publicClient,
            digest: intentMatch[1],
          }),
        );
        return;
      }

      send(res, 404, { error: "not_found", message: "That route does not exist." });
    } catch (error) {
      if (error instanceof PayError) {
        send(res, error.status, { error: error.code, message: error.message });
        return;
      }
      const message = error instanceof Error ? error.message : "Unexpected failure.";
      console.error(`payments request failed: ${message}`);
      send(res, 500, { error: "internal", message: "The payments service failed before it could finish the request." });
    }
  };
}

export function relayerFromKey(key: `0x${string}` | undefined) {
  if (!key) return null;
  return privateKeyToAccount(key);
}
