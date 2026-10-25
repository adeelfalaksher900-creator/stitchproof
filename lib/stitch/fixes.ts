import { parsePattern } from "./parse";
import { simulate } from "./simulate";
import type { Op, Program, SizedRef } from "./types";

export interface Fix {
  id: string;
  rowKey: string;
  rowLabel: string;
  size: number;
  /** 0-based line in the text that the edit changes. */
  line: number;
  /** One-sentence description of the edit. */
  description: string;
  lineBefore: string;
  lineAfter: string;
  newText: string;
  evidence: string;
  /** Total issues across all sizes after the edit. */
  remaining: number;
  kind: "instruction" | "declared";
  /** Size of the numeric change, used to prefer the smallest edit. */
  delta: number;
}

interface Candidate {
  ref: SizedRef;
  role: "instruction" | "declared";
  rowIndex: number;
  /** Where the number sits, when that isn't the row's own instructions. */
  label?: string;
  /** Editing it adds or removes rows (a repeat count), so rows can't be compared one for one. */
  flexible?: boolean;
}

function refsOf(ops: Op[], out: SizedRef[] = []): SizedRef[] {
  for (const op of ops) {
    if (op.t === "st" || op.t === "co") out.push(op.n);
    else if (op.t === "bo" && op.n !== "all") out.push(op.n);
    else if (op.t === "toEnd" || op.t === "toMarker") out.push(op.leave);
    else if (op.t === "rep") { out.push(op.times); refsOf(op.body, out); }
    else if (op.t === "repEnd" || op.t === "repMarker") { out.push(op.leave); refsOf(op.body, out); }
  }
  return out.filter((r) => r.spans && r.spans.some(Boolean));
}

function totalIssues(program: Program): number {
  let n = program.unread.length * 10;
  for (let i = 0; i < program.sizes.length; i++) n += simulate(program, i).issues;
  return n;
}

function replaceSpan(text: string, start: number, end: number, value: string): string {
  return text.slice(0, start) + value + text.slice(end);
}

function lineAt(text: string, line: number): string {
  return text.replace(/\r\n?/g, "\n").split("\n")[line] ?? "";
}

/**
 * Search for the smallest edit that fixes a row in one size.
 *
 * Every candidate is a real text edit: change one number in the issue row (or
 * a row shortly before it that changes the count), or change the declared
 * count. Each candidate is re-read and re-counted for every size; the edit
 * that leaves the fewest issues wins. Nothing here guesses — it only keeps
 * edits the counter proves are better.
 */
export function findFixes(text: string, program: Program, rowKey: string, size: number, limit = 2): Fix[] {
  const rowIndex = program.rows.findIndex((r) => r.key === rowKey);
  if (rowIndex < 0) return [];
  const row = program.rows[rowIndex];
  const nSizes = program.sizes.length;
  const baseline = totalIssues(program);
  const baseSize = simulate(program, size);
  const computed = baseSize.rows[rowIndex]?.after;

  const candidates: Candidate[] = [];
  const seenLines = new Set<number>();
  // The issue row, then up to two earlier rows that change the stitch count.
  const scan: number[] = [rowIndex];
  for (let i = rowIndex - 1; i >= 0 && scan.length < 3; i--) {
    const r = baseSize.rows[i];
    if (r && (r.makes !== r.uses || program.rows[i].until)) scan.push(i);
  }
  for (const idx of scan) {
    const r = program.rows[idx];
    if (seenLines.has(r.line) && idx !== rowIndex) continue;
    seenLines.add(r.line);
    for (const ref of refsOf(r.ops)) candidates.push({ ref, role: "instruction", rowIndex: idx });
    if (r.until?.count.spans?.some(Boolean)) candidates.push({ ref: r.until.count, role: "instruction", rowIndex: idx, label: "the stitch count to repeat until" });
    if (r.repeatRef?.spans?.some(Boolean)) candidates.push({ ref: r.repeatRef, role: "instruction", rowIndex: idx, label: "the repeat count", flexible: true });
  }
  if (row.declared?.spans?.some(Boolean)) candidates.push({ ref: row.declared, role: "declared", rowIndex });

  const results: Fix[] = [];
  const tried = new Set<string>();

  const tryEdit = (newText: string, cand: Candidate, written: number, oldWritten: number, scope: "all" | "size") => {
    if (tried.has(newText)) return;
    tried.add(newText);
    const p = parsePattern(newText);
    if (p.sizes.length !== nSizes || (!cand.flexible && p.rows.length !== program.rows.length)) return;
    const score = totalIssues(p);
    if (score >= baseline) return;
    if (cand.flexible) {
      // A new repeat count must leave this size with nothing wrong at all.
      if (simulate(p, size).issues > 0) return;
    } else {
      // The row itself must be clean in this size after the edit.
      const after = simulate(p, size).rows[rowIndex];
      if (!after || (after.status !== "ok" && after.status !== "skipped")) return;
    }
    const editLine = program.rows[cand.rowIndex].line;
    const target = program.rows[cand.rowIndex];
    const sizeName = program.sizes[size];
    const where = `${cand.label ?? target.label}${nSizes > 1 ? (scope === "size" ? ` (size ${sizeName} only)` : " (all sizes)") : ""}`;
    const description =
      cand.role === "declared"
        ? `Change the stated count in ${target.label} from ${oldWritten} to ${written}${nSizes > 1 ? ` for size ${sizeName}` : ""}.`
        : `Change ${oldWritten} to ${written} in ${where}.`;
    const evidence =
      cand.role === "declared"
        ? score === 0
          ? `The instructions really do make ${written} stitches, and every later row works from ${written} — so the printed number is most likely a typo.`
          : `The instructions make ${written} stitches, and the rows that follow agree with ${written}.`
        : score === 0
          ? `With this edit, every row in every size adds up.`
          : `This clears ${baseline - score} issue${baseline - score === 1 ? "" : "s"} without creating new ones.`;
    results.push({
      id: `${rowKey}:${size}:${cand.role}:${editLine}:${written}:${scope}:${results.length}`,
      rowKey,
      rowLabel: row.label,
      size,
      line: editLine,
      description,
      lineBefore: lineAt(text, editLine),
      lineAfter: lineAt(newText, editLine),
      newText,
      evidence,
      remaining: score,
      kind: cand.role,
      delta: Math.abs(written - oldWritten) + (scope === "size" ? 0.5 : 0) + (cand.rowIndex === rowIndex ? 0 : 0.25),
    });
  };

  for (const cand of candidates) {
    const { ref } = cand;
    const offset = ref.offset ?? 0;
    const multi = ref.values.length === nSizes && nSizes > 1;
    const idx = multi ? size : 0;
    const span = ref.spans?.[idx];
    if (!span) continue;
    const oldWritten = ref.values[idx] - offset;

    const targets: number[] =
      cand.role === "declared" && computed !== undefined
        ? [computed]
        : [-1, 1, -2, 2, -3, 3].map((d) => oldWritten + d);

    for (const written of targets) {
      if (written < 0 || written === oldWritten) continue;
      if (multi || nSizes === 1) {
        tryEdit(replaceSpan(text, span.start, span.end, String(written)), cand, written, oldWritten, multi ? "size" : "all");
      } else {
        // Shared value: try changing it for everyone, then for this size only.
        tryEdit(replaceSpan(text, span.start, span.end, String(written)), cand, written, oldWritten, "all");
        const values = Array.from({ length: nSizes }, (_, i) => (i === size ? written : oldWritten));
        const group = `${values[0]} (${values.slice(1).join(", ")})`;
        tryEdit(replaceSpan(text, span.start, span.end, group), cand, written, oldWritten, "size");
      }
    }
  }

  results.sort((a, b) => a.remaining - b.remaining || a.delta - b.delta);
  return results.slice(0, limit);
}
