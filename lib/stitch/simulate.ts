import { at } from "./parse";
import { stitchDef } from "./stitches";
import type { IssueMessage, Op, Program, Row, RowResult, SizeResult, StripMark } from "./types";

const STRIP_CAP = 600;

interface Walk {
  used: number;
  made: number;
  solved: number[];
  strip: StripMark[];
  messages: IssueMessage[];
  leftoverReported: number;
}

/** Stitches used and made by a fixed sequence (no "to end" parts allowed inside). */
function fixedCost(ops: Op[], size: number): { uses: number; makes: number } | null {
  let uses = 0;
  let makes = 0;
  for (const op of ops) {
    if (op.t === "st") {
      const d = stitchDef(op.code);
      if (!d) return null;
      const n = at(op.n, size);
      uses += d.uses * n;
      makes += d.makes * n;
    } else if (op.t === "rep") {
      const inner = fixedCost(op.body, size);
      if (!inner) return null;
      const n = at(op.times, size);
      uses += inner.uses * n;
      makes += inner.makes * n;
    } else if (op.t === "co") {
      makes += at(op.n, size);
    } else if (op.t === "bo") {
      if (op.n === "all") return null;
      uses += at(op.n, size);
    } else if (op.t === "note") {
      // no effect
    } else {
      return null;
    }
  }
  return { uses, makes };
}

function pushMarks(w: Walk, mark: StripMark, count: number) {
  for (let i = 0; i < count && w.strip.length < STRIP_CAP; i++) w.strip.push(mark);
}

function walk(ops: Op[], size: number, before: number, w: Walk) {
  for (const op of ops) {
    switch (op.t) {
      case "note":
        break;
      case "co": {
        const n = at(op.n, size);
        w.made += n;
        pushMarks(w, "co", n);
        break;
      }
      case "bo": {
        const n = op.n === "all" ? Math.max(0, before - w.used) : at(op.n, size);
        w.used += n;
        pushMarks(w, "bo", Math.min(n, 40));
        break;
      }
      case "st": {
        const d = stitchDef(op.code)!;
        const n = at(op.n, size);
        w.used += d.uses * n;
        w.made += d.makes * n;
        pushMarks(w, d.mark, d.makes * n);
        break;
      }
      case "toEnd": {
        const d = stitchDef(op.code)!;
        const leave = at(op.leave, size);
        const remaining = before - w.used - leave;
        if (remaining < 0) {
          w.messages.push({
            kind: "not-enough",
            text: `"${op.code} to ${leave ? `last ${leave}` : "end"}" needs ${w.used + leave} stitches before it can start, but there are only ${before}.`,
          });
          w.solved.push(0);
          break;
        }
        const n = Math.floor(remaining / d.uses);
        w.solved.push(n);
        w.used += n * d.uses;
        w.made += n * d.makes;
        pushMarks(w, d.mark, n);
        break;
      }
      case "rep": {
        const times = at(op.times, size);
        for (let i = 0; i < times; i++) walk(op.body, size, before, w);
        break;
      }
      case "repEnd": {
        const cost = fixedCost(op.body, size);
        const leave = at(op.leave, size);
        if (!cost || cost.uses === 0) {
          w.messages.push({ kind: "repeat-uneven", text: "This repeat doesn't use any stitches, so it can't run to the end." });
          w.solved.push(0);
          break;
        }
        const remaining = before - w.used - leave;
        if (remaining < 0) {
          w.messages.push({
            kind: "not-enough",
            text: `The repeat needs ${w.used + leave} stitches before it can start, but there are only ${before}.`,
          });
          w.solved.push(0);
          break;
        }
        const times = Math.floor(remaining / cost.uses);
        const leftover = remaining - times * cost.uses;
        w.solved.push(times);
        for (let i = 0; i < times; i++) walk(op.body, size, before, w);
        if (leftover > 0) {
          w.leftoverReported += leftover;
          w.messages.push({
            kind: "repeat-uneven",
            text: `The ${cost.uses}-stitch repeat doesn't fit: after ${times} repeats, ${leftover} stitch${leftover === 1 ? "" : "es"} ${leftover === 1 ? "is" : "are"} left over${leave ? ` before the last ${leave}` : ""}.`,
          });
        }
        break;
      }
    }
  }
}

export function simulateRow(row: Row, size: number, before: number): RowResult {
  const declared = row.declared ? at(row.declared, size) : undefined;
  if (row.unverifiable) {
    return {
      key: row.key, before, uses: 0, makes: 0,
      after: declared ?? before, declared,
      status: "unverifiable",
      messages: [],
      solved: [], strip: [],
    };
  }
  const w: Walk = { used: 0, made: 0, solved: [], strip: [], messages: [], leftoverReported: 0 };
  const startsWithCo = row.ops[0]?.t === "co";
  if (before === 0 && !startsWithCo && row.ops.some((o) => o.t !== "note")) {
    w.messages.push({ kind: "no-stitches", text: "This row needs stitches, but none have been cast on yet." });
  }
  walk(row.ops, size, before, w);

  let after = w.made;
  if (w.used < before) {
    const unworked = before - w.used;
    after += unworked;
    const extra = unworked - w.leftoverReported;
    if (extra > 0) {
      w.messages.push({
        kind: "unworked",
        text: `The row ends with ${extra} stitch${extra === 1 ? "" : "es"} still unworked (it uses ${w.used} of ${before}).`,
      });
    }
  } else if (w.used > before && !w.messages.some((m) => m.kind === "not-enough")) {
    w.messages.push({
      kind: "not-enough",
      text: `The row uses ${w.used} stitches, but only ${before} are on the needle.`,
    });
  }
  if (after < 0) {
    w.messages.push({ kind: "negative", text: "The stitch count goes below zero." });
    after = 0;
  }
  if (declared !== undefined && declared !== after) {
    w.messages.unshift({
      kind: "declared-mismatch",
      text: `The instructions make ${after} stitches; the pattern says ${declared}.`,
    });
  }
  return {
    key: row.key,
    before,
    uses: w.used,
    makes: w.made,
    after,
    declared,
    status: w.messages.length ? "issue" : "ok",
    messages: w.messages,
    solved: w.solved,
    strip: w.strip,
  };
}

export function simulate(program: Program, size: number): SizeResult {
  let count = 0;
  const rows: RowResult[] = [];
  for (const row of program.rows) {
    const r = simulateRow(row, size, count);
    rows.push(r);
    count = r.after;
  }
  return {
    size: program.sizes[size] ?? `Size ${size + 1}`,
    rows,
    issues: rows.filter((r) => r.status === "issue").length,
    warnings: rows.filter((r) => r.status === "warn").length,
    unverifiable: rows.filter((r) => r.status === "unverifiable").length,
    finalCount: count,
  };
}

export function simulateAll(program: Program): SizeResult[] {
  return program.sizes.map((_, i) => simulate(program, i));
}
