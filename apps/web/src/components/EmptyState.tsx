import type { ReactNode } from "react";

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="float-card rounded-card border-dashed px-5 py-8 text-sm text-muted">
      <p className="font-semibold text-paper">{title}</p>
      <div className="mt-2 space-y-2 leading-6">{children}</div>
    </div>
  );
}
