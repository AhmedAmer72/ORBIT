import { explorerTxUrl } from "@arcbond/sdk";

import { appConfig } from "@/lib/config";
import { configuredChain } from "@/lib/wagmi";
import type { TxState } from "@/lib/tx";

export function TxStatus({ state }: { state: TxState }) {
  if (state.kind === "idle") return null;

  const hash = "hash" in state ? state.hash : undefined;
  const message =
    state.kind === "simulating"
      ? "Simulating against the contract…"
      : state.kind === "pending"
        ? "Waiting for wallet signature…"
        : state.kind === "confirming"
          ? "Waiting for the receipt…"
          : state.kind === "success"
            ? `Confirmed on ${configuredChain.name}.`
            : state.kind === "reverted"
              ? "The transaction reverted. No vault state changed."
              : state.kind === "rejected"
                ? `Rejected: ${state.message}`
                : state.kind === "unsent"
                  ? `Not sent: ${state.message}`
                  : state.message;

  const tone =
    state.kind === "success"
      ? "border-ok/40 bg-ok/10 text-ok"
      : state.kind === "rejected" || state.kind === "reverted" || state.kind === "error" || state.kind === "unsent"
        ? "border-danger/40 bg-danger/10 text-danger"
        : "border-line bg-panel text-paper";

  return (
    <div className={`rise-in rounded-2xl border px-4 py-3 text-sm shadow-[0_16px_40px_rgba(2,6,23,0.4)] ${tone}`}>
      <p>{message}</p>
      {hash ? (
        <a className="mt-1 inline-block font-mono text-xs" href={explorerTxUrl(appConfig.explorerUrl, hash)} target="_blank" rel="noreferrer">
          {hash}
        </a>
      ) : null}
    </div>
  );
}
