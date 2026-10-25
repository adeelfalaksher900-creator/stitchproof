import { ALIASES, STITCHES } from "./stitches";
import type { Op, Program, Row, Side, SizedRef, Span, StitchChange, Unread } from "./types";

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
// Decimals are read too ("3 (3.5, 4) times"), so the counter can say they can't be knitted.
const SIZED_RE = /^(\d+(?:\.\d+)?|[–—-](?=\s*\())(?:\s*\(\s*((?:\d+(?:\.\d+)?|[–—-])(?:\s*,\s*(?:\d+(?:\.\d+)?|[–—-]))*)\s*\)|((?:\s*\/\s*\d+)+))?/;

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
    const numRe = /\d+(?:\.\d+)?|[–—-]/g;
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
    // "one (2, 3, 4) more times": a word for the first size, digits for the rest.
    const g = /^\s*\(([\s\d,–—-]*)\)/.exec(src.s.slice(w[1].length));
    if (g) {
      const values = [WORD_NUMBERS[w[1].toLowerCase()]];
      const spans: (Span | undefined)[] = [undefined];
      let pos = w[1].length + g[0].indexOf("(") + 1;
      for (const part of g[1].split(",")) {
        const m = /\d+|[–—-]/.exec(part);
        if (!m) return null;
        const dash = !/\d/.test(m[0]);
        values.push(dash ? 0 : num(m[0]));
        spans.push(dash ? undefined : { start: src.at + pos + m.index, end: src.at + pos + m.index + m[0].length });
        pos += part.length + 1;
      }
      return { ref: { values, spans }, length: w[1].length + g[0].length };
    }
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
  const c = readCount(slice(t, b[0].length));
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

const NOTE_RE = /^(turn|join( to work in the (rnd|round))?|being careful not to twist|omitting (?:the )?(?:final|last) (?:stitch )?marker.*|slipping (?:the )?markers?(?: as you (?:come to|reach|get to) them)?|(?:with|using|change to|switch to) (?:the )?(?:[a-z]+ ){0,2}(?:yarn|colou?r(?: [a-z])?|mc|cc|main colou?r|contrast colou?r))$/i;
const PM_RE = /^(pm|place (a |new |unique |beginning of (rnd|round) )?(st |stitch )?marker|pm for (beg|beginning|end) of (rnd|round)|place marker for (beg|beginning|end) of (rnd|round)|replace marker( for new (beg|beginning|end) of (rnd|round))?)$/i;
const SM_RE = /^(sm|slip (the )?marker|sl m|slm)$/i;
const RM_RE = /^(rm|remove (the |unique |beginning of (rnd|round) |end of (rnd|round) )?marker|remove (unique )?(beg|end)-of-(rnd|round) marker)$/i;
const SHORT_ROW_RE = /\b(w&t|wrap and turn|w\s*&\s*t|turn work|german short row|gsr|mds)\b/i;

/** Parse one stitch item like "k2", "k2tog", "p to last 3 sts", "yo", "k2 (3, 4)". */
function readItem(src: Slice): Op {
  const t = stripTrailing(trim(src));
  const lower = t.s.toLowerCase().replace(/’/g, "'");

  if (NOTE_RE.test(lower)) return { t: "note", text: t.s };
  // "knit 2 together (k2tog)", "place marker (pm)": the abbreviation in brackets says what it is.
  const gloss = /^(.+?)\s*\(\s*([a-z0-9]+)\s*\)$/.exec(lower);
  if (gloss && (codeOf(gloss[2]) || /^(pm|sm|rm)$/.test(gloss[2]))) {
    const g = gloss[2];
    if (g === "pm" || g === "sm" || g === "rm") return { t: "marker", kind: g };
    return { t: "st", code: codeOf(g)!, n: one() };
  }
  // "pm (place marker)", "end-of-round marker": the gloss and hyphens don't change the meaning.
  const markerWords = lower.replace(/\s*\((?:place|slip|remove)(?: a)? marker\)/g, "").replace(/-of-/g, " of ");
  if (PM_RE.test(markerWords)) return { t: "marker", kind: "pm" };
  if (SM_RE.test(markerWords)) return { t: "marker", kind: "sm" };
  if (RM_RE.test(markerWords)) return { t: "marker", kind: "rm" };

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
  // "Work in established pattern", "work even", "cont in rib as set": the count carries over.
  if (/^(?:work|cont(?:inue)?)\s+(?:all\s+(?:sts|stitches)\s+)?(?:even|as (?:established|set)|(?:even\s+)?in\s+(?:the\s+)?(?:established\s+)?(?:\d+x\d+\s+)?(?:rib\s+)?(?:patt(?:ern)?|rib(?:bing)?|st(?:itch)? patt(?:ern)?)(?:\s+as\s+(?:established|set))?)(?:\s+(?:to end|across|around))?$/.test(lower)) {
    return { t: "toEnd", code: "patt", leave: zero() };
  }
  // "work in pattern to 2 stitches before next marker"
  const pattTo = /^(?:work|cont(?:inue)?) in (?:the )?(?:established )?(?:rib )?(?:patt(?:ern)?|rib(?:bing)?) (to\s.*)$/.exec(lower);
  if (pattTo) {
    const leave = readMarkerSpec(slice(t, lower.length - pattTo[1].length));
    if (leave) return { t: "toMarker", code: "patt", leave };
    const spec = readRepeatSpec(slice(t, lower.length - pattTo[1].length));
    if (spec?.kind === "toEnd") return { t: "toEnd", code: "patt", leave: spec.leave };
  }
  // "k2tog around", "kfb in each st", "ssk across": that stitch repeated to the end.
  const each = /^([a-z0-9&-]+)\s+(?:around|across|to (?:the )?end|all around|in(?:to)? (?:each|every) st(?:itch)?(?:\s+(?:to end|around|across))?)$/.exec(lower);
  if (each) {
    const code = codeOf(each[1]);
    if (code) return { t: "repEnd", body: [{ t: "st", code, n: one() }], leave: zero() };
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

  // Knitting a hem closed: "slip tip of left needle under purl bump …" picks up, "knit next stitch and picked-up stitch together".
  if (/^(?:slip|insert|put)\b.*\b(?:purl bump|cast-on edge|cast-on stitch)/.test(lower)) return { t: "note", text: t.s };
  if (/^knit (?:the )?next st(?:itch)? (?:and|together with) (?:the |its )?picked[- ]up st(?:itch)?(?: together)?$/.test(lower)) return { t: "st", code: "k", n: one() };
  // "Slip slip knit", spelled out.
  const spelled = /^slip,?\s+slip,?\s+(knit|purl)$/.exec(lower);
  if (spelled) return { t: "st", code: spelled[1] === "knit" ? "ssk" : "ssp", n: one() };
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
  const kp = /^([kp])\s*(?=\d)/.exec(lower) ?? /^(k)nit\s+(?=\d)|^(p)url\s+(?=\d)/.exec(lower);
  if (kp) {
    const c = readSized(slice(t, kp[0].length));
    if (c) {
      const tail = lower.slice(kp[0].length + c.length).trim();
      if (tail === "" || /^(sts?|stitches)$/.test(tail)) {
        return { t: "st", code: kp[1] ?? kp[2], n: c.ref };
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
  const raw = trim(src);
  // A missing comma after an abbreviation in brackets, "ssk (ssk) knit to …": ") " becomes ")," (same length, same offsets).
  const t = { s: raw.s.replace(/(\(\s*[a-z0-9]+\s*\)) (?=[a-z])/gi, "$1,"), at: raw.at };
  if (!t.s) return [];
  // "Remove end-of-round marker, k1, replace marker for new end-of-round, …": the round now starts one stitch on.
  // Those stitches finish the previous round, so they don't count against this one.
  const shift = /^remove (?:the |unique )*(?:(?:end|beg(?:inning)?)[- ]of[- ](?:rnd|round) )?marker,\s*[kps]l?\s*\d+[^,]*,\s*(?:re)?place (?:the |unique |new )*marker(?: for (?:the )?new (?:end|beg(?:inning)?)[- ]of[- ](?:rnd|round))?\s*(?:,\s*|$)/i.exec(t.s);
  if (shift) return [{ t: "note", text: "Move the start of the round" }, ...readSeq(slice(t, shift[0].length))];
  // "K1, p1 rib" / "k2, p2 ribbing to end": that pair repeated across the row.
  const rib = /^(.*?[^\s,])\s+rib(?:bing)?(?:\s+(?:to end|across|around))?$/i.exec(t.s);
  if (rib && !t.s.includes("*")) return [{ t: "repEnd", body: readSeq(slice(t, 0, rib[1].length)), leave: zero() }];
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
    // "*K2, p2* rep to end" / "*k1, p1*, repeat across": the second star closes the repeat.
    const close = t.s.indexOf("*", star + 1);
    if (close > star) {
      const after = slice(t, close + 1);
      const specText = after.s.replace(/^[\s,;]*(?:rep(?:eat)?(?:\s+from\s+\*(?:\s+to\s+\*)?)?)?\s*/i, "");
      const parts = splitTop({ s: specText, at: after.at + after.s.length - specText.length });
      const spec = parts[0] ? readRepeatSpec(parts[0]) : null;
      if (spec) {
        const rest = parts.slice(1).map((p) => readSeq(p)).flat();
        return [...readSeq(slice(t, 0, star)), repeatOp(readSeq(slice(t, star + 1, close)), spec), ...rest];
      }
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
// In a stated count, a dash means "this size doesn't say" ("– (8, 16) sts"), not zero stitches.
const dashUnstated = (ref: SizedRef): SizedRef => ({ ...ref, values: ref.values.map((v, i) => (ref.spans?.[i] ? v : Number.NaN)) });

function readDeclared(body: Slice): { rest: Slice; declared?: SizedRef; change?: StitchChange } {
  const t = stripTrailing(trim(body));
  const s = t.s;
  // "[6 stitch markers placed, …]" is a note, not a count.
  const note = /\s*[[(][^\][()]*\bmarkers?\b[^\][()]*[\])]$/i.exec(s);
  if (note) return readDeclared(slice(t, 0, note.index));
  // "[6 stitches decreased]", "(8 sts dec'd)", "[2 sts inc'd]": how much the row changes the count.
  const change = /[[(]\s*([\d\s(),/–—-]+?)\s*(?:sts?|stitches)\s+(dec(?:reased|'d|’d)?|inc(?:reased|'d|’d)?)\s*[\])]$/i.exec(s);
  if (change) {
    const numAt = change.index + change[0].indexOf(change[1]);
    const num = readSized(slice(t, numAt));
    if (num && num.length === change[1].trim().length) {
      // "(12 (18, 18) sts) [12 sts decreased]" states both; keep both.
      const inner = readDeclared(slice(t, 0, change.index));
      return { ...inner, change: { ref: num.ref, sign: /^dec/i.test(change[2]) ? -1 : 1 } };
    }
  }
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
              // "[12 sts decreased] (60 sts)": a stated change may come before the count.
              const before = readDeclared(slice(t, 0, i));
              return { rest: before.rest, declared: dashUnstated(num.ref), change: before.change };
            }
          }
          break;
        }
      }
    }
  }
  // Dash / colon / comma form: "— 72 sts", ": 72 (81, 90) sts".
  const dash = /(?:\s[—–-]{1,2}\s*|:\s*|,\s*|\s=\s*|\.\s+|;\s*)(\d[\d\s(),/]*?)\s*(sts?|stitches)(\s+(rem|remain|remaining|on needle|on needles|total|left))?\s*$/i.exec(s);
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
      // Only inside a "sizes only" section: a count at the end of a per-size repeat block holds for every size.
      if (sectionOnly && row.only.length > 1 && active > 0 && active < row.only.length) {
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
      // Still findable by number, so "Rep rows 2–3" inside that section works.
      if (row.number !== null && !row.copyOf) byNumber.set(row.number, row);
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
        // Copies of rows only larger sizes work keep that label; their numbers follow the first size.
        label: src.label.startsWith("Extra") ? src.label : `${round ? "Rnd" : "Row"} ${number}`,
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

  // Lines folded into the row above them (see below).
  const joined = new Set<number>();
  const startsRow = /^\s*(?:[•·▪◦‣–-]\s*)?(?:(?:set-?up|foundation|next|dec(?:rease)?|inc(?:rease)?)\s+)?(?:rows?\b|rnds?\b|rounds?\b|r\d|co\b|cast on\b|rep(?:eat)?\b)/i;
  for (let li = 0; li < lines.length; li++) {
    let raw = lines[li];
    const lineAt = offset;
    offset += raw.length + 1;
    if (joined.has(li)) { ignored++; continue; }
    // A row broken over lines when copied from a PDF: the break becomes a space, so every character keeps its offset.
    for (let n = li + 1; n < lines.length && startsRow.test(raw) && !/[.:;)\]]\s*$/.test(raw) && /^\s*[a-z0-9*[(]/.test(lines[n]) && !startsRow.test(lines[n]); n++) {
      raw += " " + lines[n];
      joined.add(n);
    }
    // Bullets in front of a row ("• Row 1: …") aren't part of it.
    const bullet = /^\s*[•·▪◦‣]\s*/.exec(raw) ?? (/^\s*[–-]\s+(?=\S)/.exec(raw) && startsRow.test(raw) ? /^\s*[–-]\s+/.exec(raw) : null);
    const lineRaw = bullet ? trim({ s: raw.slice(bullet[0].length), at: lineAt + bullet[0].length }) : trim({ s: raw, at: lineAt });
    // "With Color B, repeat Round 1 …", "With MC, continue knitting …": the yarn named doesn't change the count.
    const lead = /^with\b[^,]{0,40},\s*(?=(?:rep(?:eat)?|knit|purl|work|cont(?:inue)?|cast|co|loosely)\b)/i.exec(lineRaw.s);
    const line = lead ? slice(lineRaw, lead[0].length) : lineRaw;
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
        // "S (M, L)", "S, M, L", "32 (36, 40)\" chest": text after the group (a unit) isn't another size.
        const group = /^(.*?)\s*\(([^)]*)\)/.exec(sizesM[1]);
        const names = (group ? [group[1], ...group[2].split(/[,/]/)] : sizesM[1].split(/[,/]/))
          .map((x) => x.trim())
          .filter(Boolean);
        if (names.length) sizeNames = names;
        ignored++;
        continue;
      }

      // A bare size line before the cast-on: "Baby (Kid, Adult Small, Adult Medium, Adult Large)".
      const bareSizes = !sizeNames && rows.length === 0 && /^([A-Za-z][\w .'’/+-]*?)\s*\(([^()]*,[^()]*)\)\s*$/.exec(line.s);
      if (bareSizes && !SECTION_HINT.test(lower) && !/\d\s*(?:"|”|in\b|cm\b|inches)/i.test(line.s)) {
        sizeNames = [bareSizes[1], ...bareSizes[2].split(",")].map((x) => x.trim()).filter(Boolean);
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
      const co = /^(?:(?:with|using)\b[^,.:;]{0,60},\s*)?(?:loosely\s+|provisionally\s+)?(?:co|cast on|cast(?=\s+\d))\s+/i.exec(line.s);
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
      // "Place unique stitch marker and join for working in the round, being careful not to twist the stitches."
      const joinLine = /^(?:place|pm)\b[^.]*\bmarker\b[^.]*\bjoin\b|^join\b[^.]*\b(?:rnd|round)\b/i.test(line.s) && !/\d/.test(line.s);
      if (joinLine || (/^(join|pm|place (a )?marker)\b/i.test(line.s) && !SECTION_HINT.test(lower.replace(/\b(join|marker|rnd|round)\b/g, "")))) {
        round = true;
        ignored++;
        continue;
      }

      // "Rep last 2 rows 3 more times." / "Rep rows 1–2 four more times."
      // "Repeat Round 1 for 4 (6, 6, 6) more rounds", "repeat Rounds 1–2 for 12 rounds".
      const forM = /^rep(?:eat)?\s+(?:rows?|rnds?|rounds?)\s+(\d+)(?:\s*(?:-|–|—|to|through|and)\s*(\d+))?\s+for\s+(.+?)\s+(?:more\s+)?(?:rows?|rnds?|rounds?)(?:\s+more)?$/i.exec(stripTrailing(line).s.replace(/\.\s.*$/, ""));
      if (forM) {
        const c = readCount({ s: forM[3], at: line.at + line.s.indexOf(forM[3], forM[0].indexOf("for")) });
        if (!c || c.length !== forM[3].length) throw new ReadError("Couldn't read how many rows to work");
        noteSizes(c.ref);
        const counts = c.ref.values;
        copyRows(num(forM[1]), forM[2] ? num(forM[2]) : num(forM[1]), lastNumber + 1, Math.max(...counts), li, line.s, undefined,
          counts.length > 1 ? (i) => counts.map((n) => i < n) : undefined, c.ref);
        continue;
      }
      // "Knit 7 rows even", "Purl 2 (3, 4) rounds".
      const knitN = /^(knit|purl)\s+(.+?)\s+(?:rows?|rnds?|rounds?)(?:\s+even)?$/i.exec(stripTrailing(line).s);
      const knitCount = knitN ? readCount({ s: knitN[2], at: line.at + knitN[1].length + 1 }) : null;
      if (knitN && knitCount && knitCount.length === knitN[2].length) {
        noteSizes(knitCount.ref);
        const counts = knitCount.ref.values;
        const total = Math.max(...counts);
        for (let i = 0; i < total; i++) {
          const number = lastNumber + 1;
          pushRow({
            key: nextKey(), label: `${round ? "Rnd" : "Row"} ${number}`, number, line: li, round, source: line.s,
            ops: [{ t: "toEnd", code: /^k/i.test(knitN[1]) ? "k" : "p", leave: zero() }],
            copyOf: i > 0 ? rows[rows.length - 1]?.key : undefined,
            only: counts.length > 1 ? counts.map((n) => i < n) : undefined,
          });
        }
        continue;
      }
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

      if ((/^(work|continue|cont|knit|purl|rep(?:eat)?)\b.*\buntil\b/i.test(line.s) || /\b(?:knit|purl|work)(?:ing|ting)?\b.*\b(?:until|for)\b.*\b(?:measures?|inches|in|cm)\b/i.test(line.s) || /^rep(?:eat)?\b.*\bfor\b.*\b(?:inches|in|cm)\b/i.test(line.s)) && !ROW_HEAD_RE.test(line.s)) {
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
        // Once the stitches are bound off, loose lines are finishing notes (weaving in, duplicate stitch).
        const finished = rows.length > 0 && rows[rows.length - 1].ops.some((o) => o.t === "bo" && o.n === "all");
        // "NOTE: change to double pointed needles…", "Fold the cast-on edge up…": guidance, not stitches.
        const aside = /^(?:note|tip|hint|samples?)\b|^fold\b/i.test(line.s);
        if (SECTION_HINT.test(lower) && !finished && !aside) {
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

      const { rest, declared, change } = readDeclared(bodyStripped);
      noteSizes(declared);
      noteSizes(change?.ref);
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
          change: i === 0 ? change : undefined,
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
