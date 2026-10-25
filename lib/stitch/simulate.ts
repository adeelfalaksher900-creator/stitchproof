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
  /** Marker positions on the left needle (stitches before each), sorted. */
  inMarkers: number[];
  /** Index of the first input marker not yet passed. */
  nextIn: number;
  /** Marker positions on the right needle. */
  outMarkers: number[];
  /** True once the row has any marker to work towards (carried in or placed). */
  hasMarkers: boolean;
  /** Worked in the round: the end of the round is itself a marker. */
  round: boolean;
  /** Remarks that don't make the row wrong (status "warn"). */
  notes: IssueMessage[];
  /** Set when a marker can't be reached: where the knitter is is unknown, so the rest isn't counted. */
  stuck: boolean;
}

/** Move every marker the working yarn has reached onto the right needle. */
function passMarkers(w: Walk) {
  while (w.nextIn < w.inMarkers.length && w.inMarkers[w.nextIn] <= w.used) {
    w.outMarkers.push(w.made);
    w.nextIn++;
  }
}

/** Stitches between the working position and the next marker (or the end of the row). */
function toNextMarker(w: Walk, before: number): number {
  const m = w.inMarkers.find((p) => p > w.used);
  return (m ?? before) - w.used;
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
    } else if (op.t === "note" || op.t === "marker") {
      // no effect on the count
    } else {
      return null;
    }
  }
  return { uses, makes };
}

/** True when a body moves along the needle through a marker-bounded part. */
function bodyMoves(ops: Op[]): boolean {
  return ops.some((op) => op.t === "toMarker" || op.t === "repMarker" || (op.t === "rep" && bodyMoves(op.body)));
}

/** Work n stitches that each use `uses` and make `makes`, carrying any markers they pass to the right needle. */
function work(w: Walk, uses: number, makes: number, n: number) {
  const end = w.used + uses * n;
  while (w.nextIn < w.inMarkers.length && w.inMarkers[w.nextIn] < end) {
    w.outMarkers.push(w.made + Math.floor((w.inMarkers[w.nextIn] - w.used) / uses) * makes);
    w.nextIn++;
  }
  w.used = end;
  w.made += makes * n;
}

function pushMarks(w: Walk, mark: StripMark, count: number) {
  for (let i = 0; i < count && w.strip.length < STRIP_CAP; i++) w.strip.push(mark);
}

function walk(ops: Op[], size: number, before: number, w: Walk) {
  for (const op of ops) {
    if (w.stuck) return;
    passMarkers(w);
    switch (op.t) {
      case "note":
        break;
      case "marker":
        if (op.kind === "pm") { w.outMarkers.push(w.made); w.hasMarkers = true; }
        else if (op.kind === "rm") {
          // The marker just passed (or the one right here) comes off.
          const i = w.outMarkers.lastIndexOf(w.made);
          if (i >= 0) w.outMarkers.splice(i, 1);
          else if (w.inMarkers[w.nextIn] === w.used) w.nextIn++;
        }
        break;
      case "toMarker": {
        const d = stitchDef(op.code)!;
        const leave = at(op.leave, size);
        if (!w.hasMarkers && !w.round) {
          w.messages.push({ kind: "not-enough", text: "This row works to a marker, but no marker has been placed." });
          w.solved.push(0);
          w.stuck = true;
          break;
        }
        const remaining = toNextMarker(w, before) - leave;
        if (remaining < 0) {
          w.messages.push({
            kind: "not-enough",
            text: `"${op.code} to ${leave ? `${leave} before ` : ""}the marker" needs ${leave} stitch${leave === 1 ? "" : "es"} before the marker, but only ${leave + remaining} ${leave + remaining === 1 ? "is" : "are"} left there.`,
          });
          w.solved.push(0);
          w.stuck = true;
          break;
        }
        const n = Math.floor(remaining / d.uses);
        w.solved.push(n);
        work(w, d.uses, d.makes, n);
        pushMarks(w, d.mark, n * d.makes);
        break;
      }
      case "repMarker": {
        const cost = fixedCost(op.body, size);
        const leave = at(op.leave, size);
        if (!w.hasMarkers && !w.round) {
          w.messages.push({ kind: "not-enough", text: "This row works to a marker, but no marker has been placed." });
          w.solved.push(0);
          w.stuck = true;
          break;
        }
        if (!cost || cost.uses === 0) {
          w.messages.push({ kind: "repeat-uneven", text: "This repeat doesn't use any stitches, so it can't run to the marker." });
          w.solved.push(0);
          w.stuck = true;
          break;
        }
        const remaining = toNextMarker(w, before) - leave;
        if (remaining < 0) {
          w.messages.push({ kind: "not-enough", text: `The repeat needs ${-remaining} more stitch${remaining === -1 ? "" : "es"} before the marker than there are.` });
          w.solved.push(0);
          w.stuck = true;
          break;
        }
        const times = Math.floor(remaining / cost.uses);
        const leftover = remaining - times * cost.uses;
        w.solved.push(times);
        for (let i = 0; i < times; i++) walk(op.body, size, before, w);
        if (leftover > 0) {
          w.messages.push({
            kind: "repeat-uneven",
            text: `The ${cost.uses}-stitch repeat doesn't fit before the marker: after ${times} repeats, ${leftover} stitch${leftover === 1 ? "" : "es"} ${leftover === 1 ? "is" : "are"} left over${leave ? ` before the last ${leave}` : ""}.`,
          });
          // Carry on from where the knitter would actually be: at the stitches the pattern leaves.
          work(w, 1, 1, leftover);
        }
        break;
      }
      case "co": {
        const n = at(op.n, size);
        w.made += n;
        pushMarks(w, "co", n);
        break;
      }
      case "bo": {
        const n = op.n === "all" ? Math.max(0, before - w.used) : at(op.n, size);
        work(w, 1, 0, n);
        pushMarks(w, "bo", Math.min(n, 40));
        break;
      }
      case "st": {
        const d = stitchDef(op.code)!;
        const n = at(op.n, size);
        work(w, d.uses, d.makes, n);
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
        work(w, d.uses, d.makes, n);
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
        if (!cost && bodyMoves(op.body)) {
          // A body that works to a marker ("*k to 2 sts before m, k2tog, sm; rep from * to end") is
          // walked until it reaches the end; its length comes from the markers, not from arithmetic.
          const slot = w.solved.length;
          w.solved.push(0);
          let times = 0;
          while (w.used < before - leave && times < 1000) {
            const u = w.used;
            walk(op.body, size, before, w);
            times++;
            if (w.used <= u) break;
          }
          w.solved[slot] = times;
          if (w.used > before - leave) {
            w.messages.push({ kind: "not-enough", text: `The last repeat runs ${w.used - (before - leave)} stitch${w.used - (before - leave) === 1 ? "" : "es"} past the ${leave ? `last ${leave}` : "end"}.` });
          }
          break;
        }
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

export function simulateRow(row: Row, size: number, before: number, markers: number[] = []): RowResult {
  const stated = row.declared ? at(row.declared, size) : undefined;
  // NaN marks a size the pattern gave no count for (a "sizes only" section).
  const declared = stated === undefined || Number.isNaN(stated) ? undefined : stated;
  if (row.only && !(row.only.length === 1 ? row.only[0] : row.only[size])) {
    // This size doesn't work the row; a count stated at the end of a block still applies to it.
    const messages: IssueMessage[] = declared !== undefined && declared !== before
      ? [{ kind: "declared-mismatch", text: `The instructions make ${before} stitches; the pattern says ${declared}.` }]
      : [];
    return { key: row.key, before, uses: 0, makes: 0, after: before, declared, status: messages.length ? "issue" : "skipped", messages, solved: [], strip: [], markers };
  }
  if (row.until) return simulateUntil(row, row.until, size, before, markers, declared);
  if (row.unverifiable) {
    return {
      key: row.key, before, uses: 0, makes: 0,
      after: declared ?? before, declared,
      status: "unverifiable",
      messages: [],
      solved: [], strip: [],
      // Unknown rows keep the markers where they were, scaled to the new count.
      markers: before > 0 && declared !== undefined ? markers.map((p) => Math.round((p * declared) / before)) : markers,
    };
  }
  const w: Walk = {
    used: 0, made: 0, solved: [], strip: [], messages: [], leftoverReported: 0,
    inMarkers: [...markers].sort((a, b) => a - b), nextIn: 0, outMarkers: [],
    hasMarkers: markers.length > 0, round: row.round, notes: [], stuck: false,
  };
  const startsWithCo = row.ops[0]?.t === "co";
  if (before === 0 && !startsWithCo && row.ops.some((o) => o.t !== "note")) {
    w.messages.push({ kind: "no-stitches", text: "This row needs stitches, but none have been cast on yet." });
  }
  walk(row.ops, size, before, w);
  passMarkers(w);

  let after = w.made;
  // Markers beyond the last worked stitch ride along with the unworked stitches.
  for (; w.nextIn < w.inMarkers.length; w.nextIn++) w.outMarkers.push(w.made + Math.max(0, w.inMarkers[w.nextIn] - w.used));
  if (w.used < before) {
    const unworked = before - w.used;
    after += unworked;
    const extra = unworked - w.leftoverReported;
    // A round worked marker to marker that stops short of the end-of-round marker: the stitches left are
    // knitted to reach it. That's a gap in the wording, not in the count, so it's a note rather than an issue.
    const toMarkers = (ops: Op[]): boolean => ops.some((o) => o.t === "toMarker" || o.t === "repMarker" || (o.t === "marker" && o.kind === "sm") || ((o.t === "rep" || o.t === "repEnd") && toMarkers(o.body)));
    if (extra > 0 && row.round && toMarkers(row.ops) && w.messages.length === 0) {
      w.notes.push({
        kind: "unworked",
        text: `The round stops ${extra} stitch${extra === 1 ? "" : "es"} before the end-of-round marker. Stitchproof assumes you knit ${extra === 1 ? "it" : "them"}; the pattern doesn't say.`,
      });
    } else if (extra > 0 && !w.stuck) {
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
  // Flat knitting turns the work, so the next row meets the markers from the other end.
  const finalAfter = Math.max(0, after);
  const nextMarkers = w.outMarkers
    .map((p) => Math.min(Math.max(0, p), finalAfter))
    .map((p) => (row.round ? p : finalAfter - p))
    .sort((a, b) => a - b);
  if (row.change) {
    const said = row.change.sign * at(row.change.ref, size);
    if (!Number.isNaN(said) && after - before !== said) {
      const word = (n: number) => `${n < 0 ? "decreases" : "increases"} by ${Math.abs(n)}`;
      w.messages.push({
        kind: "declared-mismatch",
        text: after === before ? `This row keeps the count at ${after}; the pattern says it ${word(said)}.` : `This row ${word(after - before)}; the pattern says it ${word(said)}.`,
      });
    }
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
    status: w.messages.length ? "issue" : w.notes.length ? "warn" : "ok",
    messages: w.messages.length ? w.messages : w.notes,
    solved: w.solved,
    strip: w.strip,
    markers: nextMarkers,
  };
}

/** "Rep last 2 rnds until 16 sts rem": work the rows again and again; the count must land exactly. */
function simulateUntil(
  row: Row, until: NonNullable<Row["until"]>, size: number, before: number, markers: number[], declared?: number,
): RowResult {
  const target = at(until.count, size);
  const messages: IssueMessage[] = [];
  let count = before;
  let marks = markers;
  let times = 0;
  outer: while (count !== target && times < 1000) {
    const start = count;
    for (const r of until.cycle) {
      const prev = count;
      // A count printed on the first working of these rows doesn't hold for later repeats.
      const res = simulateRow({ ...r, declared: undefined, change: undefined }, size, count, marks);
      if (res.status === "issue") {
        messages.push({ kind: res.messages[0]?.kind ?? "not-enough", text: `On repeat ${times + 1}, ${r.label}: ${res.messages[0]?.text ?? "it doesn't add up."}` });
        count = res.after;
        break outer;
      }
      count = res.after;
      marks = res.markers ?? [];
      // Overshooting the target means it can never be reached exactly.
      if ((prev - target) * (count - target) < 0) {
        messages.push({ kind: "declared-mismatch", text: `Repeating these rows never leaves exactly ${target} stitches: ${r.label} goes from ${prev} to ${count}.` });
        break outer;
      }
      if (count === target) break;
    }
    times++;
    if (count === start) {
      messages.push({ kind: "declared-mismatch", text: `These rows don't change the stitch count, so they never reach ${target} stitches.` });
      break;
    }
  }
  if (!messages.length && times >= 1000) messages.push({ kind: "declared-mismatch", text: `These rows don't reach ${target} stitches.` });
  if (!messages.length && declared !== undefined && declared !== count) {
    messages.push({ kind: "declared-mismatch", text: `The instructions make ${count} stitches; the pattern says ${declared}.` });
  }
  return {
    key: row.key, before, uses: 0, makes: 0, after: count, declared: declared ?? target,
    status: messages.length ? "issue" : "ok", messages, solved: [times], strip: [], markers: marks,
  };
}

export function simulate(program: Program, size: number): SizeResult {
  let count = 0;
  let markers: number[] = [];
  const rows: RowResult[] = [];
  for (const row of program.rows) {
    const r = simulateRow(row, size, count, markers);
    rows.push(r);
    count = r.after;
    markers = r.markers ?? [];
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
