"use client";

import { useAccount, useSwitchChain } from "wagmi";

import { appConfig } from "@/lib/config";
import { configuredChain } from "@/lib/wagmi";

export function useOnConfiguredChain() {
  const { chainId, isConnected } = useAccount();
  return isConnected && chainId === appConfig.chainId;
}

export function NetworkGate() {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending, error } = useSwitchChain();

  if (!isConnected || chainId === appConfig.chainId) return null;

  return (
    <div className="rise-in rounded-card border border-danger/40 bg-danger/10 px-4 py-3 text-sm shadow-[0_16px_40px_rgba(2,6,23,0.4)]">
      <p className="text-danger">
        Connected to chain {chainId}. Writes are disabled until you switch to {configuredChain.name} ({appConfig.chainId}).
      </p>
      <button
        type="button"
        className="btn btn-solid mt-3"
        disabled={isPending}
        onClick={() => switchChain({ chainId: configuredChain.id })}
      >
        Switch to {configuredChain.name}
      </button>
      {error ? <p className="mt-2 text-danger">{error.message}</p> : null}
    </div>
  );
}
