import { describe, expect, it } from "vitest";
import { findErrata } from "@/lib/stitch/errata";
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

  it("catches a repeat count that's wrong for one size, and fixes it", () => {
    const broken = hat.replace("8 (9, 10) more times", "8 (8, 10) more times");
    const p = proofText(broken);
    expect(p.sizes[1].issues).toBeGreaterThan(0);
    expect(p.sizes[0].issues + p.sizes[2].issues).toBe(0);
    const { errata, fixedText } = findErrata(broken, p);
    expect(errata).toHaveLength(1);
    expect(errata[0].fix?.description).toBe("Change 8 to 9 in the repeat count (size Medium only).");
    expect(fixedText).toBe(hat);
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

describe("audit fixes", () => {
  it("applies a one-size section's single count to that size only", () => {
    const p = proofText(`Sizes: S (M, L)
CO 40 (44, 48) sts.
L size only:
Row 1: K2tog, k to end. (47 sts)
All sizes:
Row 1: Knit. (40 (44, 47) sts)`);
    expect(p.verdict).toBe("proven");
  });

  it("reads a size header with a unit after the group", () => {
    const p = proofText(`Sizes: 32 (36, 40)" chest
CO 60 (64, 68) sts.
Row 1: Knit.`);
    expect(p.program.sizes).toEqual(["32", "36", "40"]);
    expect(p.verdict).toBe("proven");
  });

  it("says so when a flat row works to a marker that was never placed", () => {
    const p = proofText(`CO 20 sts.
Row 1: K to m, k2tog. (19 sts)`);
    expect(p.sizes[0].rows[1].messages.map((m) => m.text)).toContain("This row works to a marker, but no marker has been placed.");
  });

  it("finds rows inside a sizes-only section by number", () => {
    const p = proofText(`Sizes: S (M)
CO 20 (24) sts.
Row 1: Knit.
M size only:
Row 2: K2tog, k to end. (23 sts)
Row 3: Purl.
Rep rows 2–3 once more. (22 sts)
All sizes:
Next row: Knit. (20 (22) sts)`);
    expect(p.program.unread).toEqual([]);
    expect(p.verdict).toBe("proven");
    expect(p.program.rows.at(-1)!.label).toBe("Row 2");
  });
});

describe("common published phrasing, read offline", () => {
  const cases: [string, string, number][] = [
    ["k2tog around", "CO 10 sts. Join to work in the rnd.\nRnd 1: K2tog around. (5 sts)", 5],
    ["kfb in each st", "CO 10 sts.\nRow 1: Kfb in each st. (20 sts)", 20],
    ["k1f&b", "CO 10 sts.\nRow 1: K1f&b, k to end. (11 sts)", 11],
    ["count after a full stop", "CO 20 sts.\nRow 1: K2tog, k to end. 19 sts rem.", 19],
    ["count after a semicolon", "CO 20 sts.\nRow 1: K2tog, k to end; 19 sts.", 19],
    ["closing star", "CO 12 sts.\nRow 1: *K2, p2* rep to end.", 12],
    ["rib shorthand", "CO 20 sts.\nRows 1-6: K1, p1 rib.", 20],
    ["established pattern", "CO 20 sts.\nRow 1: *K2, p2; rep from * to end.\nRows 2-10: Work in established pattern.", 20],
    ["bullets", "CO 10 sts.\n• Row 1: Knit.", 10],
    ["a row wrapped over two lines", "CO 20 sts. Join to work in the rnd.\nRnd 1: *K2, p2; rep from *\naround.", 20],
  ];
  it.each(cases)("%s", (_name, text, final) => {
    const p = proofText(text);
    expect(p.program.unread).toEqual([]);
    expect(p.verdict).toBe("proven");
    expect(p.sizes[0].finalCount).toBe(final);
  });

  it("keeps character positions when it joins a wrapped row, so fixes edit the right number", () => {
    const text = "CO 21 sts. Join to work in the rnd.\nRnd 1: *K2, p2; rep from *\naround.";
    const p = proofText(text);
    expect(p.verdict).toBe("issues");
    const { fixedText } = findErrata(text, p);
    // 21 stitches take a 3-stitch rib, so the smallest edit is K2 → K1, at the right place in the joined line.
    expect(fixedText).toBe(text.replace("*K2", "*K1"));
  });
});

describe("house-style published patterns (written for these tests)", () => {
  const beanie = `Small (Medium, Large)

Loosely cast 80 (88, 96) stitches onto circular needles. We used a basic Long Tail Cast On.

Place unique stitch marker and join for working in the round, being careful not to twist the stitches.

Round 1: *K1, p1, repeat from * to end of round.

Repeat Round 1 for 4 (6, 6) more rounds.

With Main Color, continue knitting every round until piece measures 7 (7½, 8) inches from cast-on edge.

NOTE: Change to double pointed needles when necessary.

Set-Up Round: Remove unique end-of-round marker, k1, replace marker for new end-of-round, *k20 (22, 24), place marker (pm), repeat from * to end of round, omitting final stitch marker which is end-of-round marker. [4 stitch markers placed, including unique end-of-round marker]

Decrease Round: [Slip slip knit (ssk) knit to two stitches before next marker, knit 2 together (k2tog), slip marker] 4 times. [8 stitches decreased]

Next Round: Knit to end of round, slipping markers as you come to them.

Repeat last two rounds one (2, 3) more time(s). [64 (64, 64) stitches remain]

Cut yarn and thread tail through remaining stitches.`;

  it("reads every line and proves every count", () => {
    const p = proofText(beanie);
    expect(p.program.unread).toEqual([]);
    expect(p.program.sizes).toEqual(["Small", "Medium", "Large"]);
    expect(p.issueCount).toBe(0);
    // Worked to a length, so the verdict stays honest.
    expect(p.verdict).toBe("partial");
  });

  it("checks a stated decrease against the instructions", () => {
    const p = proofText(beanie.replace("[8 stitches decreased]", "[6 stitches decreased]"));
    expect(p.issueCount).toBeGreaterThan(0);
    expect(p.sizes[0].rows.find((r) => r.status === "issue")!.messages[0].text).toBe("This row decreases by 8; the pattern says it decreases by 6.");
  });

  it("finds a repeat count that's one too many for the largest size, and fixes it", () => {
    const broken = beanie.replace("one (2, 3) more time(s)", "one (2, 4) more time(s)");
    const p = proofText(broken);
    expect(p.sizes[2].issues).toBeGreaterThan(0);
    const { errata } = findErrata(broken, p);
    expect(errata[0].fix?.description).toBe("Change 4 to 3 in the repeat count (size Large only).");
  });
});

describe("stated counts with a dash for sizes that skip the row", () => {
  // As an AI reading of a chatbot-written beanie came out: the last rounds apply to the larger sizes only.
  const hat = `Sizes: Child (Adult S, Adult L)
CO 32 (40, 48) sts. Join to work in the rnd.
Rnd 1: *K4 (5, 6), pm; rep from * around.
Rnd 2: *K to 2 sts before m, k2tog, sm; rep from * around. (24 (32, 40) sts)
Rnd 3: *K to 2 sts before m, k2tog, sm; rep from * around. (16 (24, 32) sts)
Adult S & Adult L sizes only:
Rnd 4: *K to 2 sts before m, k2tog, sm; rep from * around. (– (16, 24) sts)
Adult L sizes only:
Rnd 5: *K to 2 sts before m, k2tog, sm; rep from * around. (– (–, 16) sts)`;

  it("doesn't read the dash as zero stitches", () => {
    const p = proofText(hat);
    expect(p.program.unread).toEqual([]);
    expect(p.issueCount).toBe(0);
    expect(p.sizes.map((s) => s.finalCount)).toEqual([16, 16, 16]);
  });

  it("still catches a wrong count in a size that works the row", () => {
    expect(proofText(hat.replace("(– (–, 16) sts)", "(– (–, 12) sts)")).issueCount).toBe(1);
  });
});

describe("a hat pattern a chatbot wrote (Gemini Flash-Lite, as the AI reader should translate it)", () => {
  const hat = `Sizes: Baby (Child, Adult)
CO 72 (84, 96) sts. Join to work in the rnd.
Rnd 1: *K2, p2; rep from * around.
Rnd 2: *[K2, p2] 3 (3.5, 4) times, pm; rep from * 5 more times.
Rnd 3: *K2tog, work in rib to 2 sts before m, k2tog, sm; rep from * around. [12 sts decreased] (60 (72, 84) sts)
Rnd 4: Work all stitches in established rib pattern. (60 (72, 84) sts)
Rnd 5: Rep rnd 3. (48 (60, 72) sts) [12 sts decreased]
Rnd 6: *K2tog, k2tog; rep from * around. [12 sts decreased] (24 (30, 36) sts)`;

  it("says a repeat can't be worked 3.5 times", () => {
    const p = proofText(hat);
    expect(p.program.unread).toEqual([]);
    const child = p.sizes[1].rows.find((r) => r.status === "issue")!;
    expect(child.messages[0].text).toBe("This says to repeat 3.5 times, but a repeat can't be worked part of the way.");
    // The half repeat is still counted as the 2 stitches it points at, so later rounds stay checkable.
    expect(p.sizes[1].rows[p.sizes[1].rows.length - 2].after).toBe(60);
  });

  it("checks a stated decrease whether it comes before or after the count", () => {
    const p = proofText(hat);
    const last = (s: number) => p.sizes[s].rows[p.sizes[s].rows.length - 1];
    expect(last(0).messages.map((m) => m.text)).toEqual(["This row decreases by 24; the pattern says it decreases by 12."]);
    expect(p.sizes[0].rows[4].status).toBe("ok");
  });
});

describe("the AI reader's worked example", () => {
  it("is notation the offline reader accepts", async () => {
    const { SYSTEM_PROMPT } = await import("@/lib/ai/prompt");
    const output = SYSTEM_PROMPT.split("EXAMPLE 2")[1].split("Output:\n")[1];
    const p = parsePattern(`Sizes: Baby (Child)\nCO 24 (28) sts. Join to work in the rnd.\nRnd 1: Knit.\n${output}`);
    expect(p.unread).toEqual([]);
  });
});
