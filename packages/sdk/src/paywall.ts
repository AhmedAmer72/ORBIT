import {
  getAddress,
  keccak256,
  parseAbiItem,
  stringToBytes,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";

import { USDC_ADDRESS } from "./constants";
import { ArcBondError } from "./errors";
import { paymentIdFromLabel } from "./format";

const paymentExecutedEvent = parseAbiItem(
  "event PaymentExecuted(address indexed agent, address indexed recipient, uint256 amount, bytes32 indexed paymentId, uint64 periodId, uint256 spentInPeriod)",
);

const usedPaymentIdsAbi = [
  {
    type: "function",
    name: "usedPaymentIds",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export type PaywallQuote = {
  id: string;
  serviceId: string;
  requestId: string;
  chainId: number;
  vault: Address;
  recipient: Address;
  token: Address;
  amount: bigint;
  paymentId: Hex;
  expiresAt: number;
};

export type PaywallSettlement = {
  transactionHash: Hex;
  vault: Address;
  recipient: Address;
  amount: bigint;
  paymentId: Hex;
};

export type QuoteStore = {
  get(id: string): PaywallQuote | undefined;
  findByRequest(key: string): PaywallQuote | undefined;
  save(quote: PaywallQuote): void;
};

export function requestKey(chainId: number, vault: Address, serviceId: string, requestId: string): string {
  return `${chainId}:${vault.toLowerCase()}:${serviceId}:${requestId}`;
}

export function paymentIdForRequest(serviceId: string, requestId: string): Hex {
  return paymentIdFromLabel(`${serviceId}:${requestId}`);
}

export function createMemoryQuoteStore(): QuoteStore {
  const byId = new Map<string, PaywallQuote>();
  const byRequest = new Map<string, PaywallQuote>();
  return {
    get(id) {
      return byId.get(id);
    },
    findByRequest(key) {
      return byRequest.get(key);
    },
    save(quote) {
      byId.set(quote.id, quote);
      byRequest.set(requestKey(quote.chainId, quote.vault, quote.serviceId, quote.requestId), quote);
    },
  };
}

/**
 * Confirms a PaymentExecuted log on the quoted contract, the used-id flag, and a successful receipt.
 * An ERC-20 transfer that did not come from that contract does not satisfy the quote.
 */
export async function verifyPaywallSettlement(
  publicClient: PublicClient,
  quote: PaywallQuote,
  fromBlock: bigint,
): Promise<PaywallSettlement> {
  if (quote.token.toLowerCase() !== USDC_ADDRESS.toLowerCase()) {
    throw new ArcBondError("invalid_request", "The quote token is not Arc USDC.");
  }
  const vault = getAddress(quote.vault);
  const logs = await publicClient.getLogs({
    address: vault,
    event: paymentExecutedEvent,
    args: { paymentId: quote.paymentId },
    fromBlock,
    toBlock: "latest",
  });
  const expectedRecipient = quote.recipient.toLowerCase();
  const match = logs.find((log) => log.args.recipient?.toLowerCase() === expectedRecipient && log.args.amount === quote.amount);
  if (!match) {
    throw new ArcBondError("invalid_request", "No matching vault payment was found for this quote.");
  }
  const used = await publicClient.readContract({
    address: vault,
    abi: usedPaymentIdsAbi,
    functionName: "usedPaymentIds",
    args: [quote.paymentId],
  });
  if (!used) {
    throw new ArcBondError("invalid_request", "The payment id is not marked used on the contract.");
  }
  const receipt = await publicClient.getTransactionReceipt({ hash: match.transactionHash });
  if (receipt.status !== "success") {
    throw new ArcBondError("reverted", "The payment transaction did not succeed.");
  }
  return {
    transactionHash: match.transactionHash,
    vault,
    recipient: getAddress(quote.recipient),
    amount: quote.amount,
    paymentId: quote.paymentId,
  };
}

export function createArcBondPaywall(options: {
  chainId: number;
  recipient: Address;
  vault: Address;
  publicClient: PublicClient;
  fromBlock?: bigint;
  ttlSeconds?: number;
  now?: () => number;
  store?: QuoteStore;
  newId?: () => string;
}) {
  const store = options.store ?? createMemoryQuoteStore();
  const now = options.now ?? (() => Math.floor(Date.now() / 1000));
  const ttl = options.ttlSeconds ?? 15 * 60;
  const newId = options.newId ?? (() => keccak256(stringToBytes(`${options.vault}:${now()}:${Math.random()}`)));

  return {
    store,
    async createQuote(input: { serviceId: string; requestId: string; amount: bigint }) {
      if (!input.serviceId || !input.requestId) {
        throw new ArcBondError("invalid_request", "serviceId and requestId are required.");
      }
      if (input.amount <= 0n) throw new ArcBondError("invalid_request", "Quote amount must be greater than zero.");
      const key = requestKey(options.chainId, options.vault, input.serviceId, input.requestId);
      const existing = store.findByRequest(key);
      if (existing && existing.expiresAt > now()) return existing;
      const quote: PaywallQuote = {
        id: newId(),
        serviceId: input.serviceId,
        requestId: input.requestId,
        chainId: options.chainId,
        vault: getAddress(options.vault),
        recipient: getAddress(options.recipient),
        token: USDC_ADDRESS,
        amount: input.amount,
        paymentId: paymentIdForRequest(input.serviceId, input.requestId),
        expiresAt: now() + ttl,
      };
      store.save(quote);
      return quote;
    },
    async verifyPayment(input: { quoteId: string }) {
      const quote = store.get(input.quoteId);
      if (!quote) throw new ArcBondError("invalid_request", "Unknown quote.");
      if (quote.chainId !== options.chainId) {
        throw new ArcBondError("unsupported_network", "The quote is for a different chain.");
      }
      try {
        return await verifyPaywallSettlement(publicClientOrThrow(options.publicClient), quote, options.fromBlock ?? 0n);
      } catch (error) {
        if (quote.expiresAt <= now() && error instanceof ArcBondError && error.message.includes("No matching")) {
          throw new ArcBondError("invalid_request", "The quote expired before a matching payment was found.");
        }
        throw error;
      }
    },
  };
}

function publicClientOrThrow(client: PublicClient): PublicClient {
  return client;
}
