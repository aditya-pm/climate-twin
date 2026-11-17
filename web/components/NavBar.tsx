"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const LINKS = [
  { href: "/explore", label: "Twin Explorer" },
  { href: "/simulate", label: "Simulator" },
  { href: "/insights", label: "Insights" },
  { href: "/methodology", label: "Methodology" },
];

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id="lg-heat" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffd166" />
          <stop offset="0.5" stopColor="#ff6b35" />
          <stop offset="1" stopColor="#c03aa8" />
        </linearGradient>
        <linearGradient id="lg-cool" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a7f3d0" />
          <stop offset="1" stopColor="#3ee0c8" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="12" height="12" rx="3" fill="url(#lg-heat)" />
      <rect x="17" y="3" width="12" height="12" rx="3" fill="url(#lg-heat)" opacity="0.55" />
      <rect x="3" y="17" width="12" height="12" rx="3" fill="url(#lg-cool)" opacity="0.6" />
      <rect x="17" y="17" width="12" height="12" rx="3" fill="url(#lg-cool)" />
    </svg>
  );
}

export function NavBar() {
  const path = usePathname();
  const app = path !== "/";
  return (
    <header
      className={clsx(
        "fixed inset-x-0 top-0 z-50 flex justify-center px-3 sm:px-4",
        app ? "pt-3" : "pt-4",
      )}
    >
      <nav className="glass flex w-full max-w-[1400px] items-center gap-2 rounded-2xl py-2 pl-3 pr-2 sm:gap-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <Logo className="h-7 w-7" />
          <span className="font-display text-[17px] font-semibold tracking-tight">
            Climate<span className="text-fg-2">Twin</span>
          </span>
          <span className="hidden rounded-full border border-line-2 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-fg-2 md:inline">
            Chennai
          </span>
        </Link>
        <div className="scrollbar-thin -mx-1 flex flex-1 items-center gap-1 overflow-x-auto px-1">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={clsx(
                "whitespace-nowrap rounded-xl px-3 py-1.5 text-[13px] font-medium transition-colors",
                path === l.href ? "bg-white/10 text-fg" : "text-fg-2 hover:bg-white/5 hover:text-fg",
              )}
            >
              {l.label}
            </Link>
          ))}
        </div>
        <Link
          href="/simulate"
          className="hidden shrink-0 items-center gap-2 rounded-xl bg-gradient-to-r from-[#ff8a3d] to-[#ff4d6d] px-4 py-2 text-[13px] font-semibold text-black shadow-[0_8px_30px_-8px_rgba(255,107,53,0.6)] transition hover:brightness-110 sm:flex"
        >
          Run a scenario
        </Link>
      </nav>
    </header>
  );
}
