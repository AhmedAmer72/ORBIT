"use client";

import { explorerTxUrl, isRpcRateLimit, RPC_RATE_LIMIT_MESSAGE } from "@arcbond/sdk";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { usePublicClient } from "wagmi";

import { ConfigMissing } from "@/components/ConfigMissing";
import { EmptyState } from "@/components/EmptyState";
import { PageIntro, Surface } from "@/components/ui";
import { OpenVaultByAddress, VaultPicker } from "@/components/VaultPicker";
import { useActiveVault } from "@/hooks/useArcBond";
import { appConfig } from "@/lib/config";
import { MAX_LOG_BLOCK_SPAN } from "@/lib/log-ranges";
import { readVaultActivity } from "@/lib/vault-activity";
import { configuredChain } from "@/lib/wagmi";

export function ActivityClient() {
  const { vault, factoryConfigured } = useActiveVault();
  const publicClient = usePublicClient({ chainId: configuredChain.id });
  const [kind, setKind] = useState<"all" | "PaymentExecuted" | "Deposited" | "Withdrawn">("all");
  const [page, setPage] = useState(0);

  const history = useQuery({
    queryKey: ["activity", vault, appConfig.factoryDeployBlock?.toString()],
    enabled: Boolean(vault && publicClient),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: async () => {
      if (!vault || !publicClient) return { rows: [], truncated: false, error: undefined as string | undefined };
      if (appConfig.factoryDeployBlock === undefined) {
        return { rows: [], truncated: false, error: "Factory deploy block is not configured, so activity cannot bound the log query." };
      }
      try {
        const latest = await publicClient.getBlockNumber();
        const fromBlock = appConfig.factoryDeployBlock > latest ? latest : appConfig.factoryDeployBlock;
        const recent = latest - MAX_LOG_BLOCK_SPAN + 1n;
        const start = recent > fromBlock ? recent : fromBlock;
        const rows = await readVaultActivity(publicClient, vault, start, latest);
        return { rows, truncated: start > fromBlock, error: undefined };
      } catch (error) {
        return {
          rows: [],
          truncated: false,
          error: isRpcRateLimit(error) ? RPC_RATE_LIMIT_MESSAGE : error instanceof Error ? error.message : "History unavailable from this RPC.",
        };
      }
    },
  });

  const rows = useMemo(() => {
    const all = history.data?.rows ?? [];
    return kind === "all" ? all : all.filter((row) => row.type === kind);
  }, [history.data?.rows, kind]);
  const pageSize = 8;
  const visible = rows.slice(page * pageSize, page * pageSize + pageSize);

  if (!factoryConfigured) {
    return (
      <div className="space-y-6">
        <PageIntro title="Activity">Only events the RPC returns. Rejected calls leave no on-chain record.</PageIntro>
        <ConfigMissing />
      </div>
    );
  }
  if (!vault) {
    return (
      <div className="space-y-6">
        <PageIntro title="Activity">Successful vault events only.</PageIntro>
        <EmptyState title="No vault is open">
          <p>Activity lists events for one vault. Owners see vaults they created. An agent can paste the vault address the owner shared.</p>
          <OpenVaultByAddress />
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageIntro title="Activity">
        Successful vault events only. A reverted payment has no event. Local simulation failures stay on the page that
        submitted them.
      </PageIntro>
      <VaultPicker />
      {history.isLoading ? <p className="text-sm text-muted">Querying logs…</p> : null}
      {history.data?.truncated ? (
        <p className="text-sm text-muted">
          Showing the latest {Number(MAX_LOG_BLOCK_SPAN).toLocaleString()} blocks. The public Arc RPC rejects a wider
          log query.
        </p>
      ) : null}
      {history.data?.error ? (
        <EmptyState title="History unavailable">
          <p>{history.data.error}</p>
        </EmptyState>
      ) : null}
      {history.data && !history.data.error && history.data.rows.length === 0 ? (
        <EmptyState title="No events returned">
          <p>The RPC did not return PaymentExecuted, Deposited, or Withdrawn logs for this vault.</p>
        </EmptyState>
      ) : null}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter activity">
        {(["all", "PaymentExecuted", "Deposited", "Withdrawn"] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={`btn btn-chip ${kind === value ? "btn-solid" : "btn-ghost"}`}
            onClick={() => {
              setKind(value);
              setPage(0);
            }}
          >
            {value}
          </button>
        ))}
      </div>
      <ul className="space-y-3">
        {visible.map((row) => (
          <li key={`${row.hash}-${row.index}`}>
            <Surface>
              <p className="text-xs uppercase tracking-wide text-accent">{row.type}</p>
              <p className="mt-2 text-sm">{row.detail}</p>
              {row.hash ? (
                <a className="mt-2 inline-block font-mono text-xs" href={explorerTxUrl(appConfig.explorerUrl, row.hash)} target="_blank" rel="noreferrer">
                  {row.hash}
                </a>
              ) : null}
            </Surface>
          </li>
        ))}
      </ul>
      {rows.length > pageSize ? (
        <div className="flex items-center gap-3 text-sm">
          <button type="button" className="btn btn-ghost btn-chip" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>
            Previous
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-chip"
            disabled={(page + 1) * pageSize >= rows.length}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
