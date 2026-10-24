import { describe, expect, it } from "vitest";
import { parsePattern } from "@/lib/stitch/parse";
import { simulate } from "@/lib/stitch/simulate";
import { proofText } from "@/lib/stitch/proof";

/** Each case: a row in a notation knitters really write, the stitches before it, and the count it should make. */
const ROWS: [string, number, number][] = [
  ["K2, *p2, k2; rep from * to end.", 22, 22],
  ["*K1, p1; rep from * to last st, k1.", 21, 21],
  ["K to last st, p1.", 10, 10],
  ["K1, m1l, k to last st, m1r, k1.", 20, 22],
  ["K1, LLI, k to last st, RLI, k1.", 20, 22],
  ["K1, k2tog, k to last 3 sts, ssk, k1.", 20, 18],
  ["K1, k2tog tbl, k to end.", 20, 19],
  ["Sl 1, k1, psso, k to end.", 20, 19],
  ["Sl1 kwise, k2tog, psso, k to end.", 20, 18],
  ["Sl1 wyif, k to end.", 12, 12],
  ["K3, *yo, k2tog; rep from * to last 3 sts, k3.", 26, 26],
  ["[K1, p1] 5 times.", 10, 10],
  ["(K1, p1) x 5.", 10, 10],
  ["*K2tog; rep from * 3 more times.", 8, 4],
  ["Kfb, k to last 2 sts, kfb, k1.", 10, 12],
  ["K1, kfbf, k1.", 3, 5],
  ["K2, sk2p, k2.", 7, 5],
  ["K2, cdd, k2.", 7, 5],
  ["Knit across.", 14, 14],
  ["P all sts.", 14, 14],
  ["K2 (3, 4), p to end.", 20, 20],
];

describe("offline reader on real-world notation", () => {
  for (const [row, before, after] of ROWS) {
    it(`reads "${row}"`, () => {
      const p = parsePattern(`CO ${before} sts.\nRow 1: ${row}`);
      expect(p.unread).toEqual([]);
      const r = simulate(p, 0).rows[1];
      expect(r.messages.map((m) => m.text)).toEqual([]);
      expect(r.after).toBe(after);
    });
  }

  it("fills in rows from 'Row 2 and all WS rows'", () => {
    const p = parsePattern(`CO 22 sts.
Row 1 (RS): K2, *p2, k2; rep from * to end.
Row 2 and all WS rows: Purl.
Row 3: K1, m1l, k to last st, m1r, k1. (24 sts)
Row 5: K to end.
Rows 6–7: Rep rows 4–5.`);
    expect(p.unread).toEqual([]);
    expect(p.rows.filter((r) => r.number !== null).map((r) => r.number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    const res = simulate(p, 0);
    expect(res.issues).toBe(0);
    expect(res.rows[res.rows.length - 1].after).toBe(24);
  });

  it("treats 'work even until it measures' as can't-verify, not an error", () => {
    const proof = proofText(`CO 20 sts.\nRow 1: Knit.\nWork even until piece measures 6 in.\nBO all sts.`);
    expect(proof.program.unread).toEqual([]);
    expect(proof.verdict).toBe("partial");
  });

  it("treats 'rep rows until' as can't-verify", () => {
    const proof = proofText(`CO 20 sts.\nRow 1: Knit.\nRow 2: Purl.\nRep rows 1–2 until piece measures 8 in.\nBO all sts.`);
    expect(proof.program.unread).toEqual([]);
    expect(proof.verdict).toBe("partial");
  });
});
