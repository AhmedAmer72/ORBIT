"use client";

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Logo } from "@/components/brand/Logo";
import GradientButton from "@/components/ui/button-1";

const links = [
  { href: "/#product", label: "Product" },
  { href: "/#how", label: "How It Works" },
  { href: "/#security", label: "Security" },
  { href: "/#developers", label: "Developers" },
];
const pages = [
  { to: "/sdks", label: "SDKs" },
  { to: "/app/docs", label: "Documentation" },
];

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 border-b transition ${
        scrolled ? "border-line bg-ink/90 backdrop-blur-md" : "border-transparent bg-transparent"
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
        <Logo />
        <nav className="hidden items-center gap-6 text-sm text-muted md:flex" aria-label="Primary">
          {links.map((link) => (
            <a key={link.href} href={link.href} className="no-underline hover:text-paper">
              {link.label}
            </a>
          ))}
          {pages.map((page) => (
            <Link key={page.to} to={page.to} className="no-underline hover:text-paper">
              {page.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <GradientButton to="/app" width="140px" height="44px">
            Launch App
          </GradientButton>
          <button
            type="button"
            className="rounded-full border border-line px-3 py-2 text-sm md:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((value) => !value)}
          >
            Menu
          </button>
        </div>
      </div>
      {open ? (
        <nav id="mobile-nav" className="grid gap-2 border-t border-line bg-ink px-5 py-4 text-sm md:hidden" aria-label="Mobile">
          {links.map((link) => (
            <a key={link.href} href={link.href} className="py-1 no-underline" onClick={() => setOpen(false)}>
              {link.label}
            </a>
          ))}
          {pages.map((page) => (
            <Link key={page.to} to={page.to} className="py-1 no-underline" onClick={() => setOpen(false)}>
              {page.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </header>
  );
}
