"use client";

import { useId, useMemo, useState } from "react";
import type { Program, SizeResult } from "@/lib/stitch/types";

interface Props {
  program: Program;
  result: SizeResult;
  selectedKey?: string | null;
  onSelect?: (key: string) => void;
  height?: number;
  compact?: boolean;
}

/**
 * The piece's silhouette: one bar per row, as wide as its stitch count,
 * drawn from the cast-on edge upward the way the fabric grows.
 */
export function ShapePreview({ program, result, selectedKey, onSelect, height = 260, compact }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const titleId = useId();
  const bars = useMemo(() => {
    return result.rows
      .map((r, i) => ({ r, row: program.rows[i], i }))
      .filter(({ row, r }) => r.status !== "skipped" && (row.ops.some((o) => o.t !== "bo") || row.unverifiable || row.until));
  }, [program, result]);

  const max = Math.max(1, ...result.rows.map((r) => Math.max(r.after, r.before)));
  const W = 320;
  const H = height;
  const pad = 8;
  const n = Math.max(1, bars.length);
  const step = (H - pad * 2) / n;
  const barH = step < 4 ? step + 0.35 : Math.min(9, step * 0.8);
  const active = hover ?? (selectedKey ? bars.findIndex((b) => b.r.key === selectedKey) : -1);
  const info = active >= 0 ? bars[active] : null;

  return (
    <figure className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full"
        style={{ height: compact ? 160 : undefined, maxHeight: H }}
        role="img"
        aria-labelledby={titleId}
        onMouseLeave={() => setHover(null)}
      >
        <title id={titleId}>
          {`Shape of the piece in size ${result.size}: ${bars.length} rows, from ${bars[0]?.r.after ?? 0} stitches at the cast-on edge to ${bars[bars.length - 1]?.r.after ?? 0} at the top.`}
        </title>
        <line x1={W / 2} x2={W / 2} y1={pad} y2={H - pad} stroke="var(--line)" strokeDasharray="2 4" />
        {bars.map(({ r, i }, idx) => {
          const count = r.after || r.before;
          const w = Math.max(2, ((W - pad * 2) * count) / max);
          const y = H - pad - (idx + 1) * step + (step - barH) / 2;
          const color =
            r.status === "issue" ? "var(--bad)" : r.status === "unverifiable" || r.status === "warn" ? "var(--warn)" : "var(--ink)";
          const isActive = idx === active;
          return (
            <rect
              key={r.key}
              x={(W - w) / 2}
              y={y}
              width={w}
              height={barH}
              rx={Math.min(barH / 2, 3)}
              fill={isActive ? "var(--accent)" : color}
              opacity={isActive ? 1 : r.status === "ok" ? 0.2 + 0.12 * (i % 2) : 0.82}
              style={{ cursor: onSelect ? "pointer" : undefined, transition: "opacity 160ms" }}
              onMouseEnter={() => setHover(idx)}
              onClick={() => onSelect?.(r.key)}
            />
          );
        })}
      </svg>
      {!compact && (
        <figcaption className="mt-3 flex items-center justify-between text-[12px] text-ink-3 tnum">
          <span>
            {info ? (
              <>
                <span className="font-medium text-ink">{program.rows[info.i].label}</span> · {info.r.after} sts
                {info.r.status === "issue" ? <span className="text-bad"> · issue</span> : null}
              </>
            ) : (
              <>Hover a row to see its count</>
            )}
          </span>
          <span>widest {max} sts</span>
        </figcaption>
      )}
    </figure>
  );
}
