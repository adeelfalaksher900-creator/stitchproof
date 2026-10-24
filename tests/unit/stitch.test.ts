import { describe, expect, it } from "vitest";
import { parsePattern } from "@/lib/stitch/parse";
import { simulate } from "@/lib/stitch/simulate";
import { proofText } from "@/lib/stitch/proof";
import { findFixes } from "@/lib/stitch/fixes";
import { explainRow } from "@/lib/stitch/explain";
import { SAMPLES } from "@/lib/samples";

const sample = (id: string) => SAMPLES.find((s) => s.id === id)!.text;

describe("offline reader", () => {
  it("reads cast-on, ranges, star repeats and declared counts", () => {
    const p = parsePattern(`CO 20 sts.\nRow 1 (RS): K2, *p2, k2; rep from * to end. (20 sts)\nRows 2-4: Knit.`);
    expect(p.unread).toEqual([]);
    expect(p.rows.map((r) => r.label)).toEqual(["Cast on", "Row 1", "Row 2", "Row 3", "Row 4"]);
    expect(p.rows[1].side).toBe("RS");
    expect(p.rows[1].declared?.values).toEqual([20]);
  });

  it("reads multi-size groups and size names", () => {
    const p = parsePattern(`Sizes: S (M, L)\nCO 80 (88, 96) sts.\nRow 1: K2 (3, 4), knit to end.`);
    expect(p.sizes).toEqual(["S", "M", "L"]);
    const op = p.rows[1].ops[0];
    expect(op.t === "st" && op.n.values).toEqual([2, 3, 4]);
  });

  it("reads bracket repeats, to-last and more-times", () => {
    const p = parsePattern(`CO 12 sts.\nRow 1: [k1, p1] 4 times, k to last 2 sts, k2tog. (11 sts)\nRow 2: *k1, p1; rep from * 4 more times, k1. (11 sts)`);
    expect(p.unread).toEqual([]);
    const r = simulate(p, 0).rows;
    expect(r[1].after).toBe(11);
    expect(r[1].status).toBe("ok");
    expect(r[2].uses).toBe(11);
    expect(r[2].status).toBe("ok");
  });

  it("expands row repeats", () => {
    const p = parsePattern(`CO 10 sts.\nRow 1: Knit.\nRow 2: Purl.\nRows 3-6: Rep rows 1-2.\nRep last 2 rows 2 more times.`);
    expect(p.unread).toEqual([]);
    expect(p.rows.filter((r) => r.number !== null).length).toBe(10);
  });

  it("marks prose it can't read instead of guessing", () => {
    const p = parsePattern(`Cast on 31 stitches.\nKnit every row for six rows.`);
    expect(p.rows.length).toBe(1);
    expect(p.unread.length).toBe(1);
  });

  it("marks short rows as unverifiable", () => {
    const p = parsePattern(`CO 10 sts.\nRow 1: K5, w&t.`);
    expect(p.rows[1].unverifiable).toBeTruthy();
  });
});

describe("counter", () => {
  it("proves the clean dishcloth", () => {
    const proof = proofText(sample("dishcloth"));
    expect(proof.program.unread).toEqual([]);
    expect(proof.verdict).toBe("proven");
    expect(proof.sizes[0].finalCount).toBe(0);
  });

  it("flags a repeat that doesn't fit", () => {
    const p = parsePattern(`CO 42 sts.\nRow 1: *k2, p2; rep from * to end.`);
    const r = simulate(p, 0).rows[1];
    expect(r.status).toBe("issue");
    expect(r.messages[0].kind).toBe("repeat-uneven");
  });

  it("flags a declared mismatch", () => {
    const p = parsePattern(`CO 20 sts.\nRow 1: k2tog, k to end. (18 sts)`);
    const r = simulate(p, 0).rows[1];
    expect(r.after).toBe(19);
    expect(r.messages[0].kind).toBe("declared-mismatch");
  });

  it("finds exactly the beanie's planted errata", () => {
    const proof = proofText(sample("beanie"));
    expect(proof.program.unread).toEqual([]);
    expect(proof.program.sizes).toEqual(["Child", "Adult S", "Adult L"]);
    const [child, s, l] = proof.sizes;
    // Child: CO 90 doesn't fit the 4-st rib.
    expect(child.issues).toBeGreaterThan(0);
    // Adult S: only the stated count on Rnd 45 is wrong.
    expect(s.issues).toBe(1);
    const sIssue = s.rows.find((r) => r.status === "issue")!;
    expect(proof.program.rows.find((r) => r.key === sIssue.key)!.label).toBe("Rnd 45");
    // Adult L: K8 in Rnd 49 should be K7.
    const lFirst = l.rows.find((r) => r.status === "issue")!;
    expect(proof.program.rows.find((r) => r.key === lFirst.key)!.label).toBe("Rnd 49");
  });
});

describe("fixer", () => {
  it("fixes every beanie erratum and ends proven", () => {
    let text = sample("beanie");
    for (let guard = 0; guard < 6; guard++) {
      const proof = proofText(text);
      if (proof.verdict === "proven") break;
      const sizeIdx = proof.sizes.findIndex((s) => s.issues > 0);
      const row = proof.sizes[sizeIdx].rows.find((r) => r.status === "issue")!;
      const fixes = findFixes(text, proof.program, row.key, sizeIdx);
      expect(fixes.length).toBeGreaterThan(0);
      text = fixes[0].newText;
    }
    expect(proofText(text).verdict).toBe("proven");
    expect(text).toContain("CO 88 (96, 104)");
    expect(text).toContain("(64 (72, 80) sts)");
    expect(text).toContain("*K5 (6, 7), k2tog");
  });

  it("prefers the stated count when only the number is a typo", () => {
    const text = sample("beanie");
    const proof = proofText(text);
    const row = proof.program.rows.find((r) => r.label === "Rnd 45")!;
    const fixes = findFixes(text, proof.program, row.key, 1);
    expect(fixes[0].kind).toBe("declared");
    expect(fixes[0].lineAfter).toContain("(64 (72, 80) sts)");
  });
});

describe("explainer", () => {
  it("explains a repeat row with the solved count", () => {
    const p = parsePattern(`CO 44 sts.\nRow 1: K3, *p2, k2; rep from * to last 5 sts, p2, k3.`);
    const r = simulate(p, 0).rows[1];
    const text = explainRow(p.rows[1], 0, r);
    expect(text).toContain("repeat [purl 2, knit 2] until 5 stitches remain — that's 9 times");
    expect(text).toContain("You'll have 44 stitches.");
  });
});
