import { describe, expect, it } from "vitest";
import { explainRow } from "@/lib/stitch/explain";
import { parsePattern } from "@/lib/stitch/parse";
import { proofText } from "@/lib/stitch/proof";

const counts = (text: string, size = 0) => {
  const p = proofText(text);
  expect(p.program.unread).toEqual([]);
  return p.sizes[size].rows.filter((r) => r.status !== "skipped").map((r) => [r.after, r.status] as const);
};

describe("stitch markers", () => {
  const crown = `CO 96 sts. Join to work in the rnd.
Rnd 1: *K16, pm; rep from * to end.
Rnd 2: *K to 2 sts before m, k2tog, sm; rep from * to end. (90 sts)
Rnd 3: Knit.
Rnds 4–5: Rep rnds 2–3. (84 sts)`;

  it("counts a crown whose decreases sit before each marker", () => {
    expect(counts(crown)).toEqual([[96, "ok"], [96, "ok"], [90, "ok"], [90, "ok"], [84, "ok"], [84, "ok"]]);
  });

  it("explains the marker steps in plain English", () => {
    const p = proofText(crown);
    const text = explainRow(p.program.rows[2], 0, p.sizes[0].rows[2]);
    expect(text).toContain("knit until 2 stitches before the marker (14 stitches)");
    expect(text).toContain("slip the marker");
    expect(text).toContain("that's 6 times");
  });

  it("catches a decrease that can't fit before the marker", () => {
    const p = proofText(crown.replace("Rnd 2: *K to 2 sts", "Rnd 2: *K to 3 sts"));
    expect(p.verdict).toBe("issues");
    expect(p.sizes[0].rows[2].messages.map((m) => m.text).join(" ")).toMatch(/marker|past the end|unworked|says/);
  });

  it("reads a bracket repeat between markers, with a rib running to the marker", () => {
    const text = `CO 84 sts. Join to work in the rnd.
Rnd 1: [K14, pm] 6 times.
Rnd 2: [*P1, k1; rep from * to 2 sts before next marker, k2tog, sm] 6 times. (78 sts)`;
    expect(counts(text).at(-1)).toEqual([78, "ok"]);
  });

  it("turns the markers around on flat rows", () => {
    const text = `CO 30 sts.
Row 1 (RS): K3, pm, k to end.
Row 2 (WS): P to m, sm, k to end. (30 sts)
Row 3: K to m, sm, k1, m1, k to end. (31 sts)`;
    expect(counts(text)).toEqual([[30, "ok"], [30, "ok"], [30, "ok"], [31, "ok"]]);
  });

  it("removes a marker", () => {
    const text = `CO 20 sts. Join to work in the rnd.
Rnd 1: K10, pm, k to end.
Rnd 2: K to m, rm, k to end.
Rnd 3: K to m, k1. (20 sts)`;
    // With the marker gone, "k to m" runs to the end of the round, leaving no stitch for "k1".
    const p = proofText(text);
    expect(p.sizes[0].rows[3].status).toBe("issue");
  });
});

describe("rows that differ by size", () => {
  it("repeats a block a different number of times per size", () => {
    const text = `Sizes: S (M, L)
CO 40 (48, 56) sts.
Row 1: K1, k2tog, k to last 3 sts, ssk, k1. (38 (46, 54) sts)
Row 2: Purl.
Rep last 2 rows 2 (3, 4) more times.
Next row: Knit. (34 (40, 46) sts)`;
    const p = proofText(text);
    expect(p.program.unread).toEqual([]);
    expect(p.verdict).toBe("proven");
    expect(p.sizes.map((s) => s.finalCount)).toEqual([34, 40, 46]);
  });

  it("reads a dash as 'not in this size'", () => {
    const text = `Sizes: S (M, L)
CO 40 sts.
Row 1: K1, k2tog, k to end.
Row 2: Purl.
Rep last 2 rows – (1, 2) more times.
Next row: Knit. (39 (38, 37) sts)`;
    expect(proofText(text).verdict).toBe("proven");
  });

  it("reads row ranges that are longer in bigger sizes", () => {
    const text = `Sizes: S (M, L)
CO 20 sts.
Rows 1–4 (1–6, 1–8): K1, m1, k to end. (24 (26, 28) sts)
Next row: Purl.`;
    const p = proofText(text);
    expect(p.verdict).toBe("proven");
    expect(p.sizes.map((s) => s.finalCount)).toEqual([24, 26, 28]);
  });

  it("flags a size whose stated count disagrees at the end of a longer block", () => {
    const text = `Sizes: S (M, L)
CO 20 sts.
Rows 1–4 (1–6, 1–8): K1, m1, k to end. (24 (25, 28) sts)`;
    const p = proofText(text);
    expect(p.sizes[1].issues).toBeGreaterThan(0);
    expect(p.sizes[0].issues + p.sizes[2].issues).toBe(0);
  });

  it("works a 'sizes only' section for those sizes alone", () => {
    const text = `Sizes: Child (Adult S, Adult L)
CO 80 (88, 96) sts. Join to work in the rnd.
Adult S and Adult L sizes only:
Rnd 1: K2tog, k to end. (87 (95) sts)
All sizes:
Rnd 2: Knit. (80 (87, 95) sts)`;
    const p = proofText(text);
    expect(p.program.unread).toEqual([]);
    expect(p.verdict).toBe("proven");
    expect(p.sizes[0].rows[1].status).toBe("skipped");
  });

  it("refuses size names it can't match", () => {
    const p = parsePattern(`Sizes: S (M, L)
CO 10 sts.
Huge sizes only:
Row 1: Knit.`);
    expect(p.unread[0].reason).toMatch(/Couldn't match/);
  });
});

describe("published-pattern phrasing", () => {
  const hat = `Sizes: Small (Medium, Large)
With smaller needle, CO 88 (96, 104) sts. Place marker and join for working in the round, being careful not to twist.
Rnd 1: *K1, p1; rep from * to end.
Rep Rnd 1 until piece measures 2 inches.
Next rnd: *K11 (12, 13), pm; rep from * to last 11 (12, 13) sts, k to end.
Dec rnd: *K to 2 sts before marker, k2tog, sl m; rep from * to end. (80 (88, 96) sts)
Next rnd: Knit.
Rep last 2 rnds 8 (9, 10) more times. (16 sts)`;

  it("reads a three-size crown with markers, a lead-in cast-on and a length-based rib", () => {
    const p = proofText(hat);
    expect(p.program.unread).toEqual([]);
    expect(p.sizes.map((s) => s.finalCount)).toEqual([16, 16, 16]);
    expect(p.sizes.every((s) => s.issues === 0)).toBe(true);
    // The rib is worked to a length, so the verdict stays honest.
    expect(p.verdict).toBe("partial");
  });

  it("catches a repeat count that's wrong for one size", () => {
    const p = proofText(hat.replace("8 (9, 10) more times", "8 (8, 10) more times"));
    expect(p.sizes[1].issues).toBeGreaterThan(0);
    expect(p.sizes[0].issues + p.sizes[2].issues).toBe(0);
  });

  it("repeats rows until a stated count remains", () => {
    const text = `Sizes: S (M, L)
CO 96 (104, 112) sts. Join to work in the rnd.
Setup rnd: *K12 (13, 14), pm; rep from * to end.
Rnd 1: *K to 2 sts before m, k2tog, sm; rep from * to end. (88 (96, 104) sts)
Rnd 2: Knit.
Rep last 2 rnds until 16 sts rem.
Next rnd: *K2tog; rep from * to end. (8 sts)`;
    const p = proofText(text);
    expect(p.verdict).toBe("proven");
    const until = p.program.rows.findIndex((r) => r.until);
    expect(explainRow(p.program.rows[until], 0, p.sizes[0].rows[until])).toContain("Repeat Rnds 1–2 until 16 stitches remain — that's 9 more times");
  });

  it("flags an 'until' count the decreases step over", () => {
    const p = proofText(`CO 90 sts. Join to work in the rnd.
Rnd 1: *K9, pm; rep from * to end.
Rnd 2: *K to 2 sts before m, k2tog, sm; rep from * to end. (80 sts)
Rnd 3: Knit.
Rep Rnds 2–3 until 15 sts rem.`);
    expect(p.verdict).toBe("issues");
    expect(p.sizes[0].rows.at(-1)!.messages[0].text).toMatch(/never leaves exactly 15/);
  });

  it("counts raglan increases on both sides of each marker", () => {
    const p = proofText(`CO 60 sts. Join to work in the rnd.
Setup rnd: K10, pm, k20, pm, k10, pm, k20.
Inc rnd: *K1, m1l, k to 1 st before m, m1r, k1, sm; rep from * to end. (68 sts)
Rnd 2: Knit.
Rep last 2 rnds 3 more times. (92 sts)`);
    expect(p.verdict).toBe("proven");
  });
});
