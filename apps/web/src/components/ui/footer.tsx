import type { ComponentProps, ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

import { Logo } from "@/components/brand/Logo";
import { SkewFace } from "@/components/ui/gradient-card-showcase";
import { appConfig } from "@/lib/config";
import { cn } from "@/lib/utils";

const tones = [
  ["#0b1c38", "#60a5fa"],
  ["#10243f", "#2563eb"],
  ["#07111f", "#93c5fd"],
  ["#0d1b30", "#38bdf8"],
] as const;

type FooterLink = {
  title: string;
  href: string;
};

type FooterColumn = {
  action: FooterLink;
  title: string;
  links: FooterLink[];
};

const columns: FooterColumn[] = [
  {
    action: { title: "Launch App", href: "/app" },
    title: "Product",
    links: [
      { title: "Overview", href: "/app" },
      { title: "Vaults", href: "/app/vaults" },
      { title: "Policies", href: "/app/policies" },
      { title: "Agents", href: "/app/agents" },
      { title: "Activity", href: "/app/activity" },
      { title: "Pay per API", href: "/app/pay" },
    ],
  },
  {
    action: { title: "Documentation", href: "/app/docs" },
    title: "Learn",
    links: [
      { title: "Product", href: "#product" },
      { title: "How it works", href: "#how" },
      { title: "Security", href: "#security" },
      { title: "Developers", href: "#developers" },
    ],
  },
  {
    action: { title: "Arc docs", href: "https://docs.arc.io" },
    title: "Network",
    links: [
      { title: "Explorer", href: appConfig.explorerUrl },
      { title: "Arc mainnet", href: "https://docs.arc.io" },
    ],
  },
  {
    action: { title: "SDKs", href: "/sdks" },
    title: "Developers",
    links: [
      { title: "Contract interface", href: "/app/docs" },
      { title: "SDK page", href: "/sdks" },
      { title: "Create a vault", href: "/app/vaults" },
      { title: "Authorize an agent", href: "/app/agents" },
    ],
  },
];

export function Footer({ className, ...props }: ComponentProps<"footer">) {
  return (
    <footer
      className={cn(
        "site-footer border-t border-white/10 text-foreground",
        className,
      )}
      {...props}
    >
      <div className="relative mx-auto grid max-w-6xl gap-6 px-6 py-12 sm:grid-cols-2 xl:grid-cols-4">
        {columns.map((column, index) => (
          <SkewFace
            key={column.title}
            compact
            stable
            gradientFrom={tones[index]![0]}
            gradientTo={tones[index]![1]}
          >
            <SocialCard title={column.action.title} href={column.action.href} />
            <LinksGroup title={column.title} links={column.links} />
          </SkewFace>
        ))}
      </div>
      <div className="border-t border-white/10 px-6 py-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <img src="/arc-mark.png" alt="" className="h-10 w-10 rounded-md object-cover" />
              <Logo />
            </div>
            <p className="mt-3 max-w-sm text-sm text-muted-foreground">
              Live on Arc mainnet. Autonomous agents. Human authority. On-chain enforcement.
            </p>
          </div>
          <p className="max-w-xl text-xs leading-5 text-muted-foreground">
            {appConfig.chainId === 5042 && appConfig.factory
              ? "The vault factory in this build is on Arc mainnet. A payment still needs an owner-funded vault and an authorized agent."
              : "Smart contracts enforce the configured limits. The interface does not guarantee a payment."}{" "}
            Chain {appConfig.chainId}. USDC {appConfig.usdc}.
            {appConfig.factory ? "" : " Factory not deployed."}
          </p>
        </div>
        <p className="mx-auto mt-4 max-w-6xl text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Orbit. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

function LinksGroup({ title, links }: { title: string; links: FooterLink[] }) {
  return (
    <div className="p-2">
      <h3 className="mt-2 mb-4 text-xs font-medium tracking-wider text-foreground/75 uppercase">{title}</h3>
      <ul>
        {links.map((link) => (
          <li key={link.title}>
            <FooterAnchor href={link.href} className="text-xs text-muted-foreground no-underline hover:text-foreground">
              {link.title}
            </FooterAnchor>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SocialCard({ title, href }: FooterLink) {
  return (
    <FooterAnchor
      href={href}
      className="flex items-center justify-between border-t border-b border-white/10 p-2 text-sm text-foreground no-underline hover:bg-white/[0.06] md:border-t-0"
    >
      <span className="font-medium">{title}</span>
      <ArrowRight className="h-4 w-4" />
    </FooterAnchor>
  );
}

function FooterAnchor({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  if (href.startsWith("http")) {
    return (
      <a href={href} className={className} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  }
  if (href.startsWith("#")) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link to={href} className={className}>
      {children}
    </Link>
  );
}
