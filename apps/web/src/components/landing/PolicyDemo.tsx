"use client";

import { arcTestnetFactoryV2, encodeExecutePayment, formatUsdc, parseUsdc, paymentIdFromLabel, readVault, simulateVaultCall } from "@arcbond/sdk";
import { useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";

import { submitPreparedWrite } from "@/lib/tx";
import { configuredChain } from "@/lib/wagmi";

const vault = arcTestnetFactoryV2.proofVault;
const recipient = arcTestnetFactoryV2.proofRecipient;

export function PolicyDemo() {
  const publicClient = usePublicClient({ chainId: configuredChain.id });
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const [amount, setAmount] = useState("0.50");
  const [status, setStatus] = useState<string>("Not checked yet.");
  const [ok, setOk] = useState<boolean | null>(null);
  const [tx, setTx] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function checkOnTestnet() {
    if (!publicClient || configuredChain.id !== 5042002) {
      setOk(null);
      setStatus("This sample vault is on Arc Testnet. The app is on another chain, so this box will not pretend to read it. Create a vault in the app.");
      return;
    }
    setBusy(true);
    setTx(null);
    try {
      const state = await readVault(publicClient, vault);
      const parsed = parseUsdc(amount);
      const preview = await simulateVaultCall({
        publicClient,
        account: state.agent,
        vault,
        data: encodeExecutePayment(recipient, parsed, paymentIdFromLabel(`landing-${Date.now()}`)),
      });
      setOk(preview.ok);
      setStatus(
        preview.ok
          ? `Arc Testnet would accept this payment from the vault agent. Balance ${formatUsdc(state.balance)} USDC. Cap ${formatUsdc(state.maxPerPayment)} USDC. This was an eth_call, so no USDC moved.`
          : `Arc Testnet rejected the call: ${preview.errorName ?? preview.message}`,
      );
    } catch (error) {
      setOk(false);
      setStatus(error instanceof Error ? error.message : "The testnet call failed.");
    } finally {
      setBusy(false);
    }
  }

  async function sendOnTestnet() {
    if (!publicClient || !walletClient || !address) return;
    if (!window.confirm("Send this USDC payment on Arc Testnet from the connected agent?")) return;
    setBusy(true);
    setTx(null);
    try {
      const parsed = parseUsdc(amount);
      const result = await submitPreparedWrite({
        publicClient,
        walletClient,
        account: address,
        address: vault,
        data: encodeExecutePayment(recipient, parsed, paymentIdFromLabel(`landing-tx-${Date.now()}`)),
      });
      if (result.kind === "success") {
        setOk(true);
        setTx(result.hash);
        setStatus("Arc Testnet mined the payment. The receipt succeeded.");
      } else {
        setOk(false);
        setStatus("message" in result ? result.message : "The testnet transaction did not succeed.");
      }
    } catch (error) {
      setOk(false);
      setStatus(error instanceof Error ? error.message : "The testnet transaction failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="text-xs uppercase tracking-[0.16em] text-sky">
        {configuredChain.id === 5042002 ? "Arc Testnet vault" : "Arc mainnet"}
      </p>
      {configuredChain.id === 5042002 ? (
        <p className="mt-2 break-all font-mono text-xs text-muted">{vault}</p>
      ) : null}
      <p className="mt-2 text-sm text-muted">
        {configuredChain.id === 5042002
          ? `The check calls the deployed vault on chain ${configuredChain.id}. Sending a payment requires the authorized agent wallet and moves real testnet USDC to ${recipient.slice(0, 6)}…${recipient.slice(-4)}.`
          : "This app is on Arc mainnet. The old sample vault is on testnet, so this box will not send from it. Create a vault in the app to check a rule. A simulation does not move USDC."}
      </p>
      <label className="mt-5 grid gap-1 text-sm">
        Requested amount
        <input className="rounded-xl border border-line bg-ink px-3 py-2" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" />
      </label>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" className="btn btn-ghost btn-chip" disabled={busy || configuredChain.id !== 5042002} onClick={() => void checkOnTestnet()}>
          {configuredChain.id === 5042002 ? (busy ? "Contacting Arc…" : "Check on Arc Testnet") : "Sample check is testnet-only"}
        </button>
        {configuredChain.id === 5042002 ? (
          <button type="button" className="btn btn-solid" disabled={busy || !address || !walletClient} onClick={() => void sendOnTestnet()}>
            Send on Arc Testnet
          </button>
        ) : null}
      </div>
      <p className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${ok === null ? "border-line text-muted" : ok ? "border-ok/40 text-ok" : "border-danger/40 text-danger"}`} role="status">
        {status}
      </p>
      {tx ? <p className="mt-2 break-all font-mono text-xs text-muted">{tx}</p> : null}
    </div>
  );
}
