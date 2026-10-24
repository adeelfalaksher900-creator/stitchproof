import { findErrata } from "./errata";
import { parsePattern } from "./parse";
import { proofProgram, proofText } from "./proof";
import type { Op, SizedRef } from "./types";

export interface Mutation {
  pattern: string;
  text: string;
  /** What was changed, e.g. "Rnd 45: 72 → 74". */
  change: string;
}

function refsOf(ops: Op[], out: SizedRef[]) {
  for (const op of ops) {
    if (op.t === "st" || op.t === "co") out.push(op.n);
    else if (op.t === "bo" && op.n !== "all") out.push(op.n);
    else if (op.t === "toEnd") out.push(op.leave);
    else if (op.t === "rep") { out.push(op.times); refsOf(op.body, out); }
    else if (op.t === "repEnd") { out.push(op.leave); refsOf(op.body, out); }
  }
}

/** Every single-number typo (±1, ±2) a designer could make in a correct pattern. */
export function mutations(name: string, text: string, deltas = [-2, -1, 1, 2]): Mutation[] {
  const program = parsePattern(text);
  const seen = new Set<number>();
  const out: Mutation[] = [];
  for (const row of program.rows) {
    const refs: SizedRef[] = [];
    refsOf(row.ops, refs);
    if (row.declared) refs.push(row.declared);
    for (const ref of refs) {
      ref.spans?.forEach((span, i) => {
        if (!span || seen.has(span.start)) return;
        seen.add(span.start);
        const written = Number(text.slice(span.start, span.end));
        for (const d of deltas) {
          const v = written + d;
          if (v < 0 || (v === 0 && ref !== row.declared)) continue;
          out.push({
            pattern: name,
            text: text.slice(0, span.start) + v + text.slice(span.end),
            change: `${row.label}${ref.values.length > 1 ? ` (size ${program.sizes[i]})` : ""}: ${written} → ${v}`,
          });
        }
      });
    }
  }
  return out;
}

export interface EvalResult {
  total: number;
  /** Typos that change no stitch count at all (e.g. how many plain rows) — counting can't see them. */
  invisible: number;
  detected: number;
  /** Detected typos where applying Stitchproof's fixes makes every row add up again. */
  repaired: number;
  /** Repaired typos where the fixed text is exactly the original pattern. */
  restored: number;
  failures: Mutation[];
}

export function evaluateFixer(patterns: Record<string, string>): EvalResult {
  const r: EvalResult = { total: 0, invisible: 0, detected: 0, repaired: 0, restored: 0, failures: [] };
  for (const [name, text] of Object.entries(patterns)) {
    if (proofText(text).verdict !== "proven") throw new Error(`${name} is not a clean pattern`);
    for (const m of mutations(name, text)) {
      r.total++;
      const proof = proofProgram(parsePattern(m.text));
      if (proof.verdict !== "issues") {
        r.invisible++;
        continue;
      }
      r.detected++;
      const { fixedText } = findErrata(m.text, proof);
      if (fixedText && proofText(fixedText).verdict === "proven") {
        r.repaired++;
        if (fixedText === text) r.restored++;
      } else {
        r.failures.push(m);
      }
    }
  }
  return r;
}
