"use client";

import { formatUsdc, parseUsdc, workspaceAbi, workspaceFactoryAbi } from "@arcbond/sdk";
import { useState } from "react";
import { encodeFunctionData, parseEventLogs, type Address } from "viem";
import { useReadContract } from "wagmi";

import { EmptyState } from "@/components/EmptyState";
import { TxStatus } from "@/components/TxStatus";
import { Field, PageIntro, Surface, TextInput } from "@/components/ui";
import { WriteButton } from "@/components/WriteButton";
import { useTxWriter } from "@/hooks/useTx";
import { appConfig } from "@/lib/config";
import { configuredChain } from "@/lib/wagmi";

const namesKey = "arcbond.workspaceNames";

function readNames(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(namesKey) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

export function WorkspacesClient() {
  const writer = useTxWriter();
  const factory = appConfig.workspaceFactory;
  const { data: addresses, refetch } = useReadContract({
    chainId: configuredChain.id,
    address: factory,
    abi: workspaceFactoryAbi,
    functionName: "workspacesOf",
    args: writer.address ? [writer.address] : undefined,
    query: { enabled: Boolean(factory && writer.address) },
  });
  const [selected, setSelected] = useState<Address | "">("");
  const [name, setName] = useState("");
  const [limit, setLimit] = useState("10");
  const [agent, setAgent] = useState("");
  const [maxPer, setMaxPer] = useState("1");
  const [agentLimit, setAgentLimit] = useState("5");
  const [expiry, setExpiry] = useState("");
  const [recipient, setRecipient] = useState("");
  const [names, setNames] = useState<Record<string, string>>(() => (typeof localStorage === "undefined" ? {} : readNames()));

  const workspace = (selected || addresses?.[0] || "") as Address | "";
  const stats = useReadContract({
    chainId: configuredChain.id,
    address: workspace || undefined,
    abi: workspaceAbi,
    functionName: "availableBalance",
    query: { enabled: Boolean(workspace) },
  });
  const spent = useReadContract({
    chainId: configuredChain.id,
    address: workspace || undefined,
    abi: workspaceAbi,
    functionName: "spentInPeriod",
    query: { enabled: Boolean(workspace) },
  });
  const reserved = useReadContract({
    chainId: configuredChain.id,
    address: workspace || undefined,
    abi: workspaceAbi,
    functionName: "reserved",
    query: { enabled: Boolean(workspace) },
  });
  const cap = useReadContract({
    chainId: configuredChain.id,
    address: workspace || undefined,
    abi: workspaceAbi,
    functionName: "workspacePeriodLimit",
    query: { enabled: Boolean(workspace) },
  });

  if (!factory) {
    return (
      <div className="space-y-6">
        <PageIntro title="Workspaces">Several agents share one on-chain USDC budget.</PageIntro>
        <EmptyState title="Workspace factory is not configured">
          <p>
            Set NEXT_PUBLIC_WORKSPACE_FACTORY_ADDRESS after the workspace factory is deployed. Version 2 vaults stay
            separate. Grouping them here would not enforce a shared cap.
          </p>
        </EmptyState>
      </div>
    );
  }

  const factoryAddress = factory;

  async function createWorkspace() {
    const result = await writer.send(factoryAddress, encodeFunctionData({ abi: workspaceFactoryAbi, functionName: "createWorkspace" }));
    if (result.kind !== "success") return;
    const created = parseEventLogs({ abi: workspaceFactoryAbi, logs: result.logs, eventName: "WorkspaceCreated" });
    const next = created[0]?.args.workspace;
    if (next) setSelected(next);
    await refetch();
  }

  function saveName() {
    if (!workspace) return;
    const next = { ...names, [workspace.toLowerCase()]: name };
    localStorage.setItem(namesKey, JSON.stringify(next));
    setNames(next);
  }

  const expirySeconds = expiry ? Math.floor(new Date(expiry).getTime() / 1000) : 0;

  return (
    <div className="space-y-6">
      <PageIntro title="Workspaces">
        The shared cap, reservations, and agent limits are stored on the workspace contract. A display name is saved only
        in this browser.
      </PageIntro>
      <WriteButton disabledReason={writer.writeDisabledReason} onClick={() => void createWorkspace()}>
        Create workspace
      </WriteButton>
      <TxStatus state={writer.state} />
      {addresses?.length ? (
        <Surface className="space-y-3">
          <Field label="Workspace">
            <select
              className="mt-2 w-full rounded-xl border border-line bg-ink/80 px-3 py-2.5 font-mono text-sm"
              value={workspace}
              onChange={(event) => setSelected(event.target.value as Address)}
            >
              {addresses.map((item) => (
                <option key={item} value={item}>
                  {names[item.toLowerCase()] ? `${names[item.toLowerCase()]} · ` : ""}
                  {item}
                </option>
              ))}
            </select>
          </Field>
          <p className="text-sm text-muted">
            On-chain available {stats.data === undefined ? "…" : `${formatUsdc(stats.data)} USDC`}. Reserved{" "}
            {reserved.data === undefined ? "…" : formatUsdc(reserved.data)}. Spent this UTC day{" "}
            {spent.data === undefined ? "…" : formatUsdc(spent.data)} of {cap.data === undefined ? "…" : formatUsdc(cap.data)}.
          </p>
          <Field label="Local name (not enforced on-chain)">
            <TextInput value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <button type="button" className="btn btn-ghost btn-chip" onClick={saveName}>
            Save name in this browser
          </button>
        </Surface>
      ) : (
        <EmptyState title="No workspaces for this wallet">
          <p>Create one, then set the shared cap and authorize agents.</p>
        </EmptyState>
      )}
      {workspace ? (
        <Surface className="space-y-4">
          <Field label="Shared UTC-day cap (USDC)">
            <TextInput value={limit} onChange={(event) => setLimit(event.target.value)} />
          </Field>
          <WriteButton
            disabledReason={writer.writeDisabledReason}
            onClick={() =>
              writer.send(
                workspace,
                encodeFunctionData({
                  abi: workspaceAbi,
                  functionName: "setWorkspacePeriodLimit",
                  args: [parseUsdc(limit)],
                }),
              )
            }
          >
            Save shared cap
          </WriteButton>
          <Field label="Provider to allow">
            <TextInput className="font-mono" value={recipient} onChange={(event) => setRecipient(event.target.value)} />
          </Field>
          <WriteButton
            disabledReason={writer.writeDisabledReason}
            onClick={() =>
              writer.send(
                workspace,
                encodeFunctionData({
                  abi: workspaceAbi,
                  functionName: "setRecipient",
                  args: [recipient as Address, true],
                }),
              )
            }
          >
            Approve provider
          </WriteButton>
          <Field label="Agent">
            <TextInput className="font-mono" value={agent} onChange={(event) => setAgent(event.target.value)} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Max per charge (USDC)">
              <TextInput value={maxPer} onChange={(event) => setMaxPer(event.target.value)} />
            </Field>
            <Field label="Agent UTC-day cap (USDC)">
              <TextInput value={agentLimit} onChange={(event) => setAgentLimit(event.target.value)} />
            </Field>
          </div>
          <Field label="Agent expires">
            <TextInput type="datetime-local" value={expiry} onChange={(event) => setExpiry(event.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-3">
            <WriteButton
              disabledReason={writer.writeDisabledReason}
              onClick={() =>
                writer.send(
                  workspace,
                  encodeFunctionData({
                    abi: workspaceAbi,
                    functionName: "authorizeAgent",
                    args: [agent as Address, parseUsdc(maxPer), parseUsdc(agentLimit), BigInt(expirySeconds)],
                  }),
                )
              }
            >
              Authorize agent
            </WriteButton>
            <WriteButton
              tone="ghost"
              disabledReason={writer.writeDisabledReason}
              onClick={() =>
                writer.send(workspace, encodeFunctionData({ abi: workspaceAbi, functionName: "revokeAgent", args: [agent as Address] }))
              }
            >
              Revoke agent
            </WriteButton>
            <WriteButton
              tone="ghost"
              disabledReason={writer.writeDisabledReason}
              onClick={() => writer.send(workspace, encodeFunctionData({ abi: workspaceAbi, functionName: "pause" }))}
            >
              Pause spending
            </WriteButton>
          </div>
        </Surface>
      ) : null}
    </div>
  );
}
