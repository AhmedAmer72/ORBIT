import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import { Activity, Bell, BookOpen, Bot, Layers, LayoutDashboard, Menu, Receipt, Search, Shield, Timer, Vault, X } from "lucide-react";
import { ConnectBar } from "@/components/ConnectBar";
import { Logo } from "@/components/brand/Logo";
import { NetworkGate } from "@/components/NetworkGate";
import { configuredChain } from "@/lib/wagmi";

const groups = [
  {
    label: "Product",
    links: [
      { href: "/app", label: "Overview", icon: LayoutDashboard },
      { href: "/app/vaults", label: "Vaults", icon: Vault },
      { href: "/app/policies", label: "Policies", icon: Shield },
      { href: "/app/agents", label: "Agents", icon: Bot },
      { href: "/app/activity", label: "Activity", icon: Activity },
      { href: "/app/pay", label: "Pay per API", icon: Receipt },
      { href: "/app/workspaces", label: "Workspaces", icon: Layers },
      { href: "/app/sessions", label: "Sessions", icon: Timer },
      { href: "/app/guardian", label: "Guardian", icon: Bell },
    ],
  },
  {
    label: "Resources",
    links: [{ href: "/app/docs", label: "Docs", icon: BookOpen }],
  },
];

const links = groups.flatMap((group) => group.links);

function isActive(pathname: string, href: string) {
  return href === "/app" ? pathname === "/app" : pathname.startsWith(href);
}

export function AppShell() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const current = links.find((link) => isActive(pathname, link.href));
  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return [];
    return links.filter((link) => link.label.toLowerCase().includes(term));
  }, [query]);

  const nav = (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="px-3 text-[11px] font-semibold tracking-[0.16em] text-muted uppercase">{group.label}</p>
          <nav className="mt-2 grid gap-1" aria-label={group.label}>
            {group.links.map((link) => {
              const Icon = link.icon;
              const active = isActive(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  to={link.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setMobileOpen(false)}
                  className={`side-link ${active ? "side-link-active" : ""}`}
                >
                  <span className="side-icon">
                    <Icon size={15} aria-hidden />
                  </span>
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-ink md:grid md:grid-cols-[280px_1fr]">
      <aside className="sticky top-0 hidden h-screen p-3 md:flex">
        <div className="side-panel flex h-full w-full flex-col px-3 py-4">
          <div className="px-2">
            <Logo />
          </div>
          <div className="mt-6 flex-1 overflow-y-auto">{nav}</div>
          <p className="side-foot">
            <span className="side-dot" aria-hidden />
            {configuredChain.name}
            <span className="text-muted">· {configuredChain.id}</span>
          </p>
        </div>
      </aside>
      <div className="dashboard-stage min-w-0">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-white/10 bg-ink/70 px-4 py-3 backdrop-blur-md md:px-6">
          <button type="button" className="md:hidden" aria-label="Open navigation" onClick={() => setMobileOpen(true)}>
            <Menu size={18} />
          </button>
          <form
            className="relative min-w-0 flex-1"
            onSubmit={(event) => {
              event.preventDefault();
              const next = matches[0];
              if (!next) return;
              navigate(next.href);
              setQuery("");
            }}
          >
            <Search className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" size={15} aria-hidden />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search sections"
              aria-label="Search sections"
              className="w-full rounded-full border border-line bg-ink py-2 pr-3 pl-9 text-sm text-paper outline-none placeholder:text-muted focus:border-accent"
            />
            {matches.length ? (
              <ul className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-line bg-panel shadow-lift">
                {matches.map((link) => (
                  <li key={link.href}>
                    <Link to={link.href} className="block px-4 py-2 text-sm text-paper no-underline hover:bg-white/5" onClick={() => setQuery("")}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </form>
          <div className="hidden min-w-0 shrink-0 lg:block">
            <ConnectBar />
          </div>
        </header>
        {mobileOpen ? (
          <div className="fixed inset-0 z-40 bg-ink/75 p-3 backdrop-blur-sm md:hidden">
            <div className="side-panel flex h-full flex-col p-4">
              <div className="mb-4 flex items-center justify-between">
                <Logo href="/app" />
                <button type="button" className="btn btn-ghost btn-chip" aria-label="Close navigation" onClick={() => setMobileOpen(false)}>
                  <X size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">{nav}</div>
              <div className="mt-4">
                <ConnectBar />
              </div>
              <p className="side-foot">
                <span className="side-dot" aria-hidden />
                {configuredChain.name}
                <span className="text-muted">· {configuredChain.id}</span>
              </p>
            </div>
          </div>
        ) : null}
        <div className="px-4 py-3 lg:hidden">
          <ConnectBar />
        </div>
        <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
          <p className="mb-4 text-xs text-muted">
            <Link to="/" className="no-underline">
              Orbit
            </Link>
            {current ? ` / ${current.label}` : ""}
          </p>
          <NetworkGate />
          <Outlet />
        </div>
      </div>
    </div>
  );
}
