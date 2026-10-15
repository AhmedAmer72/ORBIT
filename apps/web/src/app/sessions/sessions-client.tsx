"use client";

import { formatUsdc, parseUsdc, paymentIdFromLabel, workspaceAbi } from "@arcbond/sdk";
import { useState } from "react";
import { encodeFunctionData, type Address, type Hex } from "viem";
import { useReadContract } from "wagmi";

import { EmptyState } from "@/components/EmptyState";
import { TxStatus } from "@/components/TxStatus";
import { Field, PageIntro, Surface, TextInput } from "@/components/ui";
import { WriteButton } from "@/components/WriteButton";
import { useTxWriter } from "@/hooks/useTx";
import { configuredChain } from "@/lib/wagmi";

export function SessionsClient() {
  const writer = useTxWriter();
  const [workspace, setWorkspace] = useState("");
  const [sessionLabel, setSessionLabel] = useState("session-1");
  const [agent, setAgent] = useState("");
  const [provider, setProvider] = useState("");
  const [budget, setBudget] = useState("2");
  const [deadline, setDeadline] = useState("");
  const address = /^0x[0-9a-fA-F]{40}$/.test(workspace) ? (workspace as Address) : undefined;
  const sessionId = paymentIdFromLabel(sessionLabel);
  const session = useReadContract({
    chainId: configuredChain.id,
    address,
    abi: workspaceAbi,
    functionName: "sessions",
    args: [sessionId],
    query: { enabled: Boolean(address) },
  });
  const row = session.data;
  const open = row?.[8] === true;

  if (!address && !writer.address) {
    return (
      <div className="space-y-6">
        <PageIntro title="Metered sessions">A session reserves USDC inside one workspace.</PageIntro>
        <EmptyState title="Connect the workspace owner">
          <p>The owner opens and closes sessions. The agent only signs usage vouchers. This page does not invent usage.</p>
        </EmptyState>
      </div>
    );
  }

  const deadlineSeconds = deadline ? Math.floor(new Date(deadline).getTime() / 1000) : 0;

  return (
    <div className="space-y-6">
      <PageIntro title="Metered sessions">
        Opening a session locks USDC and counts that budget against the current UTC-day caps. Settlement pays only the
        increase in a signed cumulative voucher. Closing the session releases whatever was not settled.
      </PageIntro>
      <Surface className="space-y-4">
        <Field label="Workspace">
          <TextInput className="font-mono" value={workspace} onChange={(event) => setWorkspace(event.target.value)} />
        </Field>
        <Field label="Session label">
          <TextInput value={sessionLabel} onChange={(event) => setSessionLabel(event.target.value)} />
        </Field>
        <p className="break-all font-mono text-xs text-muted">Session id {sessionId}</p>
        {row && row[0] !== "0x0000000000000000000000000000000000000000" ? (
          <p className="text-sm text-muted">
            {open ? "Open" : "Closed"}. Budget {formatUsdc(row[2])}. Settled {formatUsdc(row[3])}. Remaining{" "}
            {formatUsdc(row[2] - row[3])}. Provider {row[1]}. Agent {row[0]}. Last sequence {row[7].toString()}.
          </p>
        ) : (
          <p className="text-sm text-muted">No session is stored under this id yet.</p>
        )}
        <Field label="Agent">
          <TextInput className="font-mono" value={agent} onChange={(event) => setAgent(event.target.value)} />
        </Field>
        <Field label="Provider">
          <TextInput className="font-mono" value={provider} onChange={(event) => setProvider(event.target.value)} />
        </Field>
        <Field label="Budget (USDC)">
          <TextInput value={budget} onChange={(event) => setBudget(event.target.value)} />
        </Field>
        <Field label="Deadline">
          <TextInput type="datetime-local" value={deadline} onChange={(event) => setDeadline(event.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-3">
          <WriteButton
            disabledReason={!address ? "Enter a workspace." : writer.writeDisabledReason}
            onClick={() =>
              address &&
              writer.send(
                address,
                encodeFunctionData({
                  abi: workspaceAbi,
                  functionName: "openSession",
                  args: [sessionId, agent as Address, provider as Address, parseUsdc(budget), BigInt(deadlineSeconds), sessionId as Hex],
                }),
              )
            }
          >
            Open session
          </WriteButton>
          <WriteButton
            tone="ghost"
            disabledReason={!address ? "Enter a workspace." : writer.writeDisabledReason}
            onClick={() =>
              address &&
              writer.send(address, encodeFunctionData({ abi: workspaceAbi, functionName: "closeSession", args: [sessionId] }))
            }
          >
            Close and release
          </WriteButton>
        </div>
        <TxStatus state={writer.state} />
      </Surface>
    </div>
  );
}
