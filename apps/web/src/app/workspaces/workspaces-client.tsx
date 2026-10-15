"use client";

import { erc20Abi, formatUsdc, parseUsdc, workspaceAbi, workspaceFactoryAbi } from "@arcbond/sdk";
import { useEffect, useState } from "react";
import { encodeFunctionData, isAddress, parseEventLogs, type Address } from "viem";
import { usePublicClient, useReadContract, useWalletClient } from "wagmi";

import { EmptyState } from "@/components/EmptyState";
import { TxStatus } from "@/components/TxStatus";
import { Field, PageIntro, Surface, TextInput } from "@/components/ui";
import { WriteButton } from "@/components/WriteButton";
import { useTxWriter } from "@/hooks/useTx";
import { appConfig } from "@/lib/config";
import { submitPreparedWrite, type TxState } from "@/lib/tx";
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
  const [notice, setNotice] = useState<string | null>(null);
  const [fund, setFund] = useState("1");
  const [funding, setFunding] = useState<TxState>({ kind: "idle" });
  const publicClient = usePublicClient({ chainId: configuredChain.id });
  const { data: walletClient } = useWalletClient();

  const workspace = (selected || addresses?.[0] || "") as Address | "";
  const recipientAddress = isAddress(recipient) ? recipient : undefined;
  const agentAddress = isAddress(agent) ? agent : undefined;
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
  const providerApproval = useReadContract({
    chainId: configuredChain.id,
    address: workspace || undefined,
    abi: workspaceAbi,
    functionName: "approvedRecipients",
    args: recipientAddress ? [recipientAddress] : undefined,
    query: { enabled: Boolean(workspace && recipientAddress) },
  });
  const agentConfig = useReadContract({
    chainId: configuredChain.id,
    address: workspace || undefined,
    abi: workspaceAbi,
    functionName: "agents",
    args: agentAddress ? [agentAddress] : undefined,
    query: { enabled: Boolean(workspace && agentAddress) },
  });

  useEffect(() => {
    if (!workspace) return;
    setName(readNames()[workspace.toLowerCase()] ?? "");
  }, [workspace]);

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
    setNotice(
      next
        ? `Workspace ${next} is created. This page stays open because setup is not finished. Deposit USDC, set a shared cap above zero, approve a provider, and authorize an agent before anyone can spend.`
        : "Workspace created. This page stays open. The new contract appears in the list after the factory read refreshes.",
    );
    await refetch();
  }

  async function refreshWorkspace() {
    await Promise.all([
      stats.refetch(),
      spent.refetch(),
      reserved.refetch(),
      cap.refetch(),
      providerApproval.refetch(),
      agentConfig.refetch(),
    ]);
  }

  async function sendWorkspace(data: ReturnType<typeof encodeFunctionData>) {
    if (!workspace) return;
    const result = await writer.send(workspace, data);
    if (result.kind === "success") await refreshWorkspace();
  }

  async function deposit() {
    if (!workspace || !writer.address || !publicClient || !walletClient) return;
    let parsed: bigint;
    try {
      parsed = parseUsdc(fund);
    } catch {
      setFunding({ kind: "error", message: "Enter a USDC amount using 6-decimal units, for example 1.25." });
      return;
    }
    setFunding({ kind: "simulating" });
    const approve = await submitPreparedWrite({
      publicClient,
      walletClient,
      account: writer.address,
      address: appConfig.usdc,
      data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [workspace, parsed] }),
    });
    if (approve.kind !== "success") {
      setFunding(approve);
      return;
    }
    const deposited = await submitPreparedWrite({
      publicClient,
      walletClient,
      account: writer.address,
      address: workspace,
      data: encodeFunctionData({ abi: workspaceAbi, functionName: "deposit", args: [parsed] }),
    });
    setFunding(deposited);
    if (deposited.kind === "success") await refreshWorkspace();
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
        Creating a workspace deploys an empty contract and keeps you on this page. The shared cap, the USDC balance, the
        provider allowlist, and each agent limit are what make it able to pay. A display name is saved only in this browser.
      </PageIntro>
      <WriteButton disabledReason={writer.writeDisabledReason} onClick={() => void createWorkspace()}>
        Create workspace
      </WriteButton>
      <TxStatus state={writer.state} />
      {notice ? <p className="rounded-2xl border border-ok/40 bg-ok/10 px-4 py-3 text-sm text-ok">{notice}</p> : null}
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
          <WorkspaceReadiness
            cap={cap.data}
            available={stats.data}
            provider={recipientAddress ? providerApproval.data : undefined}
            providerKnown={Boolean(recipientAddress)}
            agentActive={agentAddress && agentConfig.data ? agentConfig.data[0] : undefined}
            agentKnown={Boolean(agentAddress)}
          />
          <p className="text-sm text-muted">
            On-chain available {stats.data === undefined ? "…" : `${formatUsdc(stats.data)} USDC`}. Reserved{" "}
            {reserved.data === undefined ? "…" : formatUsdc(reserved.data)}. Spent this UTC day{" "}
            {spent.data === undefined ? "…" : formatUsdc(spent.data)} of {cap.data === undefined ? "…" : formatUsdc(cap.data)}.
          </p>
          <Field label="Deposit USDC">
            <TextInput value={fund} onChange={(event) => setFund(event.target.value)} />
          </Field>
          <WriteButton disabledReason={writer.writeDisabledReason} onClick={() => void deposit()}>
            Approve and deposit
          </WriteButton>
          <TxStatus state={funding} />
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
              void sendWorkspace(
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
              void sendWorkspace(
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
                void sendWorkspace(
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
                void sendWorkspace(encodeFunctionData({ abi: workspaceAbi, functionName: "revokeAgent", args: [agent as Address] }))
              }
            >
              Revoke agent
            </WriteButton>
            <WriteButton
              tone="ghost"
              disabledReason={writer.writeDisabledReason}
              onClick={() => void sendWorkspace(encodeFunctionData({ abi: workspaceAbi, functionName: "pause" }))}
            >
              Pause spending
            </WriteButton>
          </div>
        </Surface>
      ) : null}
    </div>
  );
}

function WorkspaceReadiness({
  cap,
  available,
  provider,
  providerKnown,
  agentActive,
  agentKnown,
}: {
  cap: bigint | undefined;
  available: bigint | undefined;
  provider: boolean | undefined;
  providerKnown: boolean;
  agentActive: boolean | undefined;
  agentKnown: boolean;
}) {
  const items = [
    {
      label: "Shared daily cap",
      state: cap === undefined ? "checking" : cap > 0n ? "ready" : "missing",
      detail:
        cap === undefined
          ? "Reading the cap from the contract."
          : cap > 0n
            ? `${formatUsdc(cap)} USDC can be spent per UTC day.`
            : "Set a cap below. Zero rejects every payment.",
    },
    {
      label: "USDC deposited",
      state: available === undefined ? "checking" : available > 0n ? "ready" : "missing",
      detail:
        available === undefined
          ? "Reading the balance."
          : available > 0n
            ? `${formatUsdc(available)} USDC is available to spend.`
            : "Balance is 0. Deposit USDC on this page before a payment or session can succeed.",
    },
    {
      label: "Provider allowlist",
      state: !providerKnown || provider === undefined ? (providerKnown ? "checking" : "missing") : provider ? "ready" : "missing",
      detail: !providerKnown
        ? "Enter a provider below and approve it. An empty allowlist rejects every payment."
        : provider
          ? "The provider in the field below is approved."
          : "The provider in the field below is not approved yet.",
    },
    {
      label: "Agent",
      state: !agentKnown || agentActive === undefined ? (agentKnown ? "checking" : "missing") : agentActive ? "ready" : "missing",
      detail: !agentKnown
        ? "Enter an agent below and authorize it. Until then this workspace cannot pay."
        : agentActive
          ? "The agent in the field below is authorized."
          : "The agent in the field below is not authorized yet.",
    },
  ] as const;

  return (
    <div className="rounded-2xl border border-line bg-ink/40 p-4">
      <p className="text-sm font-medium text-paper">Setup stays on this page</p>
      <p className="mt-1 text-sm text-muted">
        A confirmed create does not fund this contract or authorize anyone. Spending stays closed until every line says ready.
      </p>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item.label} className="text-sm">
            <span className={item.state === "ready" ? "text-ok" : item.state === "missing" ? "text-danger" : "text-muted"}>
              {item.state === "ready" ? "Ready" : item.state === "missing" ? "Missing" : "Checking"}
            </span>
            <span className="text-paper"> · {item.label}. </span>
            <span className="text-muted">{item.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
