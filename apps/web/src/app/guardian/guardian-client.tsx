"use client";

import { arcTestnetFactoryV2, arcTestnetWorkspaceFactory, evaluateGuardian, formatUsdc, readVault, type GuardianFact } from "@arcbond/sdk";
import { useState } from "react";
import { parseAbiItem } from "viem";
import { usePublicClient } from "wagmi";

import { EmptyState } from "@/components/EmptyState";
import { PageIntro, Surface } from "@/components/ui";
import { logBlockRanges } from "@/lib/log-ranges";
import { configuredChain } from "@/lib/wagmi";

const paymentEvent = parseAbiItem(
  "event PaymentExecuted(address indexed agent, address indexed recipient, uint256 amount, bytes32 indexed paymentId, uint64 periodId, uint256 spentInPeriod)",
);

const watched = [arcTestnetFactoryV2.proofVault, arcTestnetWorkspaceFactory.smokeWorkspace] as const;

const networkLabel = configuredChain.id === 5042002 ? "Arc Testnet" : "Arc mainnet";

export function GuardianClient() {
  const publicClient = usePublicClient({ chainId: configuredChain.id });
  const [status, setStatus] = useState("Not read yet. An empty list before a read is not a clean bill of health.");
  const [alerts, setAlerts] = useState<ReturnType<typeof evaluateGuardian>>([]);
  const [busy, setBusy] = useState(false);

  async function readChain() {
    if (!publicClient) {
      setStatus("No RPC client is available.");
      setAlerts([]);
      return;
    }
    if (configuredChain.id !== 5042002) {
      setAlerts([]);
      setStatus(`${networkLabel} is connected. There is no sample vault on this chain yet. Create one before expecting payment alerts. This is not a clean bill of health.`);
      return;
    }
    setBusy(true);
    try {
      const latest = await publicClient.getBlockNumber();
      const fromBlock = arcTestnetFactoryV2.deployBlock > latest ? latest : arcTestnetFactoryV2.deployBlock;
      const facts: GuardianFact[] = [];
      const now = Math.floor(Date.now() / 1000);
      for (const address of watched) {
        for (const range of logBlockRanges(fromBlock, latest)) {
          const logs = await publicClient.getLogs({ address, event: paymentEvent, fromBlock: range.fromBlock, toBlock: range.toBlock });
          for (const log of logs) {
            facts.push({
              id: `${log.transactionHash}:${log.logIndex}`,
              kind: "payment",
              at: now,
              subject: address,
              amount: log.args.amount,
              detail: log.args.agent,
            });
          }
        }
      }
      const vault = await readVault(publicClient, arcTestnetFactoryV2.proofVault);
      facts.push({
        id: `limit:${latest.toString()}`,
        kind: "near_limit",
        at: now,
        subject: arcTestnetFactoryV2.proofVault,
        amount: vault.displayedSpent,
        limit: vault.periodLimit,
      });
      facts.push({
        id: `balance:${latest.toString()}`,
        kind: "low_balance",
        at: now,
        subject: arcTestnetFactoryV2.proofVault,
        amount: vault.balance,
      });
      const next = evaluateGuardian(facts, now);
      setAlerts(next);
      setStatus(
        `Read ${networkLabel} block ${latest.toString()} from ${fromBlock.toString()}. Found ${facts.filter((fact) => fact.kind === "payment").length} payment logs. Vault balance ${formatUsdc(vault.balance)} USDC. These signals are not fraud findings.`,
      );
    } catch (error) {
      setAlerts([]);
      setStatus(error instanceof Error ? error.message : `${networkLabel} could not be read.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageIntro title="Policy guardian">
        This page reads {networkLabel} directly. It does not use a local server. Pause and revoke still require the owner wallet.
      </PageIntro>
      <Surface>
        <p className="text-sm text-muted">{status}</p>
        <button type="button" className="btn btn-solid mt-3" disabled={busy} onClick={() => void readChain()}>
          {busy ? `Reading ${networkLabel}…` : `Read ${networkLabel}`}
        </button>
      </Surface>
      {alerts.length === 0 ? (
        <EmptyState title="No signals from the last read">
          <p>Run the read before treating the workspace as quiet. A failed read is shown above.</p>
        </EmptyState>
      ) : (
        alerts.map((alert) => (
          <Surface key={alert.id} className="space-y-2">
            <p className="text-xs tracking-[0.16em] text-sky uppercase">
              {alert.severity} · {alert.rule}
            </p>
            <p className="text-sm">{alert.explanation}</p>
            <p className="break-all font-mono text-xs text-muted">{alert.subject}</p>
            <p className="text-sm text-muted">{alert.suggestion}</p>
          </Surface>
        ))
      )}
    </div>
  );
}
