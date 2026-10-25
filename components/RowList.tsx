"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { explainRow } from "@/lib/stitch/explain";
import type { Program, RowResult, SizeResult } from "@/lib/stitch/types";
import { Alert, Check, ChevronDown, Question } from "./icons";
import { StitchStrip } from "./StitchStrip";

interface Group {
  start: number;
  end: number;
  label: string;
  result: RowResult;
}

function groupRows(program: Program, result: SizeResult): Group[] {
  const groups: Group[] = [];
  program.rows.forEach((row, i) => {
    const r = result.rows[i];
    // Rows another size works ("Large only") aren't part of this size's list.
    if (r.status === "skipped") return;
    const prev = groups[groups.length - 1];
    const prevRow = prev ? program.rows[prev.end] : null;
    const prevRes = prev ? result.rows[prev.end] : null;
    if (
      prev && prevRow && prevRes &&
      prevRow.line === row.line &&
      r.status === prevRes.status && r.status !== "unverifiable" &&
      r.before === prevRes.before && r.after === prevRes.after &&
      r.messages.map((m) => m.text).join() === prevRes.messages.map((m) => m.text).join() &&
      row.number !== null && prevRow.number !== null
    ) {
      prev.end = i;
      const first = program.rows[prev.start];
      prev.label = `${row.round ? "Rnds" : "Rows"} ${first.number}–${row.number}`;
      return;
    }
    groups.push({ start: i, end: i, label: row.label, result: r });
  });
  return groups;
}

function StatusIcon({ status }: { status: RowResult["status"] }) {
  if (status === "ok")
    return (
      <span className="grid h-5 w-5 place-items-center rounded-full bg-ok-soft text-ok" title="Adds up">
        <Check size={12} strokeWidth={2.4} />
      </span>
    );
  if (status === "unverifiable")
    return (
      <span className="grid h-5 w-5 place-items-center rounded-full bg-warn-soft text-warn" title="Can't be verified by counting">
        <Question size={12} strokeWidth={2.2} />
      </span>
    );
  return (
    <span className="grid h-5 w-5 place-items-center rounded-full bg-bad-soft text-bad" title="Doesn't add up">
      <Alert size={12} strokeWidth={2.2} />
    </span>
  );
}

interface Props {
  program: Program;
  result: SizeResult;
  sizeIndex: number;
  selectedKey?: string | null;
  onSelect?: (key: string | null) => void;
}

export function RowList({ program, result, sizeIndex, selectedKey, onSelect }: Props) {
  const groups = useMemo(() => groupRows(program, result), [program, result]);
  const [open, setOpen] = useState<number | null>(null);
  const refs = useRef(new Map<number, HTMLLIElement>());

  useEffect(() => {
    if (!selectedKey) return;
    const idx = program.rows.findIndex((r) => r.key === selectedKey);
    const g = groups.findIndex((gr) => idx >= gr.start && idx <= gr.end);
    if (g >= 0) {
      setOpen(g);
      refs.current.get(g)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedKey, groups, program.rows]);

  return (
    <ol className="divide-y divide-line" aria-label={`Rows in size ${result.size}`}>
      {groups.map((g, gi) => {
        const row = program.rows[g.start];
        const last = result.rows[g.end];
        const isOpen = open === gi;
        const multi = g.end > g.start;
        return (
          <li
            key={row.key}
            ref={(el) => {
              if (el) refs.current.set(gi, el);
            }}
            className={`rise ${isOpen ? "bg-surface-2" : ""}`}
            style={{ animationDelay: `${Math.min(gi, 24) * 14}ms` }}
          >
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => {
                setOpen(isOpen ? null : gi);
                onSelect?.(isOpen ? null : row.key);
              }}
              className="grid w-full grid-cols-[20px_minmax(84px,auto)_1fr_auto_16px] items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-2 sm:px-5"
            >
              <StatusIcon status={g.result.status} />
              <span className="text-[13px] font-semibold tracking-[-0.01em] whitespace-nowrap">{g.label}</span>
              <span className="mono truncate text-[12px] text-ink-2">{row.source.replace(/^[^:]*:\s*/, "")}</span>
              <span className="mono text-right text-[12px] tnum whitespace-nowrap">
                {g.result.status === "unverifiable" ? (
                  <span className="text-warn">?</span>
                ) : (
                  <>
                    <span className={g.result.status === "issue" ? "font-semibold text-bad" : "text-ink"}>{last.after}</span>
                    {last.declared !== undefined && last.declared !== last.after ? (
                      <span className="text-ink-3"> / says {last.declared}</span>
                    ) : null}
                  </>
                )}
              </span>
              <ChevronDown size={14} className={`text-ink-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>
            {isOpen && (
              <div className="space-y-3 px-4 pb-4 pl-[52px] sm:px-5 sm:pl-[56px]">
                {multi && (
                  <p className="text-[12px] text-ink-3">
                    {g.end - g.start + 1} identical {row.round ? "rounds" : "rows"}, each from {g.result.before} to {g.result.after} stitches.
                  </p>
                )}
                <p className="text-[14px] leading-relaxed text-ink">{explainRow(row, sizeIndex, g.result)}</p>
                {g.result.messages.length > 0 && (
                  <ul className="space-y-1">
                    {g.result.messages.map((m, i) => (
                      <li key={i} className="flex gap-2 text-[13px] text-bad">
                        <Alert size={14} className="mt-0.5 shrink-0" />
                        {m.text}
                      </li>
                    ))}
                  </ul>
                )}
                {row.unverifiable && <p className="text-[13px] text-warn">{row.unverifiable}, so Stitchproof doesn&apos;t guess its count.</p>}
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-[12px] text-ink-3 tnum">
                  <span>On needle before: <b className="font-semibold text-ink-2">{g.result.before}</b></span>
                  {!row.until && <span>Uses: <b className="font-semibold text-ink-2">{g.result.uses}</b></span>}
                  {!row.until && <span>Makes: <b className="font-semibold text-ink-2">{g.result.makes}</b></span>}
                  {g.result.declared !== undefined && <span>Pattern says: <b className="font-semibold text-ink-2">{g.result.declared}</b></span>}
                </div>
                {g.result.strip.length > 0 && <StitchStrip marks={g.result.strip} label={`Stitches made in ${row.label}`} />}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
