"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Github, Logo } from "./icons";

export const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL ?? "https://github.com/adeelfalaksher900-creator/stitchproof";

const NAV: { href: string; label: string; short?: string }[] = [
  { href: "/proof", label: "Proof" },
  { href: "/patterns", label: "My patterns", short: "Patterns" },
];

export function TopBar() {
  const path = usePathname();
  if (path?.startsWith("/knit/")) return null;
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-paper/80 backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-3 px-4 sm:gap-6 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 rounded-lg" aria-label="Stitchproof home">
          <Logo size={26} />
          <span className="text-[15px] font-semibold tracking-[-0.02em]">Stitchproof</span>
        </Link>
        <nav className="flex items-center gap-1" aria-label="Main">
          {NAV.map((n) => {
            const active = path === n.href || path?.startsWith(`${n.href}/`);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-full px-3 py-1.5 text-[13.5px] font-medium transition-colors ${
                  active ? "bg-paper-2 text-ink" : "text-ink-2 hover:text-ink"
                }`}
              >
                {n.short ? (
                  <>
                    <span className="sm:hidden">{n.short}</span>
                    <span className="hidden sm:inline">{n.label}</span>
                  </>
                ) : (
                  n.label
                )}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="btn btn-ghost btn-sm hidden sm:inline-flex"
            aria-label="Source code on GitHub"
          >
            <Github size={16} />
            <span>Source</span>
          </a>
        </div>
      </div>
    </header>
  );
}
