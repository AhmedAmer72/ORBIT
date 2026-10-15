"use client";

import { encodeExecutePayment, isUsdcAddress, parseUsdc, paymentIdFromLabel, vaultAbi, ZERO_ADDRESS } from "@arcbond/sdk";
import { rememberVault } from "@/lib/known-vaults";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { encodeFunctionData, parseAbiItem, type Address } from "viem";
import { usePublicClient } from "wagmi";

import { useConfirm } from "@/components/AppDialog";
import { ConfigMissing } from "@/components/ConfigMissing";
import { EmptyState } from "@/components/EmptyState";
import { TxStatus } from "@/components/TxStatus";
import { Field, PageIntro, Surface, TextInput } from "@/components/ui";
import { OpenVaultByAddress, VaultPicker } from "@/components/VaultPicker";
import { WriteButton } from "@/components/WriteButton";
import { useActiveVault, useRecipientApproved } from "@/hooks/useArcBond";
import { useTxWriter } from "@/hooks/useTx";
import { configuredChain } from "@/lib/wagmi";

export function AgentsClient() {
  const { vault, state, verified, factoryConfigured } = useActiveVault();
  const writer = useTxWriter();
  const confirm = useConfirm();
  const [agent, setAgent] = useState("");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("0.5");
  const [paymentLabel, setPaymentLabel] = useState("");
  const recipientAddr = isUsdcAddress(recipient) ? (recipient as Address) : undefined;
  const recipientApproved = useRecipientApproved(vault, recipientAddr);
  const publicClient = usePublicClient({ chainId: configuredChain.id });
  const approvedOnVault = useQuery({
    queryKey: ["recipient-log", vault],
    enabled: Boolean(vault && publicClient),
    staleTime: 30_000,
    retry: false,
    queryFn: async () => {
      if (!vault || !publicClient) return [];
      const latest = await publicClient.getBlockNumber();
      const fromBlock = latest >= 9_999n ? latest - 9_999n : 0n;
      const logs = await publicClient.getLogs({
        address: vault,
        event: parseAbiItem("event RecipientUpdated(address indexed recipient, bool approved)"),
        fromBlock,
        toBlock: latest,
      });
      const status = new Map<string, Address>();
      for (const log of logs) {
        if (!log.args.recipient) continue;
        if (log.args.approved) status.set(log.args.recipient.toLowerCase(), log.args.recipient);
        else status.delete(log.args.recipient.toLowerCase());
      }
      return [...status.values()];
    },
  });
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
        <EmptyState title="No vault is open for this wallet">
          <p>
            Connected as {writer.address ? `${writer.address.slice(0, 6)}…${writer.address.slice(-4)}` : "no wallet"}. Owners
            see vaults they created. If this wallet was authorized as an agent, its vault appears here when that
            authorization is in the latest 10,000 blocks or was opened in this browser before.
          </p>
          <OpenVaultByAddress />
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
      {state.error ? (
        <Surface>
          <p className="text-sm text-danger">This address did not return a vault. Paste the vault contract from the owner’s Vaults page, not a wallet address.</p>
        </Surface>
      ) : null}
      {vault && verified === false && !state.isLoading ? (
        <Surface>
          <p className="break-all font-mono text-sm">{vault}</p>
          <p className="mt-2 text-sm text-danger">This address is not a vault from the factory. The owner wallet address cannot receive a payment.</p>
        </Surface>
      ) : null}
      {snapshot ? (
        <Surface>
          <p className="text-sm text-muted">Authorized agent on this vault</p>
          <p className="mt-1 break-all font-mono text-sm">{snapshot.agent === ZERO_ADDRESS ? "No agent authorized." : snapshot.agent}</p>
          <p className="mt-2 text-sm text-muted">
            {snapshot.expiresAt === 0n
              ? "Expiry is unset. Payments revert with AuthorizationExpired."
              : expired
                ? `Expired at ${new Date(Number(snapshot.expiresAt) * 1000).toISOString()}.`
                : `Active until ${new Date(Number(snapshot.expiresAt) * 1000).toISOString()}.`}
          </p>
        </Surface>
      ) : null}
      {isAgent ? (
        <Surface>
          <p className="text-sm text-paper">You are the agent on this vault.</p>
          <p className="mt-2 text-sm text-muted">
            Submit the payment below. Changing the agent, the policy, the allowlist, or the balance stays with the owner wallet.
          </p>
        </Surface>
      ) : isOwner ? (
        <Surface>
          <p className="text-sm text-paper">You are the owner.</p>
          <p className="mt-2 text-sm text-muted">
            Authorize one agent here. To send a payment, disconnect and connect that agent wallet. The payment form below stays disabled for the owner.
          </p>
        </Surface>
      ) : snapshot ? (
        <Surface>
          <p className="text-sm text-danger">This wallet is neither the owner nor the agent on this vault.</p>
          <p className="mt-2 text-sm text-muted">Switch to the owner to change who can pay, or to the authorized agent to submit a payment.</p>
        </Surface>
      ) : null}
      {isOwner ? (
        <>
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
          onClick={() => {
            if (!vault || !isUsdcAddress(agent)) return;
            void writer.send(vault, encodeFunctionData({ abi: vaultAbi, functionName: "authorizeAgent", args: [agent as Address] })).then((result) => {
              if (result.kind === "success") rememberVault(agent, vault);
            });
          }}
        >
          Authorize agent
        </WriteButton>
        <WriteButton
          tone="ghost"
          disabledReason={!isOwner ? "Only the owner can revoke." : writer.writeDisabledReason}
          onClick={() => {
            if (!vault) return;
            void confirm({
              title: "Revoke agent",
              body: "Revoke the current agent? Payments from that address will fail.",
              confirmLabel: "Revoke",
              tone: "danger",
            }).then((accepted) => {
              if (!accepted) return;
              void writer.send(vault, encodeFunctionData({ abi: vaultAbi, functionName: "revokeAgent" }));
            });
          }}
        >
          Revoke agent
        </WriteButton>
      </div>
        </>
      ) : null}
      <Surface className="space-y-4">
        <h2 className="text-lg font-semibold">On-chain payment</h2>
        <p className="text-sm leading-6 text-muted">
          This calls <span className="font-mono text-paper">executePayment</span> on the vault. The connected wallet must
          be the authorized agent. The contract checks the cap, allowlist, expiry, pause, and payment id before USDC moves.
        </p>
        <p className="break-all font-mono text-xs text-muted">Vault {vault}</p>
        <Field label="Recipient">
          <TextInput className="font-mono" value={recipient} onChange={(event) => setRecipient(event.target.value.trim())} />
        </Field>
        {approvedOnVault.data?.length ? (
          <div className="space-y-2">
            <p className="text-sm text-muted">Approved on this vault. Use one of these addresses exactly.</p>
            <div className="flex flex-wrap gap-2">
              {approvedOnVault.data.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="rounded-full border border-line px-3 py-1 font-mono text-xs text-paper"
                  onClick={() => setRecipient(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        ) : approvedOnVault.isFetched ? (
          <p className="text-sm text-muted">
            This vault has no recipient approval in the latest 10,000 blocks. The owner may have approved the address on a different vault.
          </p>
        ) : null}
        <Field label="Amount (USDC)">
          <TextInput value={amount} onChange={(event) => setAmount(event.target.value)} />
        </Field>
        <Field label="Payment id">
          <TextInput value={paymentLabel} onChange={(event) => setPaymentLabel(event.target.value)} />
        </Field>
        <WriteButton
          disabledReason={
            !snapshot
              ? "Open a factory vault before paying."
              : snapshot.agent === ZERO_ADDRESS
                ? "No agent is authorized on this vault yet."
                : !isAgent
                  ? "The connected wallet is not the agent stored on this vault."
                  : !recipientAddr
                    ? "Enter an approved recipient."
                    : recipientApproved.isLoading
                      ? "Checking the allowlist…"
                      : recipientApproved.data !== true
                        ? "This recipient is not on the vault allowlist. The owner approves it on Policies. Saving the caps does not approve it."
                    : !paymentLabel.trim()
                      ? "Enter a payment id."
                      : writer.writeDisabledReason
          }
          onClick={() => {
            void (async () => {
            if (!vault || !isUsdcAddress(recipient)) return;
            const accepted = await confirm({
              title: "Submit payment",
              body: "Submit this USDC payment from the vault? The contract still checks the cap, allowlist, expiry, and payment id.",
              confirmLabel: "Execute payment",
            });
            if (!accepted) return;
            let parsed: bigint;
            try {
              parsed = parseUsdc(amount);
            } catch {
              return;
            }
            void writer.send(vault, encodeExecutePayment(recipient, parsed, paymentIdFromLabel(paymentLabel)));
            })();
          }}
        >
          Execute payment
        </WriteButton>
      </Surface>
      <TxStatus state={writer.state} />
    </div>
  );
}
