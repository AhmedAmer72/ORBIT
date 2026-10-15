import { formatUsdc, vaultAbi, ZERO_ADDRESS } from "@arcbond/sdk";
import { Bot, Gauge, Shield, TriangleAlert, Vault } from "lucide-react";
import { Link } from "react-router-dom";
import { encodeFunctionData } from "viem";

import { useConfirm } from "@/components/AppDialog";
import { ConfigMissing } from "@/components/ConfigMissing";
import { TxStatus } from "@/components/TxStatus";
import { Surface } from "@/components/ui";
import { VaultPicker } from "@/components/VaultPicker";
import { WriteButton } from "@/components/WriteButton";
import { useActiveVault, vaultHref } from "@/hooks/useArcBond";
import { useTxWriter } from "@/hooks/useTx";
import { appConfig } from "@/lib/config";

export function OverviewClient() {
  const { vault, owned, state, factoryConfigured } = useActiveVault();
  const { send, state: tx, writeDisabledReason, address } = useTxWriter();
  const confirm = useConfirm();
  const snapshot = state.data;
  const isOwner = Boolean(address && snapshot && address.toLowerCase() === snapshot.owner.toLowerCase());
  const now = new Date();
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 18 ? "Good afternoon" : "Good evening";
  const who = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "operator";
  const spent = snapshot?.displayedSpent ?? 0n;
  const limit = snapshot?.periodLimit ?? 0n;
  const ratio = limit > 0n ? Number((spent * 100n) / limit) : 0;
  const expired = Boolean(snapshot && snapshot.expiresAt > 0n && BigInt(Math.floor(now.getTime() / 1000)) >= snapshot.expiresAt);
  const attention = [
    !factoryConfigured ? { title: "Factory is not configured", detail: "Deploy a factory before vault reads can succeed.", href: "/app/docs", tone: "Action" } : null,
    factoryConfigured && !address ? { title: "Wallet not connected", detail: "Connect the owner wallet to read vaults and send transactions.", href: "/app/vaults", tone: "Action" } : null,
    factoryConfigured && address && !owned.isLoading && !owned.data?.length
      ? {
          title: "No vault for this wallet",
          detail: "Owners create a vault. Agents open the vault address from the owner on the Agents page.",
          href: "/app/agents",
          tone: "Action",
        }
      : null,
    snapshot?.paused ? { title: "Spending is paused", detail: "executePayment reverts until the owner unpauses.", href: "/app/vaults", tone: "Paused" } : null,
    snapshot && snapshot.agent === ZERO_ADDRESS ? { title: "No agent authorized", detail: "Payments cannot be requested until one agent is set.", href: "/app/agents", tone: "Missing" } : null,
    expired ? { title: "Agent authorization expired", detail: "Set a new expiry before the agent can pay again.", href: "/app/agents", tone: "Expired" } : null,
    snapshot && (snapshot.maxPerPayment === 0n || snapshot.periodLimit === 0n)
      ? { title: "A spending cap is zero", detail: "Zero caps fail closed. Set both limits before funding an agent.", href: "/app/policies", tone: "Action" }
      : null,
  ].filter((item): item is { title: string; detail: string; href: string; tone: string } => Boolean(item));

  return (
    <div className="space-y-5">
      <div className="rise-in flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {greeting}, {who}
          </h1>
          <p className="mt-1 text-sm text-muted">
            Vault limits are enforced by the contract, not by this screen.
            {appConfig.chainId === 5042002
              ? " This build is Arc Testnet. No mainnet factory is configured."
              : appConfig.chainId === 5042
                ? " This build is Arc mainnet."
                : " This build uses the configured chain. Writes still require that chain and a factory address."}
          </p>
        </div>
        <p className="text-right text-sm text-muted">
          {now.toLocaleDateString(undefined, { weekday: "long", hour: "numeric", minute: "2-digit" })}
          <span className="mt-1 block">{now.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}</span>
        </p>
      </div>

      {!factoryConfigured ? <ConfigMissing /> : <VaultPicker />}
      {state.isLoading ? <p className="text-sm text-muted">Reading vault state…</p> : null}
      {state.error ? <p className="text-sm text-danger">{state.error.message}</p> : null}

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1.2fr_0.9fr]">
        <Surface delay={0.05}>
          <CardHeading icon={Vault} title="Vault balance" detail="USDC held by the selected vault." />
          <p className="stat-value mt-6 text-4xl font-semibold tracking-tight">{snapshot ? `${formatUsdc(snapshot.balance)}` : "—"}</p>
          <p className="text-sm text-muted">USDC · 6 decimals</p>
          <div className="mt-6 flex flex-wrap gap-2">
            <WriteButton
              disabledReason={!vault ? "Select a vault." : !isOwner ? "Only the vault owner can pause." : writeDisabledReason}
              onClick={() => vault && send(vault, encodeFunctionData({ abi: vaultAbi, functionName: snapshot?.paused ? "unpause" : "pause" }))}
            >
              {snapshot?.paused ? "Unpause" : "Pause spending"}
            </WriteButton>
            <Link to="/app/vaults" className="btn btn-ghost">
              Deposit
            </Link>
          </div>
        </Surface>

        <Surface delay={0.12}>
          <CardHeading icon={Gauge} title="UTC-day spending" detail="Resets at 00:00 UTC. This is not a rolling week." />
          <p className="stat-value mt-6 text-3xl font-semibold">{snapshot ? `${formatUsdc(spent)} / ${formatUsdc(limit)}` : "—"}</p>
          <p className="text-sm text-muted">USDC spent in the current period</p>
          <div className="mt-5 h-3 overflow-hidden rounded-full bg-ink shadow-[inset_0_0_0_1px_rgba(147,197,253,0.2)]" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(ratio, 100)} aria-label="Period spending">
            <div className="meter-fill h-full rounded-full" style={{ width: `${Math.min(ratio, 100)}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted">
            {!snapshot ? "No vault selected." : limit === 0n ? "No period cap is set." : `${Math.min(ratio, 100)}% of the period cap`}
          </p>
        </Surface>

        <Surface delay={0.18}>
          <CardHeading icon={TriangleAlert} title="Needs attention" detail="Derived from the selected vault. Empty means nothing is flagged." />
          <ul className="mt-4 space-y-3">
            {attention.length === 0 ? <li className="text-sm text-muted">No open items for the current vault.</li> : null}
            {attention.map((item) => (
              <li key={item.title} className="nested-card rounded-2xl p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="mt-1 text-xs leading-5 text-muted">{item.detail}</p>
                  </div>
                  <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] text-sky">{item.tone}</span>
                </div>
                <Link to={item.href} className="mt-2 inline-block text-xs">
                  Open
                </Link>
              </li>
            ))}
          </ul>
        </Surface>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Surface delay={0.24}>
          <CardHeading icon={Shield} title="Policy" detail="The values the contract will enforce." />
          <div className="mt-5 grid grid-cols-3 gap-3">
            <Pill label="Per payment" value={snapshot ? formatUsdc(snapshot.maxPerPayment) : "—"} />
            <Pill label="UTC day" value={snapshot ? formatUsdc(snapshot.periodLimit) : "—"} />
            <Pill label="Vaults" value={String(owned.data?.length ?? 0)} />
          </div>
          <Link to="/app/policies" className="btn btn-ghost mt-5">
            Edit policy
          </Link>
        </Surface>

        <Surface delay={0.3}>
          <CardHeading icon={Bot} title="Agent" />
          <p className="mt-4 break-all font-mono text-sm text-paper">
            {snapshot ? (snapshot.agent === ZERO_ADDRESS ? "No agent authorized" : snapshot.agent) : "Select a vault"}
          </p>
          <p className="mt-2 text-sm text-muted">
            {!snapshot ? "Connect a wallet and select a vault to read the agent." : snapshot.paused ? "Paused" : "The agent can request payment only inside the current policy."}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link to="/app/agents" className="btn btn-solid">
              Manage agent
            </Link>
            <WriteButton
              tone="ghost"
              disabledReason={!vault ? "Select a vault." : !isOwner ? "Only the vault owner can revoke." : writeDisabledReason}
              onClick={() => {
                if (!vault) return;
                void confirm({
                  title: "Revoke agent",
                  body: "Revoke the current agent? Pending payments from that address will fail.",
                  confirmLabel: "Revoke",
                  tone: "danger",
                }).then((accepted) => {
                  if (!accepted || !vault) return;
                  void send(vault, encodeFunctionData({ abi: vaultAbi, functionName: "revokeAgent" }));
                });
              }}
            >
              Revoke agent
            </WriteButton>
            <Link className="self-center text-sm" to={vaultHref("/app/activity", vault)}>
              Open activity
            </Link>
          </div>
        </Surface>
      </div>
      <TxStatus state={tx} />
    </div>
  );
}

function CardHeading({
  icon: Icon,
  title,
  detail,
}: {
  icon: typeof Vault;
  title: string;
  detail?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent/20 text-sky shadow-[0_8px_20px_rgba(37,99,235,0.25)]">
        <Icon size={18} aria-hidden />
      </span>
      <div>
        <p className="text-lg font-semibold">{title}</p>
        {detail ? <p className="mt-1 text-sm text-muted">{detail}</p> : null}
      </div>
    </div>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <div className="nested-card rounded-2xl px-3 py-4 text-center">
      <p className="stat-value text-lg font-semibold">{value}</p>
      <p className="mt-1 text-[11px] text-muted">{label}</p>
    </div>
  );
}
