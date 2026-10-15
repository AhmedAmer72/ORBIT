"use client";

import { useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { isAddress } from "viem";
import { useAccount } from "wagmi";

import { Field, TextInput } from "@/components/ui";
import { useOwnedVaults, useSelectedVaultAddress } from "@/hooks/useArcBond";

export function OpenVaultByAddress() {
  const [params, setParams] = useSearchParams();
  const [value, setValue] = useState("");
  const ready = isAddress(value);

  return (
    <form
      className="mt-4 space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready) return;
        const next = new URLSearchParams(params);
        next.set("vault", value);
        setParams(next);
      }}
    >
      <Field label="Vault address">
        <TextInput
          className="font-mono"
          value={value}
          placeholder="0x"
          spellCheck={false}
          onChange={(event) => setValue(event.target.value.trim())}
        />
      </Field>
      <button type="submit" className="btn btn-solid" disabled={!ready}>
        Open vault
      </button>
      <p className="text-sm text-muted">
        {ready
          ? "This opens that vault for the connected wallet. It does not change the owner or the agent."
          : "Open vault stays off until this is the full vault contract address from the owner, not a wallet address."}
      </p>
    </form>
  );
}

export function VaultPicker() {
  const { pathname } = useLocation();
  const { address } = useAccount();
  const selected = useSelectedVaultAddress();
  const { data, isLoading, error } = useOwnedVaults();

  if (!address) return <p className="text-sm text-muted">Connect a wallet to read its vaults.</p>;
  if (isLoading) return <p className="text-sm text-muted">Reading vaults from the factory…</p>;
  if (error) return <p className="text-sm text-danger">Could not read factory.vaultsOf: {error.message}</p>;
  if (!data?.length) {
    return (
      <p className="text-sm text-muted">
        This wallet has not created a vault, and no authorization for it was found in the latest 10,000 blocks. Paste the
        vault address if this wallet is the agent.
      </p>
    );
  }

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
