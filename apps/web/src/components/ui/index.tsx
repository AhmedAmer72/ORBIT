import type { LucideIcon } from "lucide-react";
import type { InputHTMLAttributes, ReactNode } from "react";

export function SectionTitle({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      {eyebrow ? <p className="text-xs font-medium uppercase tracking-[0.22em] text-accent">{eyebrow}</p> : null}
      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-paper sm:text-4xl">
        {title} <span className="text-accent">✦</span>
      </h2>
      {children ? <div className="mt-3 text-sm leading-6 text-muted">{children}</div> : null}
    </div>
  );
}

export function PageIntro({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rise-in">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        {title} <span className="text-accent">✦</span>
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">{children}</p>
    </div>
  );
}

export function Surface({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <div className={`float-card rounded-card p-5 ${className}`} style={delay ? { animationDelay: `${delay}s` } : undefined}>
      {children}
    </div>
  );
}

export function IconBadge({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
      <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
    </span>
  );
}

export function CtaBand({ title, children, action }: { title: string; children: ReactNode; action: ReactNode }) {
  return (
    <div className="flex flex-col items-start justify-between gap-4 rounded-card bg-cobalt px-6 py-6 text-white sm:flex-row sm:items-center">
      <div>
        <p className="text-lg font-semibold">{title}</p>
        <p className="mt-1 max-w-xl text-sm text-white/80">{children}</p>
      </div>
      {action}
    </div>
  );
}

export const fieldClass =
  "mt-2 w-full rounded-xl border border-line bg-ink/80 px-3 py-2.5 text-sm text-paper outline-none transition focus:border-accent";

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm text-muted">
      {label}
      {children}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${fieldClass} ${props.className ?? ""}`} />;
}
