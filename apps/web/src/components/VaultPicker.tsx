"use client";

import { Link, useLocation } from "react-router-dom";

import { useAccount } from "wagmi";

import { useOwnedVaults, useSelectedVaultAddress } from "@/hooks/useArcBond";

export function VaultPicker() {
  const { pathname } = useLocation();
  const { address } = useAccount();
  const selected = useSelectedVaultAddress();
  const { data, isLoading, error } = useOwnedVaults();

  if (!address) return <p className="text-sm text-muted">Connect a wallet to read its vaults.</p>;
  if (isLoading) return <p className="text-sm text-muted">Reading vaults from the factory…</p>;
  if (error) return <p className="text-sm text-danger">Could not read factory.vaultsOf: {error.message}</p>;
  if (!data?.length) return <p className="text-sm text-muted">This wallet has no factory vaults yet.</p>;

  return (
    <div className="flex flex-wrap gap-2">
      {data.map((vault) => {
        const active = selected?.toLowerCase() === vault.toLowerCase();
        return (
          <Link
            key={vault}
            to={`${pathname}?vault=${vault}`}
            className={`rounded-full px-3 py-1.5 font-mono text-xs no-underline transition ${
              active
                ? "bg-accent text-ink shadow-[0_8px_24px_rgba(37,99,235,0.45)]"
                : "border border-sky/25 bg-panel2/80 text-muted shadow-[0_8px_18px_rgba(2,6,23,0.35)] hover:-translate-y-0.5 hover:border-sky hover:text-paper"
            }`}
          >
            {vault.slice(0, 8)}…{vault.slice(-4)}
          </Link>
        );
      })}
    </div>
  );
}
