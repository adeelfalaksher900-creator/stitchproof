import { ALIASES, STITCHES } from "./stitches";
import type { Op, Program, Row, Side, SizedRef, Span, Unread } from "./types";

/**
 * The offline reader: turns standard knitting notation into a stitch program.
 *
 * It never guesses. A line it doesn't fully understand becomes an `unread`
 * entry with a reason, and the caller decides whether to ask the AI reader.
 * Every number keeps its character span so fixes can edit the original text.
 */

class ReadError extends Error {}

// Real patterns stay far below these; the caps keep a pasted "Rows 1–999999999" from freezing the tab.
const MAX_NUMBER = 5000;
const MAX_ROWS = 5000;

function num(digits: string): number {
  const n = Number(digits);
  if (n > MAX_NUMBER) throw new ReadError(`${digits} is too large to be a row or stitch count`);
  return n;
}

const WORD_NUMBERS: Record<string, number> = {
  once: 1, twice: 2, thrice: 3,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};

/** A slice of the source with its absolute offset, so spans stay exact. */
interface Slice {
  s: string;
  at: number;
}

function slice(src: Slice, from: number, to = src.s.length): Slice {
  return { s: src.s.slice(from, to), at: src.at + from };
}

function trim(src: Slice): Slice {
  const lead = src.s.length - src.s.trimStart().length;
  const s = src.s.trim();
  return { s, at: src.at + lead };
}

/** Remove trailing punctuation like "." ";" "," without moving the start. */
function stripTrailing(src: Slice): Slice {
  const s = src.s.replace(/[\s.;,:]+$/u, "");
  return { s, at: src.at };
}

// A dash in a size group ("– (0, 1, 2)") means "not in this size": zero.
const SIZED_RE = /^(\d+|[–—-](?=\s*\())(?:\s*\(\s*((?:\d+|[–—-])(?:\s*,\s*(?:\d+|[–—-]))*)\s*\)|((?:\s*\/\s*\d+)+))?/;

/** Read a sized number ("72", "72 (81, 90)", "72/81/90", "– (1, 2)") at the start of a slice. */
function readSized(src: Slice): { ref: SizedRef; length: number } | null {
  const m = SIZED_RE.exec(src.s);
  if (!m) return null;
  const dash = /^[–—-]$/.test(m[1]);
  if (dash && !m[2]) return null;
  const values: number[] = [dash ? 0 : num(m[1])];
  const spans: (Span | undefined)[] = [dash ? undefined : { start: src.at, end: src.at + m[1].length }];
  const rest = m[2] ?? m[3];
  if (rest) {
    // Find each further number with its exact offset.
    const restStart = m[0].indexOf(rest, m[1].length);
    const numRe = /\d+|[–—-]/g;
    let nm: RegExpExecArray | null;
    while ((nm = numRe.exec(rest))) {
      if (/^\d/.test(nm[0])) {
        values.push(num(nm[0]));
        const start = src.at + restStart + nm.index;
        spans.push({ start, end: start + nm[0].length });
      } else {
        values.push(0);
        spans.push(undefined);
      }
    }
  }
  return { ref: { values, spans }, length: m[0].length };
}

function readCount(src: Slice): { ref: SizedRef; length: number } | null {
  const sized = readSized(src);
  if (sized) return sized;
  const w = /^([a-z]+)/i.exec(src.s);
  if (w && WORD_NUMBERS[w[1].toLowerCase()] !== undefined) {
    return { ref: { values: [WORD_NUMBERS[w[1].toLowerCase()]] }, length: w[1].length };
  }
  return null;
}

const one = (): SizedRef => ({ values: [1] });
const zero = (): SizedRef => ({ values: [0] });

/** Split on commas/semicolons that are not inside brackets. */
function splitTop(src: Slice): Slice[] {
  const parts: Slice[] = [];
  let depth = 0;
  let last = 0;
  for (let i = 0; i < src.s.length; i++) {
    const c = src.s[i];
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth = Math.max(0, depth - 1);
    else if ((c === "," || c === ";") && depth === 0) {
      parts.push(slice(src, last, i));
      last = i + 1;
    }
  }
  parts.push(slice(src, last));
  return parts.map(trim).filter((p) => p.s.length > 0);
}

function matchingClose(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "(" || s[i] === "[") depth++;
    else if (s[i] === ")" || s[i] === "]") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

type RepeatSpec =
  | { kind: "times"; ref: SizedRef; more: boolean }
  | { kind: "toEnd"; leave: SizedRef }
  | { kind: "toMarker"; leave: SizedRef };

const MARKER_WORD = String.raw`(?:the\s+)?(?:next\s+)?(?:m|marker|st\s*marker|stitch\s+marker)`;
const TO_MARKER_RE = new RegExp(String.raw`^to\s+${MARKER_WORD}$`);
const BEFORE_MARKER_RE = new RegExp(String.raw`^to\s+(?:within\s+)?`);
const BEFORE_TAIL_RE = new RegExp(String.raw`^(?:st|sts|stitch|stitches)?\s*(?:before|from)\s+${MARKER_WORD}$`);

/** "to marker" (leave 0) or "to 2 sts before next marker" (leave 2), else null. */
function readMarkerSpec(t: Slice): SizedRef | null {
  const s = t.s.toLowerCase();
  if (TO_MARKER_RE.test(s)) return zero();
  const b = BEFORE_MARKER_RE.exec(s);
  if (!b) return null;
  const c = readSized(slice(t, b[0].length));
  if (!c) return null;
  return BEFORE_TAIL_RE.test(s.slice(b[0].length + c.length).trim()) ? c.ref : null;
}

/** Parse "to end", "to last 3 sts", "5 times", "4 more times", "around", "across". */
function readRepeatSpec(src: Slice): RepeatSpec | null {
  const t = stripTrailing(trim(src));
  const s = t.s.toLowerCase();
  if (/^(to end|to the end|across|around|to end of (row|rnd|round)|all around|to end of the (row|rnd|round))$/.test(s)) {
    return { kind: "toEnd", leave: zero() };
  }
  if (/^to (?:the )?last (st|stitch)$/.test(s)) return { kind: "toEnd", leave: one() };
  const mk = readMarkerSpec(t);
  if (mk) return { kind: "toMarker", leave: mk };
  const last = /^to (?:the )?last\s+/.exec(s);
  if (last) {
    const c = readSized(slice(t, last[0].length));
    if (!c) return null;
    const tail = s.slice(last[0].length + c.length).trim();
    if (!/^(st|sts|stitch|stitches)?$/.test(tail)) return null;
    return { kind: "toEnd", leave: c.ref };
  }
  const x = /^x\s*/.exec(s);
  const from = x ? x[0].length : 0;
  const c = readCount(slice(t, from));
  if (c) {
    const tail = s.slice(from + c.length).trim();
    if (x && tail === "") return { kind: "times", ref: c.ref, more: false };
    if (/^more times?$|^more time\(s\)$|^times more$/.test(tail)) return { kind: "times", ref: c.ref, more: true };
    if (/^(times?|time\(s\)|total|times in total|times total)$/.test(tail)) return { kind: "times", ref: c.ref, more: false };
    if (tail === "" && /^(once|twice|thrice)$/.test(s.slice(from, from + c.length))) {
      return { kind: "times", ref: c.ref, more: false };
    }
    if (/^more$/.test(tail) && /^(once|twice)/.test(s.slice(from))) return { kind: "times", ref: c.ref, more: true };
  }
  return null;
}

function addOne(ref: SizedRef): SizedRef {
  // "rep N more times" means N + 1 in total. The spans still point at N.
  return { values: ref.values.map((v) => v + 1), spans: ref.spans, offset: 1 };
}

const NOTE_RE = /^(turn|join( to work in the (rnd|round))?|being careful not to twist)$/i;
const PM_RE = /^(pm|place (a |new |unique |beginning of (rnd|round) )?(st |stitch )?marker|pm for (beg|beginning|end) of (rnd|round)|place marker for (beg|beginning|end) of (rnd|round)|replace marker( for new (beg|beginning|end) of (rnd|round))?)$/i;
const SM_RE = /^(sm|slip (the )?marker|sl m|slm)$/i;
const RM_RE = /^(rm|remove (the |unique |beginning of (rnd|round) |end of (rnd|round) )?marker|remove (unique )?(beg|end)-of-(rnd|round) marker)$/i;
const SHORT_ROW_RE = /\b(w&t|wrap and turn|w\s*&\s*t|turn work|german short row|gsr|mds)\b/i;

/** Parse one stitch item like "k2", "k2tog", "p to last 3 sts", "yo", "k2 (3, 4)". */
function readItem(src: Slice): Op {
  const t = stripTrailing(trim(src));
  const lower = t.s.toLowerCase().replace(/’/g, "'");

  if (NOTE_RE.test(lower)) return { t: "note", text: t.s };
  if (PM_RE.test(lower)) return { t: "marker", kind: "pm" };
  if (SM_RE.test(lower)) return { t: "marker", kind: "sm" };
  if (RM_RE.test(lower)) return { t: "marker", kind: "rm" };

  // Cast on / bind off inside a row.
  const co = /^(co|cast on)\s+/.exec(lower);
  if (co) {
    const c = readSized(slice(t, co[0].length));
    if (!c) throw new ReadError(`Couldn't read the cast-on count in "${t.s}"`);
    return { t: "co", n: c.ref };
  }
  const bo = /^(bo|bind off|cast off)\b\s*/.exec(lower);
  if (bo) {
    const rest = lower.slice(bo[0].length).trim();
    if (rest === "" || /^(all|all sts|all stitches|rem(aining)? sts|rem(aining)? stitches|remaining|loosely|all sts loosely|all stitches loosely|in pattern|in patt|all sts in pattern|knitwise|purlwise)\b/.test(rest) && !/^\d/.test(rest)) {
      return { t: "bo", n: "all" };
    }
    const c = readSized(slice(t, bo[0].length));
    if (!c) throw new ReadError(`Couldn't read the bind-off count in "${t.s}"`);
    return { t: "bo", n: c.ref };
  }

  // Whole-row shorthands: "knit", "purl across", "k to end", "p to last 3 sts".
  const whole = /^(k|p|knit|purl|ktbl|ptbl)\b(?:\s*(all sts|all stitches|every st|across|around|to end|to the end|to end of (?:row|rnd|round)|all the way around|1 (?:rnd|round)|(?:\s*)))?$/.exec(lower);
  if (whole && (whole[2] !== undefined || /^(knit|purl)$/.test(lower))) {
    const code = whole[1].startsWith("k") ? (whole[1] === "ktbl" ? "ktbl" : "k") : whole[1] === "ptbl" ? "ptbl" : "p";
    return { t: "toEnd", code, leave: zero() };
  }
  const toLastOne = /^([a-z0-9-]+?)\s+to (?:the )?last (?:st|stitch)$/.exec(lower);
  if (toLastOne) {
    const code = codeOf(toLastOne[1]);
    if (!code) throw new ReadError(`Unknown stitch "${toLastOne[1]}"`);
    return { t: "toEnd", code, leave: one() };
  }
  const toLast = /^([a-z0-9-]+?)\s+to (?:the )?last\s+/.exec(lower);
  if (toLast) {
    const code = codeOf(toLast[1]);
    if (!code) throw new ReadError(`Unknown stitch "${toLast[1]}"`);
    const c = readSized(slice(t, toLast[0].length));
    if (!c) throw new ReadError(`Couldn't read "to last" count in "${t.s}"`);
    const tail = lower.slice(toLast[0].length + c.length).trim();
    if (!/^(st|sts|stitch|stitches)?$/.test(tail)) throw new ReadError(`Couldn't read "${t.s}"`);
    return { t: "toEnd", code, leave: c.ref };
  }
  // "k to m", "p to 2 sts before next marker", "work in rib to marker".
  const toM = /^([a-z0-9-]+?)\s+(to\s.*)$/.exec(lower);
  if (toM) {
    const leave = readMarkerSpec(slice(t, toM[0].length - toM[2].length));
    if (leave) {
      const code = toM[1] === "knit" ? "k" : toM[1] === "purl" ? "p" : codeOf(toM[1]);
      if (!code) throw new ReadError(`Unknown stitch "${toM[1]}"`);
      return { t: "toMarker", code, leave };
    }
  }

  // Words: "knit 2", "purl 3", "slip 1", "knit 2 together".
  const words = lower
    .replace(/^knit (\d+) together$/, "k$1tog")
    .replace(/^purl (\d+) together$/, "p$1tog")
    .replace(/^knit\s+/, "k")
    .replace(/^purl\s+/, "p")
    .replace(/^slip\s+/, "sl");

  // Optional trailing repetition: "k2tog twice", "yo 3 times", "ssk x2".
  let body = words;
  let timesRef: SizedRef | null = null;
  const timesMatch = /\s+(?:(x\s*\d+)|(\d+\s*times?|twice|once|thrice))$/.exec(body);
  if (timesMatch) {
    const spec = readRepeatSpec({ s: timesMatch[0].trim(), at: t.at + timesMatch.index + (timesMatch[0].length - timesMatch[0].trimStart().length) });
    if (spec && spec.kind === "times" && !spec.more) {
      timesRef = spec.ref;
      body = body.slice(0, timesMatch.index);
    }
  }

  // Exact multi-letter codes (k2tog, ssk, yo, m1l...).
  const exact = codeOf(body.replace(/\s+/g, ""));
  if (exact && !/^[kp]\d+$/.test(body.replace(/\s+/g, ""))) {
    return { t: "st", code: exact, n: timesRef ?? one() };
  }

  // k2 / p12 / k 2 / k2 (3, 4) / ktbl forms: k1tbl, k2tbl / sl1, sl2 wyif.
  const tbl = /^([kp])\s*(\d+)?\s*tbl$/.exec(body);
  if (tbl) {
    const n = tbl[2] ? readSized(slice(t, body.indexOf(tbl[2])))!.ref : one();
    return { t: "st", code: tbl[1] === "k" ? "ktbl" : "ptbl", n };
  }
  const sl = /^sl\s*(\d+)?(?:\s*(?:st|sts))?(?:\s*(?:k|p|kwise|pwise|knitwise|purlwise))?(?:\s*wyi([fb]))?$/.exec(body);
  if (sl) {
    const code = sl[2] === "f" ? "sl-wyif" : sl[2] === "b" ? "sl-wyib" : "sl";
    if (!sl[1]) return { t: "st", code, n: timesRef ?? one() };
    const idx = lower.indexOf(sl[1], 2);
    return { t: "st", code, n: readSized(slice(t, idx))!.ref };
  }
  const kp = /^([kp])\s*(?=\d)/.exec(lower);
  if (kp) {
    const c = readSized(slice(t, kp[0].length));
    if (c) {
      const tail = lower.slice(kp[0].length + c.length).trim();
      if (tail === "" || /^(sts?|stitches)$/.test(tail)) {
        return { t: "st", code: kp[1], n: c.ref };
      }
    }
  }
  throw new ReadError(`Unknown instruction "${t.s}"`);
}

function codeOf(raw: string): string | undefined {
  const c = raw.toLowerCase();
  if (STITCHES[c]) return c;
  if (ALIASES[c] && STITCHES[ALIASES[c]]) return ALIASES[c];
  if (c === "knit") return "k";
  if (c === "purl") return "p";
  return undefined;
}

/** Parse a comma-separated stitch sequence, including * repeats and [ ] groups. */
function readSeq(src: Slice): Op[] {
  const t = trim(src);
  if (!t.s) return [];
  // * ... ; rep from * <spec> [, suffix]
  const star = topLevelIndex(t.s, "*");
  if (star >= 0) {
    const repRe = /rep(?:eat)?\s+from\s+\*\s*/gi;
    repRe.lastIndex = star + 1;
    const rm = repRe.exec(t.s);
    if (rm) {
      const prefix = slice(t, 0, star);
      const body = stripTrailing(slice(t, star + 1, rm.index));
      // The spec runs to the next top-level comma/semicolon.
      const afterSpec = slice(t, rm.index + rm[0].length);
      const parts = splitTop(afterSpec);
      const specText = parts[0] ?? { s: "", at: afterSpec.at };
      const spec = readRepeatSpec(specText);
      if (!spec) throw new ReadError(`Couldn't read the repeat "${t.s.slice(rm.index).split(/[,;]/)[0].trim()}"`);
      const bodyOps = readSeq(body);
      const suffixStart = specText.at + specText.s.length - t.at;
      const suffix = slice(t, suffixStart).s.replace(/^[\s,;]+/, "");
      const suffixSlice = { s: suffix, at: t.at + t.s.length - suffix.length };
      return [...readSeq(prefix), repeatOp(bodyOps, spec), ...readSeq(suffixSlice)];
    }
    // A lone star with no "rep from *" is a convention we don't support.
    throw new ReadError(`Found "*" without "rep from *"`);
  }
  const ops: Op[] = [];
  for (const part of splitTop(t)) {
    const p = part.s;
    if (p[0] === "[" || p[0] === "(") {
      const close = matchingClose(p, 0);
      if (close < 0) throw new ReadError(`Unclosed bracket in "${p}"`);
      const inner = slice(part, 1, close);
      const after = slice(part, close + 1);
      const spec = readRepeatSpec(after);
      if (!spec) throw new ReadError(`Couldn't read how often to repeat "${p}"`);
      ops.push(repeatOp(readSeq(inner), spec));
      continue;
    }
    ops.push(readItem(part));
  }
  return ops;
}

function repeatOp(body: Op[], spec: RepeatSpec): Op {
  if (spec.kind === "toEnd") return { t: "repEnd", body, leave: spec.leave };
  if (spec.kind === "toMarker") return { t: "repMarker", body, leave: spec.leave };
  return { t: "rep", body, times: spec.more ? addOne(spec.ref) : spec.ref };
}

function topLevelIndex(s: string, ch: string): number {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (c === ch && depth === 0) return i;
  }
  return -1;
}

/**
 * Pull a declared stitch count off the end of a row body:
 * "(72 sts)", "(72 (81, 90) sts)", "— 72 sts", "[72 sts rem]", ": 72 sts".
 */
function readDeclared(body: Slice): { rest: Slice; declared?: SizedRef } {
  const t = stripTrailing(trim(body));
  const s = t.s;
  const unitRe = /\s*(sts?|stitches)(\s+(rem|remain|remaining|on needle|on needles|total|in total|left))?\s*$/i;
  // Bracketed at the very end.
  if (s.endsWith(")") || s.endsWith("]")) {
    // Find the matching open bracket by scanning backwards.
    let depth = 0;
    for (let i = s.length - 1; i >= 0; i--) {
      if (s[i] === ")" || s[i] === "]") depth++;
      else if (s[i] === "(" || s[i] === "[") {
        depth--;
        if (depth === 0) {
          const inner = slice(t, i + 1, s.length - 1);
          const innerTrim = trim(inner);
          const unit = unitRe.exec(innerTrim.s);
          if (unit) {
            const num = readSized(innerTrim);
            const numText = innerTrim.s.slice(0, unit.index).trim();
            if (num && num.length === numText.length) {
              return { rest: stripTrailing(slice(t, 0, i)), declared: num.ref };
            }
          }
          break;
        }
      }
    }
  }
  // Dash / colon / comma form: "— 72 sts", ": 72 (81, 90) sts".
  const dash = /(?:\s[—–-]{1,2}\s*|:\s*|,\s*|\s=\s*)(\d[\d\s(),/]*?)\s*(sts?|stitches)(\s+(rem|remain|remaining|on needle|on needles|total|left))?\s*$/i.exec(s);
  if (dash) {
    const numStart = dash.index + dash[0].indexOf(dash[1]);
    const num = readSized(slice(t, numStart));
    if (num && num.length === dash[1].trim().length) {
      return { rest: stripTrailing(slice(t, 0, dash.index)), declared: num.ref };
    }
  }
  return { rest: t };
}

const ROW_HEAD_RE =
  /^((?:set-?up|foundation)\s+(?:row|rnd|round)|(?:next|dec(?:rease)?|inc(?:rease)?)\s+(?:row|rnd|round)|(?:row|rnd|round|r)s?)\s*(\d+)?(?:\s*(?:-|–|—|to|through|and)\s*(\d+))?(?:\s*\(\s*(\d+(?:\s*[-–—]\s*\d+)?(?:\s*,\s*\d+(?:\s*[-–—]\s*\d+)?)*)\s*\))?\s*(?:\(\s*(rs|ws)\s*\)|\[\s*(rs|ws)\s*\]|(rs|ws))?\s*[:.]\s*/i;

const ROW_REPEAT_RE =
  /^(?:rep(?:eat)?|work)\s+(?:as\s+(?:for\s+)?)?(?:(?:row|rnd|round)s?)\s+(\d+)(?:\s*(?:-|–|—|to|through|and)\s*(\d+))?(?:\s+(.*))?$/i;

const LAST_ROWS_RE =
  /^rep(?:eat)?\s+(?:the\s+)?last\s+(\d+|[a-z]+)\s+(rows?|rnds?|rounds?)\s+(.+?)$/i;

const ROWS_FROM_RE =
  /^rep(?:eat)?\s+(rows?|rnds?|rounds?)\s+(\d+)\s*(?:-|–|—|to|through|and)\s*(\d+)\s+(.+?)$/i;

const EVERY_RE =
  /^(row|rnd|round)\s+(\d+)\s*\(?\s*(?:and|&)\s+(?:all|every|each)\s+(?:(?:following|foll|subsequent|remaining|other)\s+)?(rs|ws|right[- ]side|wrong[- ]side|even[- ]numbered|odd[- ]numbered|even|odd)\s+(?:rows?|rnds?|rounds?)\s*\)?\s*(?:\(\s*(rs|ws)\s*\))?\s*[:.]\s*/i;

/** "Kid, Adult Small + Adult Large sizes only", "Sizes M and L only", "All sizes". */
const SIZES_ONLY_RE = /^(?:for\s+|in\s+)?(?:sizes?\s+)?(.+?)\s+(?:sizes?\s+)?only\s*[:.]?$/i;
const ALL_SIZES_RE = /^(?:for\s+|in\s+)?all\s+sizes\s*[:.]?$/i;

function sizeKey(name: string): string {
  return name.toLowerCase()
    .replace(/extra[\s-]*large/g, "xl").replace(/extra[\s-]*small/g, "xs")
    .replace(/\bsmall\b/g, "s").replace(/\bmedium\b/g, "m").replace(/\blarge\b/g, "l")
    .replace(/[^a-z0-9]/g, "");
}

const SECTION_HINT = /\b(k\d|p\d|knit|purl|k2tog|ssk|yo|rep|cast on|bind off|bo\b|co\b|row|rnd|round|stitch|sts|inc|dec|work even|continue)\b/i;

export interface ParseOptions {
  /** Sizes declared elsewhere (e.g. from a previous header). */
  sizes?: string[];
}

export function parsePattern(text: string, _opts: ParseOptions = {}): Program {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const rows: Row[] = [];
  const unread: Unread[] = [];
  let title: string | undefined;
  let sizeNames: string[] | undefined;
  let maxSizes = 1;
  let ignored = 0;
  let offset = 0;
  let lastNumber = 0;
  let round = false;
  let keySeq = 0;
  const byNumber = new Map<number, Row>();
  // "Row 2 and all WS rows: Purl." — rows of that parity left out later follow this row.
  let rule: { start: number; row: Row } | null = null;
  let skipFill = false;
  const ruleCovers = (n: number) => rule !== null && n > rule.start && (n - rule.start) % 2 === 0;

  const nextKey = () => `r${++keySeq}`;
  // While a "sizes only" section is open, rows apply to those sizes alone.
  let sectionOnly: boolean[] | null = null;
  const both = (a?: boolean[], b?: boolean[] | null): boolean[] | undefined => {
    if (!a) return b ?? undefined;
    if (!b) return a;
    const n = Math.max(a.length, b.length);
    return Array.from({ length: n }, (_, i) => (a.length === 1 ? a[0] : a[i]) && (b.length === 1 ? b[0] : b[i]));
  };

  const noteSizes = (ref?: SizedRef) => {
    if (ref) maxSizes = Math.max(maxSizes, ref.values.length);
  };
  const noteOps = (ops: Op[]) => {
    for (const op of ops) {
      if (op.t === "st" || op.t === "co") noteSizes(op.n);
      else if (op.t === "bo" && op.n !== "all") noteSizes(op.n);
      else if (op.t === "toEnd" || op.t === "toMarker") noteSizes(op.leave);
      else if (op.t === "rep") { noteSizes(op.times); noteOps(op.body); }
      else if (op.t === "repEnd" || op.t === "repMarker") { noteSizes(op.leave); noteOps(op.body); }
    }
  };

  const pushRow = (row: Row) => {
    if (rows.length >= MAX_ROWS) throw new ReadError(`Stitchproof checks up to ${MAX_ROWS.toLocaleString("en-US")} rows`);
    row.only = both(row.only, sectionOnly);
    if (row.only) {
      maxSizes = Math.max(maxSizes, row.only.length);
      const active = row.only.filter(Boolean).length;
      // "Adult S and Adult L sizes only: … (87 (95) sts)" gives one number per working size; spread them out.
      if (row.only.length > 1 && active > 1 && active < row.only.length) {
        const spread = (ref: SizedRef): SizedRef => {
          if (ref.values.length !== active) return ref;
          let k = 0;
          const values: number[] = [];
          const spans: (Span | undefined)[] = [];
          row.only!.forEach((on) => {
            values.push(on ? ref.values[k] : Number.NaN);
            spans.push(on ? ref.spans?.[k] : undefined);
            if (on) k++;
          });
          return { values, spans, offset: ref.offset };
        };
        const spreadOps = (ops: Op[]): Op[] => ops.map((op): Op => {
          switch (op.t) {
            case "st": case "co": return { ...op, n: spread(op.n) };
            case "bo": return op.n === "all" ? op : { ...op, n: spread(op.n) };
            case "toEnd": case "toMarker": return { ...op, leave: spread(op.leave) };
            case "rep": return { ...op, times: spread(op.times), body: spreadOps(op.body) };
            case "repEnd": case "repMarker": return { ...op, leave: spread(op.leave), body: spreadOps(op.body) };
            default: return op;
          }
        });
        row.ops = spreadOps(row.ops);
        if (row.declared) row.declared = spread(row.declared);
      }
    }
    // A row only the larger sizes work doesn't move the first size's row numbers.
    if (row.only && !row.only[0] && row.only.length > 1) {
      if (row.number !== null && !row.copyOf) row.label = `Extra ${row.round ? "rnd" : "row"}`;
      rows.push(row);
      return;
    }
    if (rule && row.number !== null && !skipFill) {
      for (let k = lastNumber + 1; k < row.number; k++) {
        if (!ruleCovers(k)) continue;
        const implied: Row = {
          ...rule.row, key: nextKey(), label: `${round ? "Rnd" : "Row"} ${k}`, number: k,
          declared: undefined, round, copyOf: rule.row.key,
        };
        rows.push(implied);
        byNumber.set(k, implied);
      }
    }
    if (row.number !== null) skipFill = false;
    rows.push(row);
    if (row.number !== null) {
      byNumber.set(row.number, row);
      lastNumber = row.number;
    }
  };

  const copyRows = (
    from: number, to: number, startNumber: number, count: number, line: number, source: string,
    declared?: SizedRef, onlyAt?: (i: number) => boolean[] | undefined, repeatRef?: SizedRef,
  ) => {
    const cycle: Row[] = [];
    for (let n = from; n <= to; n++) {
      const r = byNumber.get(n) ?? (ruleCovers(n) ? rule!.row : undefined);
      if (!r) throw new ReadError(`Row ${n} hasn't been defined yet`);
      cycle.push(r);
    }
    for (let i = 0; i < count; i++) {
      const src = cycle[i % cycle.length];
      const number = startNumber + i;
      pushRow({
        key: nextKey(),
        label: `${round ? "Rnd" : "Row"} ${number}`,
        number,
        line,
        side: src.side,
        round,
        ops: src.ops,
        declared: i === count - 1 ? declared : undefined,
        unverifiable: src.unverifiable,
        source,
        copyOf: src.key,
        only: both(src.only, onlyAt?.(i) ?? null),
        repeatRef,
      });
    }
  };

  const pushUntil = (li: number, source: string) => {
    pushRow({
      key: nextKey(), label: "Work to length", number: null, line: li, round, ops: [], source,
      unverifiable: "Worked to a measurement, so the number of rows isn't fixed",
    });
    skipFill = true;
  };

  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li];
    const lineAt = offset;
    offset += raw.length + 1;
    const line = trim({ s: raw, at: lineAt });
    const lower = line.s.toLowerCase();
    if (!line.s || /^(#|\/\/)/.test(line.s)) {
      ignored++;
      continue;
    }
    try {
      const titleM = /^title\s*:\s*(.+)$/i.exec(line.s);
      if (titleM) { title = titleM[1].trim(); ignored++; continue; }
      const sizesM = /^sizes?\s*:\s*(.+)$/i.exec(line.s);
      if (sizesM) {
        const names = sizesM[1]
          .replace(/[()]/g, ",")
          .split(/[,/]/)
          .map((x) => x.trim())
          .filter(Boolean);
        if (names.length) sizeNames = names;
        ignored++;
        continue;
      }

      if (ALL_SIZES_RE.test(stripTrailing(line).s)) { sectionOnly = null; ignored++; continue; }
      const onlyM = SIZES_ONLY_RE.exec(stripTrailing(line).s);
      if (onlyM && !ROW_HEAD_RE.test(line.s) && sizeNames) {
        const wanted = onlyM[1].split(/,|\+|&|\/|\band\b/i).map((x) => sizeKey(x)).filter(Boolean);
        const known = sizeNames.map(sizeKey);
        if (wanted.length && wanted.every((w) => known.includes(w))) {
          sectionOnly = known.map((k) => wanted.includes(k));
          ignored++;
          continue;
        }
        throw new ReadError(`Couldn't match "${onlyM[1]}" to the sizes ${sizeNames.join(", ")}`);
      }

      if (/\bin the (rnd|round)\b|\bjoin\b|\bcircular\b|\bdpns?\b/i.test(lower) && !ROW_HEAD_RE.test(line.s)) {
        round = round || /\bjoin\b|\bin the (rnd|round)\b/i.test(lower);
      }

      // Cast-on line.
      // "CO 88 sts." / "With smaller needle, cast on 88 (96) sts."
      const co = /^(?:(?:with|using)\b[^,.:;]{0,60},\s*)?(?:co|cast on)\s+/i.exec(line.s);
      if (co) {
        const c = readSized(slice(line, co[0].length));
        if (!c) throw new ReadError("Couldn't read the cast-on count");
        noteSizes(c.ref);
        const restLower = lower.slice(co[0].length + c.length);
        if (/\bjoin\b|\bin the (rnd|round)\b/.test(restLower)) round = true;
        pushRow({
          key: nextKey(), label: "Cast on", number: null, line: li, round,
          ops: [{ t: "co", n: c.ref }], declared: undefined, source: line.s,
        });
        continue;
      }

      // Bind-off / finishing line.
      if (/^(bo|bind off|cast off)\b/i.test(line.s)) {
        const ops = readSeq(line);
        noteOps(ops);
        pushRow({ key: nextKey(), label: "Bind off", number: null, line: li, round, ops, source: line.s });
        continue;
      }
      if (/^(cut|break) (the )?yarn\b/i.test(line.s)) {
        pushRow({
          key: nextKey(), label: "Finish", number: null, line: li, round,
          ops: [{ t: "bo", n: "all" }], source: line.s,
        });
        continue;
      }
      if (/^(join|pm|place (a )?marker)\b/i.test(line.s) && !SECTION_HINT.test(lower.replace(/\b(join|marker|rnd|round)\b/g, ""))) {
        round = true;
        ignored++;
        continue;
      }

      // "Rep last 2 rows 3 more times." / "Rep rows 1–2 four more times."
      const repLine = readDeclared(stripTrailing(line));
      const lastM = LAST_ROWS_RE.exec(stripTrailing(repLine.rest).s);
      const fromM = ROWS_FROM_RE.exec(stripTrailing(repLine.rest).s);
      const blockOf = () => {
        const n = lastM ? (/^\d+$/.test(lastM[1]) ? num(lastM[1]) : WORD_NUMBERS[lastM[1].toLowerCase()]) : 0;
        if (lastM && !n) throw new ReadError("Couldn't read how many rows to repeat");
        return lastM ? { from: lastNumber - n + 1, to: lastNumber } : { from: num(fromM![2]), to: num(fromM![3]) };
      };
      if ((lastM || fromM) && /\buntil\b/i.test(lastM ? lastM[3] : fromM![4])) {
        // "until 16 (20) sts rem": the count settles how many repeats, so it can be checked.
        const tail = lastM ? lastM[3] : fromM![4];
        const um = /\buntil\s+(?:there\s+are\s+)?(.+?)\s*(?:sts?|stitches)\s+(?:rem(?:ain)?s?|remaining|left|on (?:the )?needles?)\b/i.exec(tail);
        const untilAt = line.s.search(/\buntil\b/i);
        const target = um && readSized({ s: um[1], at: line.at + untilAt + um[0].indexOf(um[1], 5) });
        if (target && target.length === um![1].length) {
          const { from, to } = blockOf();
          const cycle: Row[] = [];
          for (let n = from; n <= to; n++) {
            const r = byNumber.get(n) ?? (ruleCovers(n) ? rule!.row : undefined);
            if (!r) throw new ReadError(`Row ${n} hasn't been defined yet`);
            cycle.push(r);
          }
          const count = target.ref;
          noteSizes(count);
          pushRow({
            key: nextKey(), label: `Rep to ${target.ref.values.join("/")} sts`, number: null, line: li, round,
            ops: [], source: line.s, declared: repLine.declared, until: { count, cycle },
          });
          skipFill = true;
          continue;
        }
        pushUntil(li, line.s);
        continue;
      }
      if (lastM || fromM) {
        const tail = lastM ? lastM[3] : fromM![4];
        const stripped = stripTrailing(repLine.rest);
        const spec = readRepeatSpec({ s: tail, at: stripped.at + stripped.s.lastIndexOf(tail) });
        if (!spec || spec.kind !== "times") throw new ReadError("Couldn't read how many times to repeat");
        const { from, to } = blockOf();
        noteSizes(repLine.declared);
        const len = to - from + 1;
        const counts = spec.ref.values;
        noteSizes(spec.ref);
        const total = Math.max(...counts) * len;
        // Each size repeats the block its own number of times; extra copies are skipped for smaller sizes.
        const onlyAt = counts.length > 1 ? (i: number) => counts.map((c) => Math.floor(i / len) < c) : undefined;
        copyRows(from, to, lastNumber + 1, total, li, line.s, repLine.declared, onlyAt, spec.ref);
        continue;
      }

      const unsure = /^unsure\s*:\s*(.*)$/i.exec(line.s);
      if (unsure) {
        unread.push({ line: li, text: unsure[1] || line.s, reason: "The AI reader wasn't sure how to translate this, so it wasn't guessed" });
        continue;
      }

      if (/^(work|continue|cont|knit|purl|rep(?:eat)?)\b.*\buntil\b/i.test(line.s) && !ROW_HEAD_RE.test(line.s)) {
        pushUntil(li, line.s);
        continue;
      }

      const every = EVERY_RE.exec(line.s);
      if (every) {
        const { rest, declared } = readDeclared(stripTrailing(trim(slice(line, every[0].length))));
        noteSizes(declared);
        const ops = readSeq(rest);
        noteOps(ops);
        if (ops.length === 0) throw new ReadError("No stitches in this row");
        const kind = every[1].toLowerCase();
        round = /rnd|round/.test(kind);
        const which = every[3].toLowerCase();
        const side = (every[4]?.toUpperCase() as Side | undefined) ?? (/^(ws|wrong)/.test(which) ? "WS" : /^(rs|right)/.test(which) ? "RS" : undefined);
        const number = num(every[2]);
        const row: Row = { key: nextKey(), label: `${round ? "Rnd" : "Row"} ${number}`, number, line: li, side, round, ops, declared, source: line.s };
        pushRow(row);
        rule = { start: number, row };
        continue;
      }

      const head = ROW_HEAD_RE.exec(line.s);
      if (!head) {
        if (SECTION_HINT.test(lower)) {
          unread.push({ line: li, text: line.s, reason: "Not in a row-by-row form Stitchproof can read offline" });
        } else {
          ignored++;
        }
        continue;
      }
      const kind = head[1].toLowerCase();
      if (/^(rnd|round)/.test(kind) || /(rnd|round)/.test(kind)) round = true;
      else if (/row/.test(kind)) round = false;
      // "Dec rnd:" / "Inc row:" without a number is simply the next row.
      const isNext = kind.startsWith("next") || (/^(dec|inc)/.test(kind) && !head[2]);
      const isSetup = /^(set|foundation)/.test(kind);
      const sideRaw = (head[5] ?? head[6] ?? head[7])?.toUpperCase() as Side | undefined;
      let start: number | null = head[2] ? num(head[2]) : null;
      let end: number | null = head[3] ? num(head[3]) : null;
      if (isNext) start = lastNumber + 1;
      if (start === null && !isSetup) throw new ReadError("Row number missing");
      if (end !== null && start !== null && end < start) throw new ReadError("Row range runs backwards");
      if (start !== null && end === null && /and/i.test(line.s.slice(0, head[0].length))) end = start;
      // "Rnds 13–40 (13–46, 13–52)": each size works its own number of rows.
      let perSize: number[] | null = null;
      if (head[4] && start !== null) {
        const firstLen = (end ?? start) - start + 1;
        const others = head[4].split(",").map((g) => {
          const [a, b] = g.split(/[-–—]/).map((x) => num(x.trim()));
          if (b !== undefined && b < a) throw new ReadError("Row range runs backwards");
          return b === undefined ? 1 : b - a + 1;
        });
        const lens = [firstLen, ...others];
        if (lens.some((l) => l !== firstLen)) perSize = lens;
      }

      const bodySlice = slice(line, head[0].length);
      const bodyStripped = stripTrailing(trim(bodySlice));

      // Short rows / work-to-measurement can't be settled by counting.
      const unverifiable = SHORT_ROW_RE.test(bodyStripped.s)
        ? "Short rows leave stitches unworked on purpose"
        : /\buntil\b.*\b(in|cm|inches|mm)\b/i.test(bodyStripped.s)
          ? "Worked to a measurement, so the number of rows isn't fixed"
          : undefined;

      // "Rows 3–12: rep rows 1–2."
      const pre = readDeclared(bodyStripped);
      const rr = ROW_REPEAT_RE.exec(stripTrailing(pre.rest).s);
      if (rr) {
        const from = num(rr[1]);
        const to = rr[2] ? num(rr[2]) : from;
        const { declared } = pre;
        noteSizes(declared);
        const count = perSize ? Math.max(...perSize) : end !== null && start !== null ? end - start + 1 : 1;
        const lens = perSize;
        copyRows(from, to, start ?? lastNumber + 1, count, li, line.s, declared, lens ? (i) => lens.map((l) => i < l) : undefined);
        continue;
      }

      const { rest, declared } = readDeclared(bodyStripped);
      noteSizes(declared);
      let ops: Op[] = [];
      let rowUnverifiable = unverifiable;
      if (!rowUnverifiable) {
        try {
          ops = readSeq(rest);
        } catch (e) {
          if (e instanceof ReadError && e.message.startsWith("UNVERIFIABLE:")) {
            rowUnverifiable = e.message.slice("UNVERIFIABLE:".length);
          } else throw e;
        }
      }
      noteOps(ops);
      if (!rowUnverifiable && ops.length === 0) throw new ReadError("No stitches in this row");
      const count = perSize ? Math.max(...perSize) : end !== null && start !== null ? end - start + 1 : 1;
      for (let i = 0; i < count; i++) {
        const number = start === null ? null : start + i;
        const label = isSetup
          ? `Setup ${round ? "rnd" : "row"}`
          : `${round ? "Rnd" : "Row"} ${number}`;
        pushRow({
          key: nextKey(),
          label,
          number,
          line: li,
          side: sideRaw,
          round,
          ops,
          declared: i === count - 1 ? declared : undefined,
          unverifiable: rowUnverifiable,
          source: line.s,
          copyOf: i > 0 ? rows[rows.length - i]?.key : undefined,
          only: perSize ? perSize.map((l) => i < l) : undefined,
        });
      }
    } catch (e) {
      if (e instanceof ReadError) {
        unread.push({ line: li, text: line.s, reason: e.message });
      } else {
        throw e;
      }
    }
  }

  const nSizes = Math.max(maxSizes, sizeNames?.length ?? 1);
  const sizes =
    sizeNames && sizeNames.length === nSizes
      ? sizeNames
      : nSizes === 1
        ? [sizeNames?.[0] ?? "One size"]
        : Array.from({ length: nSizes }, (_, i) => sizeNames?.[i] ?? `Size ${i + 1}`);

  // Every sized group must have one value or one per size.
  const badSize = (ref?: SizedRef) => ref && ref.values.length !== 1 && ref.values.length !== nSizes;
  const checkOps = (ops: Op[]): boolean =>
    ops.some((op) =>
      op.t === "st" || op.t === "co" ? badSize(op.n)
        : op.t === "bo" ? op.n !== "all" && badSize(op.n)
          : op.t === "toEnd" || op.t === "toMarker" ? badSize(op.leave)
            : op.t === "rep" ? badSize(op.times) || checkOps(op.body)
              : op.t === "repEnd" || op.t === "repMarker" ? badSize(op.leave) || checkOps(op.body)
                : false,
    );
  const goodRows: Row[] = [];
  for (const r of rows) {
    if (checkOps(r.ops) || badSize(r.declared) || (r.only && r.only.length !== 1 && r.only.length !== nSizes)) {
      if (!unread.some((u) => u.line === r.line)) {
        unread.push({ line: r.line, text: r.source, reason: `Expected ${nSizes} sizes in every size group` });
      }
    } else goodRows.push(r);
  }
  unread.sort((a, b) => a.line - b.line);

  return { title, sizes, rows: goodRows, unread, ignored };
}

/** Value of a sized ref for size i. */
export function at(ref: SizedRef, i: number): number {
  return ref.values.length === 1 ? ref.values[0] : ref.values[i];
}
