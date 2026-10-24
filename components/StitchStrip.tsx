import type { StripMark } from "@/lib/stitch/types";

const LABEL: Record<StripMark, string> = {
  k: "knit",
  p: "purl",
  inc: "increase",
  decL: "left-leaning decrease",
  decR: "right-leaning decrease",
  decC: "centred decrease",
  yo: "yarn over",
  sl: "slip",
  bo: "bind off",
  co: "cast on",
};

function Glyph({ m, x, y, s }: { m: StripMark; x: number; y: number; s: number }) {
  const cx = x + s / 2;
  const cy = y + s / 2;
  const r = s * 0.32;
  switch (m) {
    case "k":
      return <path d={`M${cx - r} ${cy - r}L${cx} ${cy + r}L${cx + r} ${cy - r}`} stroke="var(--ink-2)" />;
    case "p":
      return <path d={`M${cx - r} ${cy}Q${cx} ${cy - r * 0.9} ${cx + r} ${cy}`} stroke="var(--ink-3)" />;
    case "inc":
      return <path d={`M${cx - r} ${cy}H${cx + r}M${cx} ${cy - r}V${cx + r - cx + cy}`} stroke="var(--ok)" />;
    case "decR":
      return <path d={`M${cx - r} ${cy + r}L${cx + r} ${cy - r}`} stroke="var(--accent)" strokeWidth={1.8} />;
    case "decL":
      return <path d={`M${cx - r} ${cy - r}L${cx + r} ${cy + r}`} stroke="var(--accent)" strokeWidth={1.8} />;
    case "decC":
      return <path d={`M${cx - r} ${cy + r}L${cx} ${cy - r}L${cx + r} ${cy + r}`} stroke="var(--accent)" strokeWidth={1.6} />;
    case "yo":
      return <circle cx={cx} cy={cy} r={r * 0.8} stroke="var(--accent)" />;
    case "sl":
      return <path d={`M${cx} ${cy - r}V${cy + r}`} stroke="var(--ink-3)" />;
    case "bo":
      return <path d={`M${cx - r * 0.7} ${cy - r * 0.7}L${cx + r * 0.7} ${cy + r * 0.7}M${cx + r * 0.7} ${cy - r * 0.7}L${cx - r * 0.7} ${cy + r * 0.7}`} stroke="var(--ink-3)" />;
    case "co":
      return <circle cx={cx} cy={cy} r={r * 0.35} fill="var(--ink-3)" stroke="none" />;
  }
}

/** One small mark per stitch made, so a row's structure is visible at a glance. */
export function StitchStrip({ marks, perLine = 40, cell = 12, label }: { marks: StripMark[]; perLine?: number; cell?: number; label?: string }) {
  if (marks.length === 0) return null;
  const cols = Math.min(perLine, marks.length);
  const lines = Math.ceil(marks.length / perLine);
  const kinds = Array.from(new Set(marks));
  return (
    <div>
      <svg
        viewBox={`0 0 ${cols * cell} ${lines * cell}`}
        width="100%"
        style={{ maxWidth: cols * cell * 1.6 }}
        role="img"
        aria-label={label ?? `Stitch strip: ${marks.length} stitches`}
        fill="none"
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {marks.map((m, i) => (
          <Glyph key={i} m={m} x={(i % perLine) * cell} y={Math.floor(i / perLine) * cell} s={cell} />
        ))}
      </svg>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-3">
        {kinds.map((k) => (
          <li key={k} className="flex items-center gap-1">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" strokeWidth={1.4} strokeLinecap="round" aria-hidden>
              <Glyph m={k} x={0} y={0} s={12} />
            </svg>
            {LABEL[k]}
          </li>
        ))}
      </ul>
    </div>
  );
}
