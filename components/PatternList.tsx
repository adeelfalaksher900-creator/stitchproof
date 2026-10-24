"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadAll, remove, type SavedPattern } from "@/lib/store";
import { Alert, Arrow, Check, Doc, Question, Trash } from "./icons";

function ago(t: number): string {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(t).toLocaleDateString();
}

export function PatternList() {
  const [items, setItems] = useState<SavedPattern[] | null>(null);
  useEffect(() => setItems(loadAll()), []);

  if (items === null) return <div className="h-40" />;
  if (items.length === 0) {
    return (
      <div className="card px-6 py-14 text-center">
        <div className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-paper-2 text-ink-2">
          <Doc size={22} />
        </div>
        <h2 className="text-[19px] font-semibold tracking-[-0.02em]">No patterns yet</h2>
        <p className="mx-auto mt-2 max-w-sm text-[14px] text-ink-2">Every pattern you proof is saved here, in this browser, along with the row you&apos;re on.</p>
        <Link href="/proof" className="btn btn-primary mt-6">Proof a pattern <Arrow size={16} /></Link>
      </div>
    );
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {items.map((p) => (
        <li key={p.id} className="card rise flex flex-col p-5">
          <div className="flex items-start gap-3">
            <Verdict v={p.verdict} />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[16px] font-semibold tracking-[-0.015em]">{p.title}</h2>
              <p className="mt-0.5 text-[12.5px] text-ink-3">
                {p.sizes.length > 1 ? `${p.sizes.length} sizes` : p.sizes[0]} · {p.readBy && p.readBy !== "offline" ? "read with AI" : "read offline"} · {ago(p.updatedAt)}
              </p>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm -mr-2 -mt-1 px-2"
              aria-label={`Delete ${p.title}`}
              onClick={() => {
                if (window.confirm(`Delete “${p.title}” from this browser?`)) {
                  remove(p.id);
                  setItems(loadAll());
                }
              }}
            >
              <Trash size={16} />
            </button>
          </div>
          <div className="mt-5 flex items-center gap-2">
            <Link href={`/proof?id=${p.id}`} className="btn btn-secondary btn-sm">Open proof</Link>
            <Link href={`/knit/${p.id}`} className="btn btn-primary btn-sm">
              {p.row > 0 ? "Continue knitting" : "Start knitting"} <Arrow size={14} />
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Verdict({ v }: { v: string }) {
  const map = {
    proven: ["bg-ok-soft text-ok", <Check key="c" size={16} strokeWidth={2.4} />, "Proven"],
    issues: ["bg-bad-soft text-bad", <Alert key="a" size={16} />, "Has errata"],
    partial: ["bg-warn-soft text-warn", <Question key="q" size={16} />, "Partly verified"],
  } as const;
  const [cls, icon, label] = map[v as keyof typeof map] ?? map.partial;
  return (
    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${cls}`} title={label} aria-label={label}>
      {icon}
    </span>
  );
}
