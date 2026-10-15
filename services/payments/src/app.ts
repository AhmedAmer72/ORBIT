import http from "node:http";

import { chainById } from "@arcbond/sdk";
import { createPublicClient, createWalletClient, defineChain, http as httpTransport, type Chain, type PublicClient } from "viem";

import type { PayConfig } from "./config";
import { PaymentsDb } from "./db";
import { createHandler, relayerFromKey } from "./http";

export function chainFor(config: { chainId: number; rpcUrl: string }): Chain {
  const base = chainById(config.chainId);
  return defineChain({
    ...base,
    rpcUrls: { default: { http: [config.rpcUrl] } },
  });
}

export type PaymentsApp = {
  db: PaymentsDb;
  baseUrl: string;
  close: () => Promise<void>;
};

export async function startPaymentsApp(args: {
  config: PayConfig;
  db?: PaymentsDb;
  publicClient?: PublicClient;
  chain?: Chain;
}): Promise<PaymentsApp> {
  const chain = args.chain ?? chainFor(args.config);
  const publicClient =
    args.publicClient ?? createPublicClient({ chain, transport: httpTransport(args.config.rpcUrl) });
  const relayer = relayerFromKey(args.config.relayerKey);
  const walletClient = relayer ? createWalletClient({ account: relayer, chain, transport: httpTransport(args.config.rpcUrl) }) : null;
  const db = args.db ?? new PaymentsDb(args.config.databasePath);
  const ownsDb = !args.db;
  const server = http.createServer(
    createHandler({
      db,
      config: args.config,
      publicClient,
      walletClient,
      relayerAddress: relayer?.address ?? null,
    }),
  );
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(args.config.port, args.config.host, () => resolve());
  });
  const address = server.address();
  const port = address && typeof address === "object" ? address.port : args.config.port;
  return {
    db,
    baseUrl: `http://127.0.0.1:${port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      if (ownsDb) db.close();
    },
  };
}
