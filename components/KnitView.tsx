"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { explainRow } from "@/lib/stitch/explain";
import { parsePattern } from "@/lib/stitch/parse";
import { proofProgram } from "@/lib/stitch/proof";
import { load, update, type SavedPattern } from "@/lib/store";
import { Alert, Arrow, ArrowLeft, Check, Logo } from "./icons";
import { StitchStrip } from "./StitchStrip";

export function KnitView({ id }: { id: string }) {
  const [saved, setSaved] = useState<SavedPattern | null | undefined>(undefined);
  const [row, setRow] = useState(0);
  const [sizeIndex, setSizeIndex] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const p = load(id) ?? null;
    setSaved(p);
    if (p) {
      setRow(p.row ?? 0);
      setSizeIndex(p.sizeIndex ?? 0);
    }
  }, [id]);

  const proof = useMemo(() => (saved ? proofProgram(parsePattern(saved.reading ?? saved.text)) : null), [saved]);
  const rows = proof?.program.rows ?? [];
  const total = rows.length;
  const safeRow = Math.min(row, Math.max(0, total - 1));
  const safeSize = Math.min(sizeIndex, Math.max(0, (proof?.program.sizes.length ?? 1) - 1));

  const go = useCallback(
    (next: number) => {
      if (!total) return;
      if (next >= total) {
        setDone(true);
        return;
      }
      const clamped = Math.max(0, Math.min(total - 1, next));
      setDone(false);
      setRow(clamped);
      update(id, { row: clamped });
    },
    [id, total],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /input|textarea|select/i.test(e.target.tagName)) return;
      if (e.key === "ArrowRight" || e.key === " " || e.key === "Enter") {
        e.preventDefault();
        go(safeRow + 1);
      } else if (e.key === "ArrowLeft" || e.key === "Backspace") {
        e.preventDefault();
        if (done) setDone(false);
        else go(safeRow - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, safeRow, done]);

  if (saved === undefined) return <div className="min-h-dvh" />;
  if (!saved || !proof || total === 0) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
        <Logo size={36} />
        <h1 className="mt-5 text-[22px] font-semibold tracking-[-0.02em]">This pattern isn&apos;t saved in this browser</h1>
        <p className="mt-2 text-[14.5px] text-ink-2">Patterns and your place in them are kept on this device only. Proof the pattern again to knit it here.</p>
        <Link href="/proof" className="btn btn-primary mt-6">Proof a pattern</Link>
      </div>
    );
  }

  const current = rows[safeRow];
  const result = proof.sizes[safeSize].rows[safeRow];
  const sizes = proof.program.sizes;
  const pct = done ? 100 : Math.round((safeRow / Math.max(1, total - 1)) * 100);
  const counted = rows.filter((r) => r.number !== null).length;
  const countedSoFar = rows.slice(0, safeRow + 1).filter((r) => r.number !== null).length;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[960px] items-center gap-3 px-4 sm:px-6">
          <Link href={`/proof?id=${id}`} className="btn btn-ghost btn-sm -ml-2" aria-label="Back to the proof">
            <ArrowLeft size={16} /> <span className="hidden sm:inline">Proof</span>
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-[14.5px] font-semibold tracking-[-0.01em]">{proof.program.title ?? saved.title}</h1>
          {sizes.length > 1 && (
            <label className="flex items-center gap-2 text-[12.5px] text-ink-3">
              <span className="hidden sm:inline">Size</span>
              <select
                value={safeSize}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setSizeIndex(v);
                  update(id, { sizeIndex: v });
                }}
                className="h-8 rounded-full border border-line-2 bg-surface px-3 text-[13px] font-medium text-ink"
              >
                {sizes.map((s, i) => (
                  <option key={s} value={i}>{s}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="h-[3px] bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Progress">
          <div className="h-full bg-accent transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
        </div>
      </header>

      <div className="mx-auto w-full max-w-[760px] flex-1 px-4 py-8 sm:px-6 sm:py-12">
        {done ? (
          <div className="card rise px-6 py-12 text-center sm:px-10">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-ok-soft text-ok">
              <Check size={26} strokeWidth={2.4} />
            </div>
            <h2 className="mt-5 text-[26px] font-semibold tracking-[-0.025em]">That&apos;s the last row.</h2>
            <p className="mt-2 text-[15px] text-ink-2">You worked through all {counted} {rows.some((r) => r.round) ? "rounds" : "rows"} of {proof.program.title ?? "this pattern"}.</p>
            <div className="mt-6 flex justify-center gap-2">
              <button type="button" className="btn btn-secondary" onClick={() => setDone(false)}>Back to last row</button>
              <Link href="/patterns" className="btn btn-primary">My patterns</Link>
            </div>
          </div>
        ) : (
          <article key={`${safeRow}-${safeSize}`} className="card rise overflow-hidden" aria-live="polite">
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-6 py-4 sm:px-8">
              <span className="text-[13px] font-semibold tracking-wide text-accent uppercase">{current.label}</span>
              {current.side && <span className="pill bg-paper-2 text-ink-2">{current.side === "RS" ? "Right side" : "Wrong side"}</span>}
              <span className="ml-auto text-[12.5px] text-ink-3 tnum">
                {current.number !== null ? `${countedSoFar} of ${counted}` : "Setup"}
              </span>
            </div>
            <div className="px-6 py-7 sm:px-8 sm:py-9">
              <p className="text-[22px] leading-[1.45] font-medium tracking-[-0.015em] text-ink sm:text-[26px]">
                {explainRow(current, safeSize, result)}
              </p>
              <p className="mono mt-5 rounded-xl bg-surface-2 px-4 py-3 text-[12.5px] leading-6 text-ink-2">
                <span className="text-ink-3">As written · </span>
                {current.source}
              </p>
              {result.strip.length > 0 && (
                <div className="mt-6">
                  <StitchStrip marks={result.strip} perLine={36} cell={14} label={`Stitches in ${current.label}`} />
                </div>
              )}
              {result.status === "issue" && (
                <div className="mt-6 flex gap-3 rounded-xl border border-bad/25 bg-bad-soft px-4 py-3 text-[13.5px] text-bad">
                  <Alert size={16} className="mt-0.5 shrink-0" />
                  <div>
                    {result.messages[0]?.text}{" "}
                    <Link href={`/proof?id=${id}`} className="font-semibold underline underline-offset-2">See the fix</Link>
                  </div>
                </div>
              )}
            </div>
            <dl className="grid grid-cols-2 border-t border-line text-center tnum">
              <div className="border-r border-line px-4 py-4">
                <dt className="text-[11.5px] tracking-wide text-ink-3 uppercase">On the needle</dt>
                <dd className="mt-1 text-[24px] font-semibold tracking-[-0.02em]">{result.before}</dd>
              </div>
              <div className="px-4 py-4">
                <dt className="text-[11.5px] tracking-wide text-ink-3 uppercase">At the end</dt>
                <dd className={`mt-1 text-[24px] font-semibold tracking-[-0.02em] ${result.status === "issue" ? "text-bad" : ""}`}>
                  {result.status === "unverifiable" ? "?" : result.after}
                </dd>
              </div>
            </dl>
          </article>
        )}
      </div>

      <footer className="sticky bottom-0 border-t border-line bg-paper/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[760px] items-center gap-3 px-4 py-3 sm:px-6">
          <button type="button" className="btn btn-secondary btn-lg" onClick={() => (done ? setDone(false) : go(safeRow - 1))} disabled={!done && safeRow === 0}>
            <ArrowLeft size={18} /> Back
          </button>
          <span className="mx-auto hidden text-[12px] text-ink-3 sm:inline">
            <span className="kbd">←</span> <span className="kbd">→</span> or <span className="kbd">space</span> · your place is saved
          </span>
          <button type="button" className="btn btn-primary btn-lg ml-auto sm:ml-0" onClick={() => go(safeRow + 1)} disabled={done}>
            {safeRow === total - 1 ? "Finish" : "Next row"} <Arrow size={18} />
          </button>
        </div>
      </footer>
    </div>
  );
}
