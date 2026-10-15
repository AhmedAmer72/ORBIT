"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { erc20Abi, formatUsdc } from "@arcbond/sdk";
import { useState } from "react";
import type { Address } from "viem";
import { useAccount, useConnect, useDisconnect, useReadContract } from "wagmi";

import { appConfig } from "@/lib/config";
import { configuredChain, wagmiConfig } from "@/lib/wagmi";

export function ConnectBar() {
  if (appConfig.privyAppId) return <PrivyConnectBar />;
  return <InjectedConnectBar />;
}

function PrivyConnectBar() {
  const { ready, authenticated, login, logout, error } = usePrivy();
  const { wallets } = useWallets();
  const { address, chainId, connector } = useAccount();
  const { disconnectAsync } = useDisconnect();
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string>();
  const balance = useUsdcBalance(address);

  async function onDisconnect() {
    setDisconnecting(true);
    setDisconnectError(undefined);
    try {
      if (connector) {
        await wagmiConfig.storage?.setItem("recentConnectorId", connector.id);
        await wagmiConfig.storage?.setItem(`${connector.id}.disconnected`, true);
      }
      await disconnectAsync().catch(() => undefined);
      for (const wallet of wallets) {
        try {
          wallet.disconnect();
        } catch {
          // MetaMask and some other injected wallets cannot revoke a site from the page.
        }
      }
      await logout();
    } catch (err) {
      setDisconnectError(err instanceof Error ? err.message : "Could not disconnect the wallet.");
    } finally {
      setDisconnecting(false);
    }
  }

  if (!ready) {
    return <span className="text-sm text-muted">Loading wallet…</span>;
  }

  return (
    <WalletStatus
      address={address}
      sessionOpen={authenticated && !address}
      chainId={chainId}
      balance={balance}
      error={disconnectError ?? error?.message}
      disconnectDisabled={disconnecting}
      pendingLabel="Connect wallet"
      onConnect={() => login()}
      onDisconnect={() => void onDisconnect()}
    />
  );
}

function InjectedConnectBar() {
  const { address, isConnected, chainId } = useAccount();
  const { connectors, connect, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const balance = useUsdcBalance(address);
  const injected = connectors.find((connector) => connector.id === "injected") ?? connectors[0];

  if (isConnected && !address) {
    return <span className="text-sm text-muted">Connecting wallet…</span>;
  }

  return (
    <WalletStatus
      address={address}
      chainId={chainId}
      balance={balance}
      error={error?.message}
      connectDisabled={!injected || isPending}
      pendingLabel={isPending ? "Connecting…" : injected ? "Connect wallet" : "No injected wallet"}
      onConnect={() => injected && connect({ connector: injected, chainId: configuredChain.id })}
      onDisconnect={() => disconnect()}
    />
  );
}

function useUsdcBalance(address: Address | undefined) {
  const { data } = useReadContract({
    chainId: configuredChain.id,
    address: appConfig.usdc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  });
  return data;
}

function WalletStatus({
  address,
  sessionOpen = false,
  chainId,
  balance,
  error,
  connectDisabled,
  disconnectDisabled,
  pendingLabel,
  onConnect,
  onDisconnect,
}: {
  address: Address | undefined;
  sessionOpen?: boolean;
  chainId: number | undefined;
  balance: bigint | undefined;
  error?: string;
  connectDisabled?: boolean;
  disconnectDisabled?: boolean;
  pendingLabel: string;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const linked = Boolean(address) || sessionOpen;
  const balanceLabel = balance === undefined ? "Reading USDC…" : `${formatUsdc(balance)} USDC`;

  return (
    <div className="flex min-w-0 items-center gap-2 text-sm">
      {linked ? (
        <>
          <span
            className="truncate rounded-full border border-line bg-panel px-3 py-1 font-mono text-xs text-muted"
            title={
              address
                ? `${address} · ${balanceLabel} on ${configuredChain.name} · chain ${chainId ?? "unknown"}`
                : "Wallet session is still open"
            }
          >
            {address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Wallet session"}
          </span>
          <span className="hidden text-paper xl:inline">
            {address ? balanceLabel : "Connecting wallet…"}
            <span className="text-muted"> on {configuredChain.name}</span>
          </span>
          <button type="button" className="btn btn-ghost btn-chip shrink-0" disabled={disconnectDisabled} onClick={onDisconnect}>
            {disconnectDisabled ? "Disconnecting…" : "Disconnect"}
          </button>
        </>
      ) : (
        <button
          type="button"
          className="btn btn-solid"
          disabled={connectDisabled}
          onClick={onConnect}
        >
          {pendingLabel}
        </button>
      )}
      {error ? <span className="text-danger">{error}</span> : null}
    </div>
  );
}
