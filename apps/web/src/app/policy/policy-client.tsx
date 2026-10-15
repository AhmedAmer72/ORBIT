"use client";

import { formatUsdc, isUsdcAddress, parseUsdc, vaultAbi } from "@arcbond/sdk";
import { useState } from "react";
import { encodeFunctionData, type Address } from "viem";

import { ConfigMissing } from "@/components/ConfigMissing";
import { EmptyState } from "@/components/EmptyState";
import { TxStatus } from "@/components/TxStatus";
import { Field, PageIntro, Surface, TextInput } from "@/components/ui";
import { OpenVaultByAddress, VaultPicker } from "@/components/VaultPicker";
import { WriteButton } from "@/components/WriteButton";
import { useActiveVault, useRecipientApproved } from "@/hooks/useArcBond";
import { useTxWriter } from "@/hooks/useTx";

export function PolicyClient() {
  const { vault, state, factoryConfigured } = useActiveVault();
  const writer = useTxWriter();
  const snapshot = state.data;
  const [maxPer, setMaxPer] = useState("");
  const [period, setPeriod] = useState("");
  const [expiry, setExpiry] = useState("");
  const [recipient, setRecipient] = useState("");
  const recipientAddr = isUsdcAddress(recipient) ? (recipient as Address) : undefined;
  const approved = useRecipientApproved(vault, recipientAddr);
  const isOwner = Boolean(writer.address && snapshot && writer.address.toLowerCase() === snapshot.owner.toLowerCase());

  if (!factoryConfigured) {
    return (
      <div className="space-y-6">
        <PageIntro title="Policy">Caps and recipients are stored on the vault, not in the browser.</PageIntro>
        <ConfigMissing />
      </div>
    );
  }
  if (!vault) {
    return (
      <div className="space-y-6">
        <PageIntro title="Policy">The period cap resets at 00:00 UTC.</PageIntro>
        <EmptyState title="No vault is open">
          <p>Policy is stored on a vault. Owners see vaults they created. An agent can paste the vault address, but only the owner can change policy.</p>
          <OpenVaultByAddress />
        </EmptyState>
      </div>
    );
  }

  const expirySeconds = expiry ? Math.floor(new Date(expiry).getTime() / 1000) : 0;
  const daysAhead = expirySeconds ? (expirySeconds - Date.now() / 1000) / 86400 : 0;

  return (
    <div className="space-y-6">
      <PageIntro title="Policy">
        The contract enforces these rules. The period cap resets at 00:00 UTC. Spending the full cap just before and just
        after that boundary is allowed.
      </PageIntro>
      <VaultPicker />
      {snapshot ? (
        <Surface>
          <p className="text-sm text-muted">
            Current cap {formatUsdc(snapshot.maxPerPayment)} per payment, {formatUsdc(snapshot.periodLimit)} per UTC day,
            expires{" "}
            {snapshot.expiresAt === 0n
              ? "never set (payments fail)"
              : new Date(Number(snapshot.expiresAt) * 1000).toISOString()}
            .
          </p>
        </Surface>
      ) : null}
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!vault) return;
          try {
            writer.send(
              vault,
              encodeFunctionData({
                abi: vaultAbi,
                functionName: "updatePolicy",
                args: [parseUsdc(maxPer), parseUsdc(period), BigInt(expirySeconds)],
              }),
            );
          } catch {
            return;
          }
        }}
      >
        <Surface className="space-y-4">
          <Field label="Maximum amount per payment (USDC)">
            <TextInput value={maxPer} onChange={(e) => setMaxPer(e.target.value)} required />
          </Field>
          <Field label="Maximum spending each UTC day (USDC)">
            <TextInput value={period} onChange={(e) => setPeriod(e.target.value)} required />
          </Field>
          <Field label="Agent authorization expires">
            <TextInput type="datetime-local" value={expiry} onChange={(e) => setExpiry(e.target.value)} required />
          </Field>
          {daysAhead > 90 ? (
            <p className="text-sm text-accent">This expiry is more than 90 days away. The contract does not cap duration.</p>
          ) : null}
          <WriteButton type="submit" disabledReason={!isOwner ? "Only the owner can update policy." : writer.writeDisabledReason}>
            Save policy
          </WriteButton>
          <p className="text-sm text-muted">Saving the caps and expiry does not approve a recipient. That is the separate transaction below.</p>
        </Surface>
      </form>
      <Surface className="space-y-3">
        <Field label="Recipient">
          <TextInput className="font-mono" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
        </Field>
        <p className="text-sm text-muted">
          {recipientAddr
            ? approved.isLoading
              ? "Checking allowlist…"
              : approved.data
                ? "This address is approved."
                : "This address is not approved. An empty allowlist rejects every payment."
            : "Enter a non-zero address."}
        </p>
        <div className="flex flex-wrap gap-3">
          <WriteButton
            disabledReason={!isOwner ? "Only the owner can change recipients." : !recipientAddr ? "Enter a valid recipient." : writer.writeDisabledReason}
            onClick={() =>
              vault &&
              recipientAddr &&
              writer.send(vault, encodeFunctionData({ abi: vaultAbi, functionName: "setRecipient", args: [recipientAddr, true] }))
            }
          >
            Approve recipient
          </WriteButton>
          <WriteButton
            tone="ghost"
            disabledReason={!isOwner ? "Only the owner can change recipients." : !recipientAddr ? "Enter a valid recipient." : writer.writeDisabledReason}
            onClick={() =>
              vault &&
              recipientAddr &&
              writer.send(vault, encodeFunctionData({ abi: vaultAbi, functionName: "setRecipient", args: [recipientAddr, false] }))
            }
          >
            Remove recipient
          </WriteButton>
        </div>
      </Surface>
      <TxStatus state={writer.state} />
    </div>
  );
}
