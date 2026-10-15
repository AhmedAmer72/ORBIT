"use client";

import { erc20Abi, factoryAbi, formatUsdc, parseUsdc, vaultAbi } from "@arcbond/sdk";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { encodeFunctionData, parseEventLogs } from "viem";
import { usePublicClient, useWalletClient } from "wagmi";

import { useConfirm } from "@/components/AppDialog";
import { ConfigMissing } from "@/components/ConfigMissing";
import { EmptyState } from "@/components/EmptyState";
import { TxStatus } from "@/components/TxStatus";
import { Field, PageIntro, Surface, TextInput } from "@/components/ui";
import { VaultPicker } from "@/components/VaultPicker";
import { WriteButton } from "@/components/WriteButton";
import { useActiveVault } from "@/hooks/useArcBond";
import { useInvalidateVaultQueries, useTxWriter } from "@/hooks/useTx";
import { appConfig } from "@/lib/config";
import { configuredChain } from "@/lib/wagmi";
import { submitPreparedWrite, type TxState } from "@/lib/tx";

export function VaultsClient() {
  const { vault, owned, state, factoryConfigured } = useActiveVault();
  const writer = useTxWriter();
  const confirm = useConfirm();
  const invalidate = useInvalidateVaultQueries();
  const navigate = useNavigate();
  const publicClient = usePublicClient({ chainId: configuredChain.id });
  const { data: walletClient } = useWalletClient();
  const [amount, setAmount] = useState("1");
  const [flow, setFlow] = useState<TxState>({ kind: "idle" });

  if (!factoryConfigured || !appConfig.factory) {
    return (
      <div className="space-y-6">
        <PageIntro title="Vaults">Each vault is an isolated clone. Deposits use the 6-decimal USDC interface.</PageIntro>
        <ConfigMissing />
      </div>
    );
  }

  const snapshot = state.data;
  const isOwner = Boolean(writer.address && snapshot && writer.address.toLowerCase() === snapshot.owner.toLowerCase());

  async function createVault() {
    const result = await writer.send(appConfig.factory!, encodeFunctionData({ abi: factoryAbi, functionName: "createVault" }));
    if (result.kind !== "success") return;
    const created = parseEventLogs({ abi: factoryAbi, logs: result.logs, eventName: "VaultCreated" });
    const next = created[0]?.args.vault;
    if (next) navigate(`/app/vaults?vault=${next}`);
  }

  async function deposit() {
    if (!vault || !writer.address || !publicClient || !walletClient) return;
    let parsed: bigint;
    try {
      parsed = parseUsdc(amount);
    } catch {
      setFlow({ kind: "error", message: "Enter a USDC amount using 6-decimal units, for example 1.25." });
      return;
    }
    setFlow({ kind: "simulating" });
    const approve = await submitPreparedWrite({
      publicClient,
      walletClient,
      account: writer.address,
      address: appConfig.usdc,
      data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [vault, parsed] }),
    });
    if (approve.kind !== "success") {
      setFlow(approve);
      return;
    }
    const deposited = await submitPreparedWrite({
      publicClient,
      walletClient,
      account: writer.address,
      address: vault,
      data: encodeFunctionData({ abi: vaultAbi, functionName: "deposit", args: [parsed] }),
    });
    setFlow(deposited);
    if (deposited.kind === "success") await invalidate();
  }

  async function withdraw() {
    if (!vault) return;
    try {
      await writer.send(
        vault,
        encodeFunctionData({ abi: vaultAbi, functionName: "withdraw", args: [parseUsdc(amount)] }),
      );
    } catch {
      setFlow({ kind: "error", message: "Enter a USDC amount using 6-decimal units, for example 1.25." });
    }
  }

  return (
    <div className="space-y-6">
      <PageIntro title="Vaults">Each create deploys an isolated clone. Native USDC transfers to the vault are rejected.</PageIntro>
      <WriteButton disabledReason={writer.writeDisabledReason} onClick={createVault}>
        Create vault
      </WriteButton>
      <TxStatus state={writer.state} />
      <VaultPicker />
      {writer.address && !owned.isLoading && !owned.data?.length ? (
        <EmptyState title="No vaults for this wallet">
          <p>Create a vault, then fund it through approve and deposit.</p>
        </EmptyState>
      ) : null}
      {snapshot && vault ? (
        <Surface className="space-y-4">
          <p className="font-mono text-xs text-muted">{vault}</p>
          <p className="text-2xl font-semibold">{formatUsdc(snapshot.balance)} USDC</p>
          <p className="break-all text-sm text-muted">Owner {snapshot.owner}</p>
          <Field label="Amount (USDC)">
            <TextInput value={amount} onChange={(event) => setAmount(event.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-3">
            <WriteButton disabledReason={writer.writeDisabledReason} onClick={deposit}>
              Approve and deposit
            </WriteButton>
            <WriteButton
              tone="ghost"
              disabledReason={!isOwner ? "Only the owner can withdraw." : writer.writeDisabledReason}
              onClick={() => {
                void confirm({
                  title: "Withdraw USDC",
                  body: "Withdraw this USDC amount to the owner address?",
                  confirmLabel: "Withdraw",
                  tone: "danger",
                }).then((accepted) => {
                  if (accepted) withdraw();
                });
              }}
            >
              Withdraw
            </WriteButton>
          </div>
          <TxStatus state={flow} />
        </Surface>
      ) : null}
    </div>
  );
}
