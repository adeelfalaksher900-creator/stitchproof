import * as k from "@/lib/iso/iso-kit";
import { STITCHES } from "@/lib/stitch/stitches";
import type { Plan, Point3, Projection } from "@/lib/iso/iso-kit";

/**
 * Fig 1 — the stitch counter.
 *
 * One row of a hat crown, "*K2, k2tog; rep from * once more", is set as type
 * in a composing stick (the carriage). Each type slug is as wide as the
 * stitches it USES and carries one pin for every stitch it MAKES — the same
 * uses/makes table the app's counter runs on. A feeler rides over the slugs;
 * every pin it climbs advances the dial by one stitch. A tolerance marker on
 * the bezel holds the count the pattern states. The lamp lights green when
 * the needle stops on the marker and red when it doesn't.
 */

export const ROW = ["k", "k", "k2tog", "k", "k", "k2tog"] as const;
export const U = 12; // world units per stitch used
export const STATED = [6, 7] as const; // the tour proves one row, then catches a typo

export const WIDTH = 640;
export const HEIGHT = 440;

const PLATE: Plan = { x: -96, y: -74, w: 300, d: 132, r: 8 };
const PLATE_H = 12;
const FOOT_H = 5;

const RAIL_Y = [-1, 23];
const CARRIAGE: Plan = { x: -58, y: -4, w: 116, d: 34, r: 3 };
const CARRIAGE_Z = 3;
const CARRIAGE_TOP = 8;
const SLUG_H = 6;
const SLUG_TOP = CARRIAGE_TOP + SLUG_H;
const PIN_R = 1.7;
const PIN_H = 3;
const PIN_TOP = SLUG_TOP + PIN_H;
const LANE_Y = 13;

export const FX = 64; // feeler x (world)
const POST: [number, number] = [FX, -50];
const POST_TOP = 108;
const CLAMP_Z = 84;
const DIAL: [number, number] = [FX, LANE_Y];
const DIAL_R = 19;
const DIAL_Z = 66;
const DIAL_H = 9;
const DIAL_TOP = DIAL_Z + DIAL_H;
export const PER_TURN = 8; // one turn of the needle = 8 stitches
const TIP_R = 2.1;

export interface Slug {
  code: string;
  x0: number;
  x1: number;
  pins: number[];
}

/** Lay out the row as slugs along the carriage, from its uses/makes. */
export function layout(): Slug[] {
  const slugs: Slug[] = [];
  let x = -52;
  for (const code of ROW) {
    const d = STITCHES[code];
    const w = d.uses * U;
    const pins = Array.from({ length: d.makes }, (_, i) => x + ((i + 0.5) * w) / d.makes);
    slugs.push({ code, x0: x + 0.5, x1: x + w - 0.5, pins });
    x += w;
  }
  return slugs;
}

const SLUGS = layout();
const PINS = SLUGS.flatMap((s) => s.pins);
export const USES = SLUGS.reduce((n, s) => n + (s.x1 - s.x0 + 1) / U, 0);
export const MAKES = PINS.length;
export const START = FX - SLUGS[0].x0 + 7; // all type to the right of the feeler
export const END = FX - SLUGS[SLUGS.length - 1].x1 - 7; // all type read

const RAIL_FROM = END + CARRIAGE.x - 6;
const RAIL_TO = START + CARRIAGE.x + CARRIAGE.w + 6;

export const P: Projection = k.fitProjection(
  [
    ...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0),
    [POST[0], POST[1], POST_TOP + 2],
    [DIAL[0] + DIAL_R, DIAL[1], DIAL_TOP],
    [DIAL[0] - DIAL_R, DIAL[1] + DIAL_R, DIAL_TOP],
  ],
  WIDTH,
  HEIGHT,
  { pad: 26, azimuth: 38 },
);

const at = (p: Point3) => k.iso(p, P);
const S = k.solidSvg;
const L = k.lineSvg;
const D = k.dotsSvg;
const byDepth = (pts: [number, number][]) =>
  [...pts].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));

function base() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 22))) {
    out.push(S(k.cylinder(x, y, 7, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 5.4, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }));
  const screws = k.corners(PLATE, 10);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));

  // Ruler strip along the front edge: one major tick per stitch used.
  const strip: Plan = { x: RAIL_FROM, y: PLATE.y + PLATE.d - 16, w: RAIL_TO - RAIL_FROM, d: 7, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const t = k.topTicks(strip.x + 4, strip.x + strip.w - 4, U / 4, 4, strip.y + 0.8, 0.6, [2, 3.8], P);
  out.push(L(t.minor, { tone: "lo" }), L(t.major, { tone: "mid" }));
  out.push(D([at([strip.x + 2, strip.y + 3.5, 0.6]), at([strip.x + strip.w - 2, strip.y + 3.5, 0.6])], { size: 0.45 }));

  // Label plate, back left.
  const label: Plan = { x: PLATE.x + 14, y: PLATE.y + 14, w: 46, d: 20, r: 1.5 };
  out.push(S(k.slabOf(label, 0, 0.8, P, 4), { tone: "lo" }));
  out.push(L(k.planOutline(k.insetPlan(label, 1.6), 0.8, P, 4), { tone: "faint" }));
  out.push(L(k.lineOnTop([label.x + 6, label.y + 6], [label.x + 34, label.y + 6], 0.8, P), { tone: "lo", free: true }));
  out.push(L(k.lineOnTop([label.x + 6, label.y + 10], [label.x + 28, label.y + 10], 0.8, P), { tone: "lo", free: true }));
  out.push(L(k.lineOnTop([label.x + 6, label.y + 14], [label.x + 38, label.y + 14], 0.8, P), { tone: "lo", free: true }));
  out.push(D([at([label.x + 3, label.y + 3, 0.8]), at([label.x + label.w - 3, label.y + label.d - 3, 0.8])], { size: 0.45 }));
  return out.join("");
}

function rails() {
  const out: string[] = [];
  for (const y of RAIL_Y) {
    out.push(S(k.slabOf({ x: RAIL_FROM, y, w: RAIL_TO - RAIL_FROM, d: 5, r: 1 }, 0, 3, P, 3, 0.4), { tone: "mid" }));
    out.push(D([RAIL_FROM + 6, RAIL_TO - 6].map((x) => at([x, y + 2.5, 3])), { size: 0.4 }));
  }
  for (const x of [RAIL_FROM - 5, RAIL_TO]) {
    out.push(S(k.slabOf({ x, y: RAIL_Y[0] - 3, w: 5, d: RAIL_Y[1] - RAIL_Y[0] + 11, r: 1.2 }, 0, 7, P, 3, 0.5), { tone: "mid" }));
    out.push(D([at([x + 2.5, RAIL_Y[0] + 1, 7]), at([x + 2.5, RAIL_Y[1] + 4, 7])], { size: 0.45 }));
  }
  return out.join("");
}

function stand() {
  const out: string[] = [];
  const mag: Plan = { x: POST[0] - 20, y: POST[1] - 16, w: 40, d: 30, r: 3 };
  const MAG_H = 20;
  out.push(S(k.slabOf(mag, 0, 10, P, 6, 0.8), { tone: "mid" }));
  out.push(S(k.slabOf(k.insetPlan(mag, 0.8), 10, MAG_H - 10, P, 6, 0.8), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(mag, 3), MAG_H, P), { tone: "faint" }));
  out.push(D([at([mag.x + 5, mag.y + 5, MAG_H]), at([mag.x + mag.w - 5, mag.y + 5, MAG_H]), at([mag.x + 5, mag.y + mag.d - 5, MAG_H])], { size: 0.45 }));
  // On/off knob for the magnet.
  const knob: [number, number] = [mag.x + 9, mag.y + mag.d - 8];
  out.push(S(k.cylinder(knob[0], knob[1], 4.6, MAG_H, 4, P, 28), { tone: "mid" }));
  out.push(L(k.knurl(knob[0], knob[1], 4.6, MAG_H, MAG_H + 4, 30, P), { tone: "lo" }));
  out.push(L(k.lineOnTop([knob[0], knob[1]], [knob[0] + 4.6, knob[1]], MAG_H + 4, P), { tone: "hi" }));
  // Post, collar, clamp.
  out.push(S(k.cylinder(POST[0], POST[1], 5, MAG_H, 4, P, 28), { tone: "mid" }));
  out.push(S(k.cylinder(POST[0], POST[1], 3.2, MAG_H + 4, CLAMP_Z - MAG_H - 4, P, 28), { tone: "mid", crease: "none" }));
  out.push(L([44, 62].map((z) => k.sideArc(POST[0], POST[1], 3.2, z, P, 16)).join(""), { tone: "faint" }));
  const clamp: Plan = { x: POST[0] - 7, y: POST[1] - 7, w: 14, d: 14, r: 2.5 };
  out.push(S(k.slabOf(clamp, CLAMP_Z, 12, P, 4, 0.6), { tone: "mid" }));
  out.push(S(k.cylinder(POST[0], POST[1], 3.2, CLAMP_Z + 12, POST_TOP - CLAMP_Z - 12, P, 28), { tone: "mid", crease: "none" }));
  out.push(S(k.cylinder(POST[0], POST[1], 3.8, POST_TOP, 2, P, 28), { tone: "mid" }));
  // Thumb screw on the clamp's left face.
  const thumb: [number, number] = [clamp.x - 3, POST[1]];
  out.push(S(k.slabOf({ x: clamp.x - 3, y: POST[1] - 1.4, w: 3, d: 2.8, r: 0.8 }, CLAMP_Z + 4, 4, P, 2), { tone: "mid", crease: "none" }));
  out.push(S(k.cylinder(thumb[0] - 1.4, thumb[1], 2.6, CLAMP_Z + 3, 6, P, 20), { tone: "mid" }));
  out.push(L(k.knurl(thumb[0] - 1.4, thumb[1], 2.6, CLAMP_Z + 3, CLAMP_Z + 9, 18, P), { tone: "lo" }));
  // Arm from the clamp to the dial lug.
  const arm: Plan = { x: POST[0] - 3, y: clamp.y + clamp.d, w: 6, d: DIAL[1] - DIAL_R - (clamp.y + clamp.d) + 1, r: 2 };
  out.push(S(k.slabOf(arm, CLAMP_Z + 2, 5, P, 4, 0.5), { tone: "mid" }));
  out.push(D([at([POST[0], arm.y + 4, CLAMP_Z + 7]), at([POST[0], arm.y + arm.d - 5, CLAMP_Z + 7])], { size: 0.45 }));
  // Lamp housing on the arm.
  const lamp: Plan = { x: POST[0] - 6, y: arm.y + arm.d * 0.42, w: 12, d: 12, r: 2 };
  out.push(S(k.slabOf(lamp, CLAMP_Z + 7, 4, P, 4, 0.4), { tone: "mid" }));
  out.push(S(k.cylinder(lamp.x + 6, lamp.y + 6, 4.2, CLAMP_Z + 11, 1.4, P, 28), { tone: "mid" }));
  out.push(`<g data-part="lamp">${S(k.cylinder(lamp.x + 6, lamp.y + 6, 3, CLAMP_Z + 12.4, 2.2, P, 28), { tone: "hi", lit: true })}</g>`);
  return out.join("");
}

function carriage() {
  const out = [`<path class="iso-halo" d="${k.haloOf(k.insetPlan(CARRIAGE, 3), CARRIAGE_Z, 0.1, P)}" style="filter:blur(4px)"/>`];
  out.push(S(k.slabOf(CARRIAGE, CARRIAGE_Z, CARRIAGE_TOP - CARRIAGE_Z, P, 5, 0.6), { tone: "mid" }));
  // Bushings over the rails.
  for (const x of [CARRIAGE.x + 3, CARRIAGE.x + CARRIAGE.w - 13]) {
    for (const y of RAIL_Y) {
      out.push(S(k.slabOf({ x, y: y - 1.5, w: 10, d: 8, r: 1 }, CARRIAGE_TOP, 2.2, P, 3, 0.3), { tone: "mid" }));
      out.push(D([at([x + 5, y + 2.5, CARRIAGE_TOP + 2.2])], { size: 0.4 }));
    }
  }
  // Composing-stick fence along the back edge.
  out.push(S(k.slabOf({ x: -54, y: 3, w: 108, d: 2.4, r: 0.6 }, CARRIAGE_TOP, 9, P, 2, 0.3), { tone: "mid" }));
  // Type slugs: as wide as the stitches they use; one pin per stitch they make.
  for (const s of SLUGS) {
    const plan: Plan = { x: s.x0, y: 5.6, w: s.x1 - s.x0, d: 15, r: 0.8 };
    out.push(S(k.slabOf(plan, CARRIAGE_TOP, SLUG_H, P, 3, 0.4), { tone: "hi", crease: "lo" }));
    out.push(L(k.planOutline(k.insetPlan(plan, 1.6), SLUG_TOP, P, 3), { tone: "faint" }));
    for (const x of s.pins) out.push(S(k.cylinder(x, LANE_Y, PIN_R, SLUG_TOP, PIN_H, P, 18), { tone: "hi" }));
  }
  // Rivets along the front edge and an index pointer that reads the ruler.
  out.push(D([-46, -24, 0, 24, 46].map((x) => at([x, CARRIAGE.y + CARRIAGE.d - 2.6, CARRIAGE_TOP])), { size: 0.4, tone: "lo" }));
  out.push(S(k.slabOf({ x: -1.2, y: CARRIAGE.y + CARRIAGE.d, w: 2.4, d: 10, r: 0.6 }, CARRIAGE_Z + 0.6, 1.2, P, 2), { tone: "mid", crease: "none" }));
  // Handle.
  const h: [number, number] = [CARRIAGE.x + CARRIAGE.w - 9, CARRIAGE.y + CARRIAGE.d + 3];
  out.push(S(k.slabOf({ x: h[0] - 2, y: CARRIAGE.y + CARRIAGE.d - 1, w: 4, d: 4, r: 1 }, CARRIAGE_Z + 1, 3, P, 2), { tone: "mid", crease: "none" }));
  out.push(S(k.cylinder(h[0], h[1] + 1, 3, CARRIAGE_Z, 5, P, 20), { tone: "mid" }));
  out.push(L(k.knurl(h[0], h[1] + 1, 3, CARRIAGE_Z, CARRIAGE_Z + 5, 18, P), { tone: "lo" }));
  return out.join("");
}

function plunger() {
  return [
    S(k.cylinder(DIAL[0], DIAL[1], TIP_R, 0, 2, P, 20), { tone: "hi", lit: true }),
    S(k.cylinder(DIAL[0], DIAL[1], 1.2, 2, 48, P, 16), { tone: "hi", crease: "none", lit: true }),
  ].join("");
}

function dial() {
  const out: string[] = [];
  const [x, y] = DIAL;
  out.push(S(k.cylinder(x, y, 2.6, 52, DIAL_Z - 52, P, 20), { tone: "mid" }));
  out.push(L(k.sideArc(x, y, 2.6, 58, P, 12), { tone: "lo" }));
  // Lug joining the arm.
  out.push(S(k.slabOf({ x: x - 4, y: y - DIAL_R - 5, w: 8, d: 8, r: 1.5 }, DIAL_Z + 2, CLAMP_Z + 2 - DIAL_Z - 2, P, 3, 0.4), { tone: "mid" }));
  out.push(S(k.cylinder(x, y, DIAL_R, DIAL_Z, DIAL_H, P, 64, 0.8), { tone: "hi", crease: "lo" }));
  out.push(L(k.knurl(x, y, DIAL_R, DIAL_TOP - 3.4, DIAL_TOP, 84, P, 0.3), { tone: "lo" }));
  out.push(L(k.sideArc(x, y, DIAL_R, DIAL_TOP - 3.4, P, 40), { tone: "faint" }));
  out.push(L(k.ring(x, y, DIAL_R - 2.2, DIAL_TOP, P, 64), { tone: "lo" }));
  const ticks = k.radialTicks(x, y, DIAL_R - 3, PER_TURN * 5, 5, DIAL_TOP, [1.3, 3], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  // Crown and reset button on the +x side.
  out.push(S(k.slabOf({ x: x + DIAL_R - 1, y: y - 2.4, w: 5, d: 4.8, r: 1.2 }, DIAL_Z + 2, 5, P, 3), { tone: "mid" }));
  out.push(S(k.slabOf({ x: x + DIAL_R + 3.6, y: y - 3.2, w: 2.6, d: 6.4, r: 1.2 }, DIAL_Z + 1.2, 6.6, P, 3), { tone: "mid" }));
  out.push(L(k.ring(x, y, 1.6, DIAL_TOP, P, 16), { tone: "mid" }));
  out.push(k.faceTextSvg(k.topMatrix([x, y + 8.5], DIAL_TOP, P, "x"), "STS", { size: 2.4, tone: "lo", anchor: "middle" }));
  return out.join("");
}

/** The needle for a count of stitches made. */
export function needleAt(count: number, proj: Projection = P) {
  const a = (count / PER_TURN) * Math.PI * 2;
  const [x, y] = DIAL;
  return k.lineOnTop(
    [x - Math.sin(a) * 3.2, y + Math.cos(a) * 3.2],
    [x + Math.sin(a) * (DIAL_R - 4), y - Math.cos(a) * (DIAL_R - 4)],
    DIAL_TOP + 0.2,
    proj,
  );
}

/** The tolerance marker on the bezel, at the stated count. */
export function markerAt(count: number, proj: Projection = P) {
  const a = (count / PER_TURN) * Math.PI * 2;
  const [x, y] = DIAL;
  const r0 = DIAL_R - 2.2;
  const r1 = DIAL_R - 0.6;
  const w = 0.11;
  return k.onTop(
    [
      [x + Math.sin(a) * r0, y - Math.cos(a) * r0],
      [x + Math.sin(a - w) * r1, y - Math.cos(a - w) * r1],
      [x + Math.sin(a + w) * r1, y - Math.cos(a + w) * r1],
    ],
    DIAL_TOP,
    proj,
    true,
  );
}

/** Height the feeler tip rests at when the carriage is at x. */
export function tipHeight(x: number): number {
  for (const px of PINS) if (Math.abs(x + px - FX) < PIN_R + TIP_R * 0.6) return PIN_TOP;
  for (const s of SLUGS) if (FX >= x + s.x0 && FX <= x + s.x1) return SLUG_TOP;
  return CARRIAGE_TOP;
}

/** Stitches counted (made) and used once the carriage is at x. */
export function countAt(x: number) {
  const made = PINS.filter((px) => x + px <= FX).length;
  const used = SLUGS.reduce((n, s) => n + Math.max(0, Math.min(s.x1 + 0.5, FX - x) - (s.x0 - 0.5)) / U, 0);
  return { made, used: Math.min(USES, Math.max(0, Math.floor(used + 1e-6))) };
}

export const CARRIAGE_TOP_Z = CARRIAGE_TOP;
export const PIN_TOP_Z = PIN_TOP;

export function buildMachine() {
  const svg = k.figureSvg({
    width: WIDTH,
    height: HEIGHT,
    label:
      "A stitch counter on a bench plate. A row of type slugs sits in a sliding composing stick: each slug is as wide as the stitches it uses and carries one pin per stitch it makes. A feeler rides over the pins and turns a dial one division per pin; a marker on the bezel holds the count the pattern states, and a lamp shows whether the needle stopped on it.",
    body: [
      base(),
      rails(),
      stand(),
      `<g data-part="carriage" transform="${k.translateAlong(P, [START, 0, 0])}">${carriage()}</g>`,
      `<g data-part="plunger" transform="${k.translateAlong(P, [0, 0, CARRIAGE_TOP])}">${plunger()}</g>`,
      dial(),
      `<path data-part="marker" class="iso-line marker" d="${markerAt(STATED[0])}"/>`,
      `<path data-part="needle" class="iso-line" data-tone="lit" data-free="start" d="${needleAt(0)}" style="stroke-width:1.1"/>`,
    ],
  });
  return { svg, P, START, END, MAKES, USES };
}
