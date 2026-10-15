import {
  arcTestnetFactoryV2,
  createPaymentIntent,
  encodeExecutePaymentIntent,
  paymentIdFromLabel,
  signPaymentIntent,
  verifyPaywallSettlement,
  type PaymentIntent,
} from "@arcbond/sdk";
import { useEffect, useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";

import { Field, PageIntro, Surface, TextInput } from "@/components/ui";
import { appConfig } from "@/lib/config";
import { submitPreparedWrite } from "@/lib/tx";
import { configuredChain } from "@/lib/wagmi";

type Health = {
  ok: boolean;
  priceDisplay?: string;
  chainId?: number;
  recipient?: string;
  factory?: string | null;
  factoryVersion?: string | null;
  paymentIntents?: boolean;
  relayerConfigured?: boolean;
  message?: string;
};

type Quote = {
  quoteId: string;
  record: "testnet" | "mainnet";
  vault: `0x${string}`;
  recipient: `0x${string}`;
  amount: string;
  amountDisplay: string;
  paymentId: `0x${string}`;
  expiresAt: number;
  note: string;
};

type Relay = {
  status: string;
  transactionHash: string | null;
  message: string | null;
  paymentSettled: boolean;
  digest: string;
};

type Delivery = {
  delivered?: boolean;
  checksum?: string;
  message?: string;
  record?: { name: string; chainId: number; rpcUrl: string; usdc: string };
  payment?: { transactionHash: string; amount: string };
};

function intentBody(intent: PaymentIntent) {
  return {
    ...intent,
    amount: intent.amount.toString(),
    nonce: intent.nonce.toString(),
    deadline: intent.deadline.toString(),
    policyVersion: intent.policyVersion.toString(),
  };
}

const networkLabel = configuredChain.id === 5042002 ? "Arc Testnet" : "Arc mainnet";

export function PayClient() {
  const payUrl = appConfig.payApiUrl?.replace(/\/$/, "");
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: configuredChain.id });
  const { data: walletClient } = useWalletClient();
  const [health, setHealth] = useState<Health | null>(null);
  const [vault, setVault] = useState<string>(configuredChain.id === 5042002 ? arcTestnetFactoryV2.proofVault : "");
  const [recipient, setRecipient] = useState(configuredChain.id === 5042002 ? arcTestnetFactoryV2.proofRecipient : "");
  const [record, setRecord] = useState<"testnet" | "mainnet">(configuredChain.id === 5042002 ? "testnet" : "mainnet");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [relay, setRelay] = useState<Relay | null>(null);
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!payUrl) return;
    let cancelled = false;
    fetch(`${payUrl}/health`)
      .then((response) => response.json())
      .then((body: Health) => {
        if (!cancelled) setHealth(body);
      })
      .catch(() => {
        if (!cancelled) setHealth({ ok: false, message: "The payments service is not reachable." });
      });
    return () => {
      cancelled = true;
    };
  }, [payUrl]);

  async function settleOnTestnet() {
    if (!publicClient || !walletClient || !address) {
      setError(`Connect the vault's agent wallet on ${networkLabel}.`);
      return;
    }
    if (!vault || !recipient.startsWith("0x")) {
      setError("Enter the vault and the allowlisted recipient. This page will not invent them.");
      return;
    }
    setBusy(true);
    setError(null);
    setRelay(null);
    setDelivery(null);
    try {
      const paymentId = paymentIdFromLabel(`agent-pay-${Date.now()}`);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 10 * 60);
      const intent = await createPaymentIntent(publicClient, {
        vault: vault as `0x${string}`,
        recipient: recipient as `0x${string}`,
        amount: 500_000n,
        paymentId,
        deadline,
      });
      if (intent.agent.toLowerCase() !== address.toLowerCase()) {
        throw new Error("Connect the agent authorized on this vault. The owner cannot send the intent.");
      }
      const signed = await signPaymentIntent({
        intent,
        chainId: configuredChain.id,
        signer: { signTypedData: (parameters) => walletClient.signTypedData(parameters) },
      });
      const submitted = await submitPreparedWrite({
        publicClient,
        walletClient,
        account: address,
        address: intent.vault,
        data: encodeExecutePaymentIntent(signed.intent, signed.signature),
      });
      if (submitted.kind !== "success") {
        throw new Error("message" in submitted ? submitted.message : `${networkLabel} did not confirm the payment.`);
      }
      const receipt = await publicClient.getTransactionReceipt({ hash: submitted.hash });
      const settlement = await verifyPaywallSettlement(
        publicClient,
        {
          id: paymentId,
          serviceId: "arc-network-record",
          requestId: paymentId,
          chainId: configuredChain.id,
          vault: intent.vault,
          recipient: recipient as `0x${string}`,
          token: appConfig.usdc,
          amount: 500_000n,
          paymentId,
          expiresAt: Number(deadline),
        },
        receipt.blockNumber,
      );
      setRelay({
        status: "confirmed",
        transactionHash: settlement.transactionHash,
        message: `Submitted by the connected agent on ${networkLabel}.`,
        paymentSettled: true,
        digest: signed.digest,
      });
      setDelivery({
        delivered: true,
        record: {
          name: networkLabel,
          chainId: configuredChain.id,
          rpcUrl: appConfig.rpcUrl,
          usdc: appConfig.usdc,
        },
        payment: { transactionHash: settlement.transactionHash, amount: "500000" },
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `The ${networkLabel} payment failed.`);
    } finally {
      setBusy(false);
    }
  }

  async function quoteService() {
    if (!payUrl) return;
    setBusy(true);
    setError(null);
    setQuote(null);
    setRelay(null);
    setDelivery(null);
    try {
      const response = await fetch(`${payUrl}/provider/quotes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vault, record }),
      });
      const body = (await response.json()) as Quote & { message?: string };
      if (!response.ok) throw new Error(body.message ?? "The provider refused the quote.");
      setQuote(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not request a quote.");
    } finally {
      setBusy(false);
    }
  }

  async function signAndSubmit() {
    if (!payUrl || !quote || !publicClient || !walletClient || !address) return;
    setBusy(true);
    setError(null);
    setRelay(null);
    setDelivery(null);
    try {
      const intent = await createPaymentIntent(publicClient, {
        vault: quote.vault,
        recipient: quote.recipient,
        amount: BigInt(quote.amount),
        paymentId: quote.paymentId,
        deadline: BigInt(quote.expiresAt),
      });
      if (intent.agent.toLowerCase() !== address.toLowerCase()) {
        throw new Error("Connect the vault's agent account. This page will not accept a pasted private key.");
      }
      const signed = await signPaymentIntent({
        intent,
        chainId: appConfig.chainId,
        signer: {
          signTypedData: (parameters) => walletClient.signTypedData(parameters),
        },
      });
      const response = await fetch(`${payUrl}/relay/intents`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          quoteId: quote.quoteId,
          chainId: appConfig.chainId,
          digest: signed.digest,
          signature: signed.signature,
          intent: intentBody(intent),
        }),
      });
      const body = (await response.json()) as Relay & { message?: string };
      if (!response.ok) throw new Error(body.message ?? "The relay rejected the intent.");
      setRelay(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The intent was not submitted.");
    } finally {
      setBusy(false);
    }
  }

  async function requestRecord() {
    if (!payUrl || !quote) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`${payUrl}/provider/deliveries`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ quoteId: quote.quoteId }),
      });
      const body = (await response.json()) as Delivery;
      setDelivery(body);
      if (!response.ok || !body.delivered) {
        throw new Error(body.message ?? "The provider did not deliver the record.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Delivery failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageIntro title="Pay per API">
        The agent signs an exact USDC intent and submits it on {networkLabel}. The record appears only after this page reads
        the vault log. A signature or a transaction hash by itself is not delivery.
      </PageIntro>

      <Surface>
        <p className="text-sm leading-6 text-muted">
          Settle 0.50 USDC on {networkLabel} from the connected agent. Enter a vault from the factory on this chain
          and a recipient that vault has approved. The record appears only after this page reads the vault log.
        </p>
        <label className="mt-4 grid gap-1 text-sm">
          Allowlisted recipient
          <input className="rounded-xl border border-line bg-ink px-3 py-2 font-mono text-xs" value={recipient} onChange={(event) => setRecipient(event.target.value)} spellCheck={false} />
        </label>
        <button className="btn btn-solid mt-4" type="button" disabled={busy || !address} onClick={() => void settleOnTestnet()}>
          {busy ? `Sending to ${networkLabel}…` : `Settle on ${networkLabel}`}
        </button>
      </Surface>
      {!payUrl ? null : (
        <>
          <Surface>
            <p className="text-sm text-muted">
              {health?.ok === false
                ? health.message
                : health
                  ? `Service price ${health.priceDisplay ?? "0.50"} USDC. Factory version ${health.factoryVersion ?? "unknown"}. Intents ${health.paymentIntents ? "available" : "unavailable"}. Relayer ${health.relayerConfigured ? "configured" : "missing"}.`
                  : "Checking the payments service."}
            </p>
          </Surface>
          <Surface>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Vault">
                <TextInput value={vault} onChange={(event) => setVault(event.target.value)} placeholder="0x" spellCheck={false} />
              </Field>
              <Field label="Record">
                <select className="mt-2 w-full rounded-xl border border-line bg-ink/80 px-3 py-2.5 text-sm" value={record} onChange={(event) => setRecord(event.target.value as "testnet" | "mainnet")}>
                  <option value="testnet">Arc Testnet</option>
                  <option value="mainnet">Arc mainnet</option>
                </select>
              </Field>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <button className="btn btn-solid" type="button" disabled={busy || health?.paymentIntents === false} onClick={() => void quoteService()}>
                Request quote
              </button>
              <button className="btn btn-ghost" type="button" disabled={busy || !quote || !address} onClick={() => void signAndSubmit()}>
                Sign and submit
              </button>
              <button className="btn btn-ghost" type="button" disabled={busy || !quote} onClick={() => void requestRecord()}>
                Ask the provider
              </button>
            </div>
            {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
          </Surface>
          {quote ? (
            <Surface>
              <h2 className="text-lg font-semibold">Quote</h2>
              <p className="mt-2 text-sm leading-6 text-muted">{quote.note}</p>
              <dl className="mt-4 grid gap-2 font-mono text-xs text-paper/80">
                <div>Amount {quote.amountDisplay} USDC</div>
                <div className="break-all">Recipient {quote.recipient}</div>
                <div className="break-all">Payment id {quote.paymentId}</div>
                <div>Expires {new Date(quote.expiresAt * 1000).toISOString()}</div>
              </dl>
            </Surface>
          ) : null}
          {relay ? (
            <Surface>
              <h2 className="text-lg font-semibold">Relay</h2>
              <p className="mt-2 text-sm text-muted">
                Status {relay.status}. {relay.paymentSettled ? "The relay saw a successful receipt." : "This is not the service response."}{" "}
                {relay.message ?? ""}
              </p>
              {relay.transactionHash ? <p className="mt-2 break-all font-mono text-xs">{relay.transactionHash}</p> : null}
            </Surface>
          ) : null}
          {delivery?.delivered && delivery.record ? (
            <Surface>
              <h2 className="text-lg font-semibold">Delivered by the provider</h2>
              <p className="mt-2 text-sm text-muted">
                {delivery.record.name}. Chain {delivery.record.chainId}. Checksum {delivery.checksum}.
              </p>
              <p className="mt-2 break-all font-mono text-xs text-paper/80">{delivery.record.rpcUrl}</p>
            </Surface>
          ) : null}
        </>
      )}
    </div>
  );
}
