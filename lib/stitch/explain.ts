import { at } from "./parse";
import { stitchDef } from "./stitches";
import type { Op, Row, RowResult } from "./types";

const VERB: Record<string, [string, string]> = {
  // [singular phrase, plural phrase with {n}]
  k: ["knit 1", "knit {n}"],
  p: ["purl 1", "purl {n}"],
  ktbl: ["knit 1 through the back loop", "knit {n} through the back loop"],
  ptbl: ["purl 1 through the back loop", "purl {n} through the back loop"],
  sl: ["slip 1", "slip {n}"],
  "sl-wyif": ["slip 1 with yarn in front", "slip {n} with yarn in front"],
  "sl-wyib": ["slip 1 with yarn in back", "slip {n} with yarn in back"],
};

function phrase(code: string, n: number): string {
  const v = VERB[code];
  if (v) return n === 1 ? v[0] : v[1].replace("{n}", String(n));
  const d = stitchDef(code);
  const name = d?.name ?? code;
  return n === 1 ? name : `${name}, ${n} times`;
}

function beforeMarker(leave: number): string {
  return leave === 0 ? "to the marker" : `until ${leave} stitch${leave === 1 ? "" : "es"} before the marker`;
}

function toEndPhrase(code: string, leave: number): string {
  const base = code === "k" ? "knit" : code === "p" ? "purl" : (stitchDef(code)?.name ?? code);
  return leave === 0 ? `${base} to the end` : `${base} until ${leave} stitch${leave === 1 ? "" : "es"} remain${leave === 1 ? "s" : ""}`;
}

/**
 * Plain-English version of a row for one size. `solved` holds the repeat
 * counts the counter worked out for "to the end" parts, in order.
 */
export function explainRow(row: Row, size: number, result?: RowResult): string {
  if (row.unverifiable) return `${row.source} — ${row.unverifiable.toLowerCase()}.`;
  if (result?.status === "skipped") return "This size skips this row.";
  if (row.until) {
    const n = row.until.cycle.length;
    const t = result?.solved[0];
    const what = n === 1 ? `Repeat ${row.until.cycle[0].label}` : `Repeat ${row.until.cycle[0].label.replace(/^(Rnd|Row)\b/, "$1s")}–${row.until.cycle[n - 1].label.replace(/^\D+/, "")}`;
    const times = t !== undefined ? ` — that's ${t} more time${t === 1 ? "" : "s"}` : "";
    return `${what} until ${at(row.until.count, size)} stitches remain${times}.${result ? ` You'll have ${result.after} stitch${result.after === 1 ? "" : "es"}.` : ""}`;
  }
  const solved = [...(result?.solved ?? [])];
  const parts = explainOps(row.ops, size, solved);
  const sentence = parts.join(", then ");
  const capital = sentence.charAt(0).toUpperCase() + sentence.slice(1);
  const end = result ? ` You'll have ${result.after} stitch${result.after === 1 ? "" : "es"}.` : "";
  return `${capital}.${end}`;
}

/** How many solved counts one pass over these ops records. */
function solvedCount(ops: Op[], size: number): number {
  let n = 0;
  for (const op of ops) {
    if (op.t === "toEnd" || op.t === "toMarker" || op.t === "repEnd" || op.t === "repMarker") n++;
    else if (op.t === "rep") n += at(op.times, size) * solvedCount(op.body, size);
  }
  return n;
}

function explainOps(ops: Op[], size: number, solved: number[]): string[] {
  const out: string[] = [];
  for (const op of ops) {
    switch (op.t) {
      case "note":
        out.push(op.text.toLowerCase());
        break;
      case "marker":
        out.push(op.kind === "pm" ? "place a marker" : op.kind === "sm" ? "slip the marker" : "remove the marker");
        break;
      case "toMarker": {
        const n = solved.shift();
        const base = op.code === "k" ? "knit" : op.code === "p" ? "purl" : (stitchDef(op.code)?.name ?? op.code);
        out.push(`${base} ${beforeMarker(at(op.leave, size))}${n !== undefined ? ` (${n} stitch${n === 1 ? "" : "es"})` : ""}`);
        break;
      }
      case "repMarker": {
        const n = solved.shift();
        const inner = explainOps(op.body, size, []).join(", ");
        out.push(`repeat [${inner}] ${beforeMarker(at(op.leave, size))}${n !== undefined ? ` — that's ${n} time${n === 1 ? "" : "s"}` : ""}`);
        break;
      }
      case "co":
        out.push(`cast on ${at(op.n, size)} stitches`);
        break;
      case "bo":
        out.push(op.n === "all" ? "bind off all stitches" : `bind off ${at(op.n, size)} stitches`);
        break;
      case "st":
        out.push(phrase(op.code, at(op.n, size)));
        break;
      case "toEnd": {
        const n = solved.shift();
        const base = toEndPhrase(op.code, at(op.leave, size));
        out.push(n !== undefined ? `${base} (${n} stitch${n === 1 ? "" : "es"})` : base);
        break;
      }
      case "rep": {
        const t = at(op.times, size);
        // The counter solved the body's "to marker" parts once per repeat; show the first, skip the rest.
        const per = solvedCount(op.body, size);
        const taken = solved.splice(0, per * t);
        const inner = explainOps(op.body, size, taken.slice(0, per)).join(", ");
        out.push(t === 1 ? inner : `repeat [${inner}] ${t} times`);
        break;
      }
      case "repEnd": {
        const n = solved.shift();
        // A marker-bounded body records its own counts on every pass; show the first pass only.
        const per = solvedCount(op.body, size);
        const taken = solved.splice(0, (n ?? 0) * per);
        const inner = explainOps(op.body, size, taken.slice(0, per)).join(", ");
        const leave = at(op.leave, size);
        const until = leave === 0 ? "to the end" : `until ${leave} stitch${leave === 1 ? "" : "es"} remain${leave === 1 ? "s" : ""}`;
        out.push(`repeat [${inner}] ${until}${n !== undefined ? ` — that's ${n} time${n === 1 ? "" : "s"}` : ""}`);
        break;
      }
    }
  }
  return out;
}
