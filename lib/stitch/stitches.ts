import type { StripMark } from "./types";

export interface StitchDef {
  /** Stitches taken off the left needle. */
  uses: number;
  /** Stitches put on the right needle. */
  makes: number;
  name: string;
  mark: StripMark;
}

/**
 * Every stitch is defined by how many stitches it uses and how many it makes.
 * That single idea is enough to count any row of knitting.
 */
export const STITCHES: Record<string, StitchDef> = {
  k: { uses: 1, makes: 1, name: "knit", mark: "k" },
  p: { uses: 1, makes: 1, name: "purl", mark: "p" },
  ktbl: { uses: 1, makes: 1, name: "knit through the back loop", mark: "k" },
  ptbl: { uses: 1, makes: 1, name: "purl through the back loop", mark: "p" },
  sl: { uses: 1, makes: 1, name: "slip", mark: "sl" },
  "sl-wyif": { uses: 1, makes: 1, name: "slip with yarn in front", mark: "sl" },
  "sl-wyib": { uses: 1, makes: 1, name: "slip with yarn in back", mark: "sl" },
  k2tog: { uses: 2, makes: 1, name: "knit 2 together (right-leaning decrease)", mark: "decR" },
  p2tog: { uses: 2, makes: 1, name: "purl 2 together", mark: "decR" },
  ssk: { uses: 2, makes: 1, name: "slip, slip, knit (left-leaning decrease)", mark: "decL" },
  ssp: { uses: 2, makes: 1, name: "slip, slip, purl", mark: "decL" },
  skp: { uses: 2, makes: 1, name: "slip 1, knit 1, pass slipped stitch over", mark: "decL" },
  k3tog: { uses: 3, makes: 1, name: "knit 3 together", mark: "decR" },
  p3tog: { uses: 3, makes: 1, name: "purl 3 together", mark: "decR" },
  sssk: { uses: 3, makes: 1, name: "slip, slip, slip, knit", mark: "decL" },
  sk2p: { uses: 3, makes: 1, name: "slip 1, knit 2 together, pass slipped stitch over", mark: "decC" },
  s2kp: { uses: 3, makes: 1, name: "centred double decrease", mark: "decC" },
  cdd: { uses: 3, makes: 1, name: "centred double decrease", mark: "decC" },
  yo: { uses: 0, makes: 1, name: "yarn over", mark: "yo" },
  m1: { uses: 0, makes: 1, name: "make 1", mark: "inc" },
  m1l: { uses: 0, makes: 1, name: "make 1 left", mark: "inc" },
  m1r: { uses: 0, makes: 1, name: "make 1 right", mark: "inc" },
  m1p: { uses: 0, makes: 1, name: "make 1 purlwise", mark: "inc" },
  kfb: { uses: 1, makes: 2, name: "knit front and back (increase)", mark: "inc" },
  pfb: { uses: 1, makes: 2, name: "purl front and back (increase)", mark: "inc" },
  kyok: { uses: 1, makes: 3, name: "knit, yarn over, knit into the same stitch", mark: "inc" },
  kfbf: { uses: 1, makes: 3, name: "knit front, back and front (double increase)", mark: "inc" },
  lli: { uses: 0, makes: 1, name: "left lifted increase", mark: "inc" },
  rli: { uses: 0, makes: 1, name: "right lifted increase", mark: "inc" },
  // Passing a slipped stitch over takes one stitch off the right needle.
  psso: { uses: 0, makes: -1, name: "pass the slipped stitch over", mark: "decL" },
};

/** Aliases a knitter might write, mapped to canonical codes. */
export const ALIASES: Record<string, string> = {
  knit: "k",
  purl: "p",
  k1tbl: "ktbl",
  p1tbl: "ptbl",
  "k-tbl": "ktbl",
  "p-tbl": "ptbl",
  "sl1": "sl",
  "sl1k": "sl",
  "sl1p": "sl",
  "sl1-wyif": "sl-wyif",
  "sl1-wyib": "sl-wyib",
  "skpo": "skp",
  "sl1-k1-psso": "skp",
  "s1k1psso": "skp",
  "sk2po": "sk2p",
  "s2kpo": "s2kp",
  "m1lp": "m1p",
  "m1rp": "m1p",
  "inc": "kfb",
  "k2tog-tbl": "k2tog",
  "k2togtbl": "k2tog",
  "p2togtbl": "p2tog",
  "s2kp2": "s2kp",
  "sl1k2togpsso": "sk2p",
  "sl1-k2tog-psso": "sk2p",
  "sl1k1psso": "skp",
  "sl1kwise": "sl",
  "sl1pwise": "sl",
  "sl1wyif": "sl-wyif",
  "sl1wyib": "sl-wyib",
  "m1pl": "m1p",
  "m1pr": "m1p",
};

/** Stitch codes ordered longest first, so "k2tog" wins over "k". */
export const CODES_LONGEST_FIRST = Object.keys(STITCHES).sort((a, b) => b.length - a.length);

export function stitchDef(code: string): StitchDef | undefined {
  return STITCHES[code] ?? STITCHES[ALIASES[code] ?? ""];
}

export function canonicalCode(code: string): string | undefined {
  if (STITCHES[code]) return code;
  const alias = ALIASES[code];
  return alias && STITCHES[alias] ? alias : undefined;
}

/** Glossary entries for tooltips and plain English. */
export const GLOSSARY: Record<string, string> = {
  ...Object.fromEntries(Object.entries(STITCHES).map(([k, v]) => [k, v.name])),
  co: "cast on",
  bo: "bind off",
  rs: "right side",
  ws: "wrong side",
  rep: "repeat",
  st: "stitch",
  sts: "stitches",
  rnd: "round",
  pm: "place marker",
  sm: "slip marker",
  rm: "remove marker",
};
