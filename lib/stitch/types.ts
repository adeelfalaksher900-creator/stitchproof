/** One value per size. Length 1 means "the same for every size". */
export type Sized = number[];

/** Where a number lives in the source text, so a fix can edit it in place. */
export interface Span {
  start: number;
  end: number;
}

/** A sized number with the source span of each of its values (when known). */
export interface SizedRef {
  values: Sized;
  spans?: (Span | undefined)[];
  /** Written value = value - offset (e.g. "rep 4 more times" is 5 in total, offset 1). */
  offset?: number;
}

export type Op =
  /** A stitch worked n times, e.g. k2, k2tog, yo. */
  | { t: "st"; code: string; n: SizedRef }
  /** A stitch worked until `leave` stitches remain, e.g. "k to end", "p to last 3 sts". */
  | { t: "toEnd"; code: string; leave: SizedRef }
  /** A group repeated a fixed number of times, e.g. [k1, p1] 5 times. */
  | { t: "rep"; body: Op[]; times: SizedRef }
  /** A group repeated until `leave` stitches remain, e.g. *k2, p2; rep from * to end. */
  | { t: "repEnd"; body: Op[]; leave: SizedRef }
  /** Cast on n stitches (adds stitches without using any). */
  | { t: "co"; n: SizedRef }
  /** Bind off n stitches, or all of them. */
  | { t: "bo"; n: SizedRef | "all" }
  /** A stitch worked until `leave` stitches remain before the next marker, e.g. "k to 2 sts before m". */
  | { t: "toMarker"; code: string; leave: SizedRef }
  /** A group repeated until `leave` stitches remain before the next marker, e.g. *p1, k1; rep from * to m. */
  | { t: "repMarker"; body: Op[]; leave: SizedRef }
  /** Place, slip or remove a stitch marker. */
  | { t: "marker"; kind: "pm" | "sm" | "rm" }
  /** A zero-effect instruction we understood, e.g. turn work. */
  | { t: "note"; text: string };

export type Side = "RS" | "WS";

export interface Row {
  /** Stable key, e.g. "r12". Expanded row repeats get their own key. */
  key: string;
  /** Display label, e.g. "Row 12" or "Rnd 3". */
  label: string;
  /** Row number as written (or position for setup lines). */
  number: number | null;
  /** 0-based source line index. */
  line: number;
  side?: Side;
  round: boolean;
  ops: Op[];
  declared?: SizedRef;
  /** Set when the row contains something counting can't settle. */
  unverifiable?: string;
  /** Source text of the line, trimmed. */
  source: string;
  /** For rows expanded from "Rows a–b: rep rows c–d", the key of the row it copies. */
  copyOf?: string;
  /** Which sizes work this row (one flag per size). Absent: every size. */
  only?: boolean[];
  /** "Rep last 2 rnds until 16 sts rem": these rows, repeated until the count is reached. */
  until?: { count: SizedRef; cycle: Row[] };
}

export interface Unread {
  line: number;
  text: string;
  reason: string;
}

export interface Program {
  title?: string;
  sizes: string[];
  rows: Row[];
  unread: Unread[];
  /** Number of source lines that were blank or headers (for honesty in the UI). */
  ignored: number;
}

export type RowStatus = "ok" | "issue" | "warn" | "unverifiable" | "skipped";

export interface IssueMessage {
  kind:
    | "declared-mismatch"
    | "not-enough"
    | "repeat-uneven"
    | "unworked"
    | "negative"
    | "no-stitches";
  text: string;
}

export interface RowResult {
  key: string;
  before: number;
  uses: number;
  makes: number;
  after: number;
  declared?: number;
  status: RowStatus;
  messages: IssueMessage[];
  /** Repeat counts solved for "to end" groups, in order, for explanations. */
  solved: number[];
  /** Sequence of stitch kinds made, for the stitch strip (capped). */
  strip: StripMark[];
  /** Marker positions after the row, counted from the start of the next row. */
  markers?: number[];
}

export type StripMark = "k" | "p" | "inc" | "decL" | "decR" | "decC" | "yo" | "sl" | "bo" | "co";

export interface SizeResult {
  size: string;
  rows: RowResult[];
  issues: number;
  warnings: number;
  unverifiable: number;
  finalCount: number;
}
