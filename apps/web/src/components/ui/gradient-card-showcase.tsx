import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export type SkewCard = {
  title: string;
  desc: string;
  gradientFrom: string;
  gradientTo: string;
  href: string;
};

export function SkewFace({
  title,
  desc,
  href,
  action = "Open",
  gradientFrom,
  gradientTo,
  kicker,
  compact = false,
  fill = false,
  stable = false,
  children,
}: {
  title?: string;
  desc?: string;
  href?: string;
  action?: string;
  gradientFrom: string;
  gradientTo: string;
  kicker?: string;
  compact?: boolean;
  fill?: boolean;
  stable?: boolean;
  children?: ReactNode;
}) {
  const featured = !compact && !fill;
  return (
    <div
      className={
        featured
          ? "group relative m-6 h-[400px] w-[320px] transition-all duration-500 sm:m-10"
          : fill
            ? "group relative h-full w-full"
            : "group relative h-full min-h-[210px] w-full"
      }
    >
      <span
        className="absolute top-0 left-[50px] h-full w-1/2 rounded-lg skew-x-[15deg] transition-all duration-500 group-hover:left-[20px] group-hover:w-[calc(100%-90px)] group-hover:skew-x-0"
        style={{ background: `linear-gradient(315deg, ${gradientFrom}, ${gradientTo})` }}
      />
      <span
        className="absolute top-0 left-[50px] h-full w-1/2 rounded-lg blur-[30px] skew-x-[15deg] transition-all duration-500 group-hover:left-[20px] group-hover:w-[calc(100%-90px)] group-hover:skew-x-0"
        style={{ background: `linear-gradient(315deg, ${gradientFrom}, ${gradientTo})` }}
      />
      <span className="pointer-events-none absolute inset-0 z-10">
        <span className="animate-blob absolute top-0 left-0 h-0 w-0 rounded-lg bg-white/10 opacity-0 shadow-[0_5px_15px_rgba(0,0,0,0.08)] backdrop-blur-[10px] transition-all duration-100 group-hover:top-[-50px] group-hover:left-[50px] group-hover:h-[100px] group-hover:w-[100px] group-hover:opacity-100" />
        <span className="animate-blob animation-delay-1000 absolute right-0 bottom-0 h-0 w-0 rounded-lg bg-white/10 opacity-0 shadow-[0_5px_15px_rgba(0,0,0,0.08)] backdrop-blur-[10px] transition-all duration-500 group-hover:right-[50px] group-hover:bottom-[-50px] group-hover:h-[100px] group-hover:w-[100px] group-hover:opacity-100" />
      </span>
      <div
        className={
          featured
            ? "relative z-20 left-0 rounded-lg bg-white/5 p-[20px_40px] text-white shadow-lg backdrop-blur-[10px] transition-all duration-500 group-hover:left-[-25px] group-hover:p-[60px_40px]"
            : `relative z-20 h-full rounded-lg bg-white/5 p-6 text-white shadow-lg backdrop-blur-[10px] transition-all duration-500 ${stable ? "" : "group-hover:-translate-x-2"}`
        }
      >
        {kicker ? <p className="font-mono text-xs text-sky">{kicker}</p> : null}
        {title ? <h3 className={`${kicker ? "mt-4" : ""} mb-2 text-2xl`}>{title}</h3> : null}
        {desc ? <p className="mb-4 text-base leading-relaxed text-white/80">{desc}</p> : null}
        {children}
        {href ? (
          <Link
            to={href}
            className="inline-block rounded bg-white px-3 py-2 text-sm font-bold text-black no-underline transition hover:bg-sky hover:text-ink"
          >
            {action}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

const cards: SkewCard[] = [
  {
    title: "Programmable vaults",
    desc: "Keep USDC in an isolated clone. The factory cannot move those funds, and the owner can withdraw even while spending is paused.",
    gradientFrom: "#1d4ed8",
    gradientTo: "#93c5fd",
    href: "/app/vaults",
  },
  {
    title: "Policy enforcement",
    desc: "Per-payment caps, the UTC-day total, the allowlist, expiry, and replay ids are checked inside the contract before USDC moves.",
    gradientFrom: "#2563eb",
    gradientTo: "#0d1b30",
    href: "/app/policies",
  },
  {
    title: "Verifiable activity",
    desc: "Deposits, withdrawals, and executed payments leave events. A hash is a success only after the receipt confirms it.",
    gradientFrom: "#3b82f6",
    gradientTo: "#34d399",
    href: "/app/activity",
  },
];

export default function SkewCards({ items = cards }: { items?: SkewCard[] }) {
  return (
    <div className="flex flex-wrap items-center justify-center py-8">
      {items.map(({ title, desc, gradientFrom, gradientTo, href }) => (
        <SkewFace key={title} title={title} desc={desc} href={href} gradientFrom={gradientFrom} gradientTo={gradientTo} />
      ))}
    </div>
  );
}
