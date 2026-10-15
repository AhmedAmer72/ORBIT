"use client";

import { encodeExecutePayment, isUsdcAddress, parseUsdc, paymentIdFromLabel, vaultAbi, ZERO_ADDRESS } from "@arcbond/sdk";
import { useState } from "react";
import { encodeFunctionData, type Address } from "viem";

import { ConfigMissing } from "@/components/ConfigMissing";
import { EmptyState } from "@/components/EmptyState";
import { TxStatus } from "@/components/TxStatus";
import { Field, PageIntro, Surface, TextInput } from "@/components/ui";
import { VaultPicker } from "@/components/VaultPicker";
import { WriteButton } from "@/components/WriteButton";
import { useActiveVault } from "@/hooks/useArcBond";
import { useTxWriter } from "@/hooks/useTx";

export function AgentsClient() {
  const { vault, state, factoryConfigured } = useActiveVault();
  const writer = useTxWriter();
  const [agent, setAgent] = useState("");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("0.5");
  const [paymentLabel, setPaymentLabel] = useState("");
  const snapshot = state.data;
  const isOwner = Boolean(writer.address && snapshot && writer.address.toLowerCase() === snapshot.owner.toLowerCase());
  const isAgent = Boolean(
    writer.address && snapshot && snapshot.agent !== ZERO_ADDRESS && writer.address.toLowerCase() === snapshot.agent.toLowerCase(),
  );
  const expired = snapshot ? snapshot.expiresAt !== 0n && BigInt(Math.floor(Date.now() / 1000)) >= snapshot.expiresAt : false;

  if (!factoryConfigured) {
    return (
      <div className="space-y-6">
        <PageIntro title="Agents">One agent per vault. The owner key never goes to the agent script.</PageIntro>
        <ConfigMissing />
      </div>
    );
  }
  if (!vault) {
    return (
      <div className="space-y-6">
        <PageIntro title="Agents">The agent can pay inside the current policy.</PageIntro>
        <EmptyState title="Select a vault">
          <p>The MVP supports one agent per vault.</p>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageIntro title="Agents">
        The agent can pay inside the current policy. It cannot change policy, add recipients, or withdraw.
      </PageIntro>
      <VaultPicker />
      {snapshot ? (
        <Surface>
          <p className="break-all font-mono text-sm">{snapshot.agent === ZERO_ADDRESS ? "No agent authorized." : snapshot.agent}</p>
          <p className="mt-2 text-sm text-muted">
            {snapshot.expiresAt === 0n
              ? "Expiry is unset. Payments revert with AuthorizationExpired."
              : expired
                ? `Expired at ${new Date(Number(snapshot.expiresAt) * 1000).toISOString()}.`
                : `Active until ${new Date(Number(snapshot.expiresAt) * 1000).toISOString()}.`}
          </p>
        </Surface>
      ) : null}
      <Field label="Agent address">
        <TextInput className="font-mono" value={agent} onChange={(e) => setAgent(e.target.value)} />
      </Field>
      <div className="flex flex-wrap gap-3">
        <WriteButton
          disabledReason={
            !isOwner
              ? "Only the owner can authorize an agent."
              : !isUsdcAddress(agent)
                ? "Enter a non-zero agent address."
                : writer.address && agent.toLowerCase() === writer.address.toLowerCase()
                  ? "The owner cannot be the agent."
                  : writer.writeDisabledReason
          }
          onClick={() =>
            vault &&
            isUsdcAddress(agent) &&
            writer.send(vault, encodeFunctionData({ abi: vaultAbi, functionName: "authorizeAgent", args: [agent as Address] }))
          }
        >
          Authorize agent
        </WriteButton>
        <WriteButton
          tone="ghost"
          disabledReason={!isOwner ? "Only the owner can revoke." : writer.writeDisabledReason}
          onClick={() => {
            if (!vault || !window.confirm("Revoke the current agent?")) return;
            writer.send(vault, encodeFunctionData({ abi: vaultAbi, functionName: "revokeAgent" }));
          }}
        >
          Revoke agent
        </WriteButton>
      </div>
      <Surface className="space-y-4">
        <h2 className="text-lg font-semibold">On-chain payment</h2>
        <p className="text-sm leading-6 text-muted">
          This calls <span className="font-mono text-paper">executePayment</span> on the vault. The connected wallet must
          be the authorized agent. The contract checks the cap, allowlist, expiry, pause, and payment id before USDC moves.
        </p>
        <Field label="Recipient">
          <TextInput className="font-mono" value={recipient} onChange={(event) => setRecipient(event.target.value)} />
        </Field>
        <Field label="Amount (USDC)">
          <TextInput value={amount} onChange={(event) => setAmount(event.target.value)} />
        </Field>
        <Field label="Payment id">
          <TextInput value={paymentLabel} onChange={(event) => setPaymentLabel(event.target.value)} />
        </Field>
        <WriteButton
          disabledReason={
            !isAgent
              ? "Connect the authorized agent. The owner cannot send this payment."
              : !isUsdcAddress(recipient)
                ? "Enter an approved recipient."
                : !paymentLabel.trim()
                  ? "Enter a payment id."
                  : writer.writeDisabledReason
          }
          onClick={() => {
            if (!vault || !isUsdcAddress(recipient)) return;
            if (!window.confirm("Submit this USDC payment from the vault?")) return;
            let parsed: bigint;
            try {
              parsed = parseUsdc(amount);
            } catch {
              return;
            }
            void writer.send(vault, encodeExecutePayment(recipient, parsed, paymentIdFromLabel(paymentLabel)));
          }}
        >
          Execute payment
        </WriteButton>
      </Surface>
      <TxStatus state={writer.state} />
    </div>
  );
}
