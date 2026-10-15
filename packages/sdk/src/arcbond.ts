import {
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  isAddress,
  zeroAddress,
} from "viem";

import { ARC_MAINNET_CHAIN_ID, ARC_TESTNET_CHAIN_ID } from "./constants";
import { encodeExecutePayment, listVaults, readVault, simulateVaultCall, submitContractWrite } from "./client";
import { ArcBondError, describeWriteFailure } from "./errors";
import {
  createPaymentIntent,
  encodeExecutePaymentIntent,
  hashPaymentIntent,
  intentExecutionFromLogs,
  preflightPaymentIntent,
  signPaymentIntent,
  type IntentSigner,
  type PaymentIntent,
  type SignedPaymentIntent,
} from "./intent";
import type { PaymentRequest } from "./policy";
import { preflightPayment } from "./policy";

export type TxPhase =
  | { status: "simulated" }
  | { status: "awaiting_signature" }
  | { status: "submitted"; hash: Hex }
  | { status: "confirmed"; hash: Hex; intentExecution?: ReturnType<typeof intentExecutionFromLogs> }
  | { status: "reverted"; hash: Hex; message: string }
  | { status: "rejected"; message: string }
  | { status: "failed"; message: string };

export type ArcBondClient = {
  chainId: number;
  factory: Address | undefined;
  publicClient: PublicClient;
  readVault: (vault: Address) => ReturnType<typeof readVault>;
  listVaults: (owner: Address) => ReturnType<typeof listVaults>;
  preflight: (request: PaymentRequest & { caller: Address; now?: bigint }) => ReturnType<typeof preflightPayment>;
  submitPayment: (request: PaymentRequest, onPhase?: (phase: TxPhase) => void) => Promise<TxPhase>;
  createPaymentIntent: (
    input: Parameters<typeof createPaymentIntent>[1],
  ) => ReturnType<typeof createPaymentIntent>;
  signPaymentIntent: (intent: PaymentIntent, signer: IntentSigner) => Promise<SignedPaymentIntent>;
  preflightIntent: (
    signed: SignedPaymentIntent & { caller: Address },
  ) => ReturnType<typeof preflightPaymentIntent>;
  executeIntent: (signed: SignedPaymentIntent, onPhase?: (phase: TxPhase) => void) => Promise<TxPhase>;
};

export function assertSupportedChain(chainId: number): void {
  if (chainId !== ARC_TESTNET_CHAIN_ID && chainId !== ARC_MAINNET_CHAIN_ID) {
    throw new ArcBondError("unsupported_network", `Chain ${chainId} is not Arc mainnet (5042) or Arc Testnet (5042002).`);
  }
}

export function createArcBondClient(config: {
  chainId: number;
  publicClient: PublicClient;
  walletClient?: WalletClient;
  factory?: Address;
  account?: Address;
}): ArcBondClient {
  assertSupportedChain(config.chainId);
  if (config.factory !== undefined && (!isAddress(config.factory) || config.factory === zeroAddress)) {
    throw new ArcBondError("missing_factory", "Factory address is missing or zero.");
  }
  return {
    chainId: config.chainId,
    factory: config.factory,
    publicClient: config.publicClient,
    readVault: (vault) => readVault(config.publicClient, vault),
    listVaults: (owner) => {
      if (!config.factory) {
        throw new ArcBondError("missing_factory", "A factory address is required to list vaults.");
      }
      return listVaults(config.publicClient, config.factory, owner);
    },
    preflight: (request) => preflightPayment(config.publicClient, request),
    createPaymentIntent: (input) => createPaymentIntent(config.publicClient, input),
    signPaymentIntent: (intent, signer) => signPaymentIntent({ intent, chainId: config.chainId, signer }),
    preflightIntent: (signed) => preflightPaymentIntent(config.publicClient, { ...signed, chainId: config.chainId }),
    async executeIntent(signed, onPhase) {
      if (!config.walletClient || !config.account) {
        throw new ArcBondError("missing_signer", "A wallet client and account are required to submit a signed intent.");
      }
      if (hashPaymentIntent(signed.intent, config.chainId) !== signed.digest) {
        throw new ArcBondError(
          "invalid_request",
          "A signed field changed after signing. Sign the intent again. The previous signature was not submitted.",
        );
      }
      const data = encodeExecutePaymentIntent(signed.intent, signed.signature);
      const preview = await simulateVaultCall({
        publicClient: config.publicClient,
        account: config.account,
        vault: signed.intent.vault,
        data,
      });
      if (!preview.ok) {
        throw new ArcBondError("simulation_reverted", preview.errorName ?? preview.message);
      }
      onPhase?.({ status: "simulated" });
      onPhase?.({ status: "awaiting_signature" });
      try {
        const hash = await submitContractWrite({
          publicClient: config.publicClient,
          walletClient: config.walletClient,
          account: config.account,
          address: signed.intent.vault,
          data,
        });
        const submitted: TxPhase = { status: "submitted", hash };
        onPhase?.(submitted);
        const receipt = await config.publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") {
          const reverted: TxPhase = {
            status: "reverted",
            hash,
            message: "The transaction was mined and reverted. The intent nonce and payment id were not consumed.",
          };
          onPhase?.(reverted);
          return reverted;
        }
        const confirmed: TxPhase = {
          status: "confirmed",
          hash,
          intentExecution: intentExecutionFromLogs(receipt.logs),
        };
        onPhase?.(confirmed);
        return confirmed;
      } catch (error) {
        const raw = error instanceof Error ? error.message : String(error);
        if (/User rejected|user rejected|User denied|denied transaction signature/i.test(raw)) {
          const rejected: TxPhase = { status: "rejected", message: "The wallet rejected the request. It was not resubmitted." };
          onPhase?.(rejected);
          return rejected;
        }
        const failed: TxPhase = { status: "failed", message: describeWriteFailure(error).message };
        onPhase?.(failed);
        return failed;
      }
    },
    async submitPayment(request, onPhase) {
      if (!config.walletClient || !config.account) {
        throw new ArcBondError("missing_signer", "A wallet client and account are required to submit a payment.");
      }
      if (request.amount <= 0n) {
        throw new ArcBondError("invalid_request", "Amount must be a positive 6-decimal base-unit integer.");
      }
      const data = encodeExecutePayment(request.recipient, request.amount, request.paymentId);
      const preview = await simulateVaultCall({
        publicClient: config.publicClient,
        account: config.account,
        vault: request.vault,
        data,
      });
      if (!preview.ok) {
        throw new ArcBondError("simulation_reverted", preview.errorName ?? preview.message);
      }
      onPhase?.({ status: "simulated" });
      onPhase?.({ status: "awaiting_signature" });
      try {
        const hash = await submitContractWrite({
          publicClient: config.publicClient,
          walletClient: config.walletClient,
          account: config.account,
          address: request.vault,
          data,
        });
        const submitted: TxPhase = { status: "submitted", hash };
        onPhase?.(submitted);
        const receipt = await config.publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") {
          const reverted: TxPhase = {
            status: "reverted",
            hash,
            message: "The transaction was mined and reverted. The payment id was not consumed.",
          };
          onPhase?.(reverted);
          return reverted;
        }
        const confirmed: TxPhase = { status: "confirmed", hash };
        onPhase?.(confirmed);
        return confirmed;
      } catch (error) {
        const raw = error instanceof Error ? error.message : String(error);
        if (/User rejected|user rejected|User denied|denied transaction signature/i.test(raw)) {
          const rejected: TxPhase = { status: "rejected", message: "The wallet rejected the request. It was not resubmitted." };
          onPhase?.(rejected);
          return rejected;
        }
        const failed: TxPhase = { status: "failed", message: describeWriteFailure(error).message };
        onPhase?.(failed);
        return failed;
      }
    },
  };
}
