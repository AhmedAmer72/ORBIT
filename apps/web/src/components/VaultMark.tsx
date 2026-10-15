export function VaultMark() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-md" aria-hidden>
      <div className="absolute inset-6 rounded-full border border-accent/25" />
      <div className="absolute inset-14 rounded-full border border-dashed border-accent/30" />
      <div className="absolute left-1/2 top-1/2 flex h-36 w-36 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-3xl border border-accent/40 bg-panel2 shadow-lift">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">Vault</span>
        <span className="mt-2 text-sm font-semibold">USDC</span>
        <span className="mt-1 text-xs text-muted">policy locked</span>
      </div>
      <Node className="left-2 top-10" label="Owner" detail="sets rules" />
      <Node className="right-2 top-16" label="Agent" detail="requests pay" />
      <Node className="bottom-8 left-8" label="Allowlist" detail="recipients" />
      <Node className="bottom-6 right-6" label="Caps" detail="per tx / day" />
    </div>
  );
}

function Node({ className, label, detail }: { className: string; label: string; detail: string }) {
  return (
    <div className={`absolute rounded-2xl border border-line bg-ink/80 px-3 py-2 text-left shadow-lift ${className}`}>
      <p className="text-xs font-semibold text-paper">{label}</p>
      <p className="text-[11px] text-muted">{detail}</p>
    </div>
  );
}
