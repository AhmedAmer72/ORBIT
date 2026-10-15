"use client";

import { useState } from "react";

const panels = [
  {
    title: "Vault limits",
    body: "An owner names a vault, sets a per-payment cap and a UTC-day spending cap, and keeps USDC inside the vault address.",
  },
  {
    title: "Approved recipients",
    body: "Payments can only reach addresses the owner has approved. An empty allowlist rejects every payment.",
  },
  {
    title: "Agent authorization",
    body: "One agent address can call executePayment until the owner revokes it or the expiry time passes.",
  },
];

export function PreviewCarousel() {
  const [index, setIndex] = useState(0);
  const panel = panels[index]!;

  function move(next: number) {
    setIndex((next + panels.length) % panels.length);
  }

  return (
    <div
      className="rounded-card border border-line bg-panel2 p-6"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") move(index + 1);
        if (event.key === "ArrowLeft") move(index - 1);
      }}
    >
      <p className="text-xs uppercase tracking-[0.16em] text-warn">Illustrative product preview</p>
      <h3 className="mt-3 text-2xl">{panel.title}</h3>
      <p className="mt-3 max-w-xl text-sm leading-6 text-muted">{panel.body}</p>
      <p className="mt-4 font-mono text-xs text-sky">Example figures are not live balances.</p>
      <div className="mt-6 flex items-center gap-3">
        <button type="button" className="rounded-full border border-line px-3 py-1.5 text-sm" onClick={() => move(index - 1)}>
          Previous
        </button>
        <button type="button" className="rounded-full border border-line px-3 py-1.5 text-sm" onClick={() => move(index + 1)}>
          Next
        </button>
        <span className="text-xs text-muted">
          {index + 1} / {panels.length}
        </span>
      </div>
    </div>
  );
}
