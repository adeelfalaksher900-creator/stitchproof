import { describe, expect, it } from "vitest";
import { aiRead, cleanOutput } from "@/lib/ai/reader";
import { proofText } from "@/lib/stitch/proof";

describe("AI reader (with a stand-in model)", () => {
  it("accepts a valid translation in one attempt", async () => {
    const out = "CO 10 sts.\nRows 1–4: Knit.\nBO all sts.";
    const r = await aiRead("cast on 10, knit 4 rows, bind off", async () => out);
    expect(r.attempts).toBe(1);
    expect(r.unread).toEqual([]);
    expect(r.canonical).toBe(out);
  });

  it("asks once more with the parser's problems and keeps the better result", async () => {
    const prompts: string[] = [];
    const answers = ["```\nCO 10 sts.\nKnit some rows.\n```", "CO 10 sts.\nRows 1–4: Knit."];
    const r = await aiRead("cast on 10 and knit a bit", async ({ prompt }) => {
      prompts.push(prompt);
      return answers[prompts.length - 1];
    });
    expect(r.attempts).toBe(2);
    expect(prompts[1]).toContain("Knit some rows.");
    expect(r.unread).toEqual([]);
    expect(r.rows).toBe(5);
  });

  it("keeps UNSURE lines as unread instead of guessing", async () => {
    const r = await aiRead("...", async () => "CO 10 sts.\nRow 1: Knit.\nUNSURE: Work even until piece measures 6 in.");
    expect(r.unread.length).toBe(1);
    expect(r.unread[0].text).toContain("6 in");
  });

  it("propagates model failures so the route can fall back", async () => {
    await expect(aiRead("x", async () => { throw new Error("gateway down"); })).rejects.toThrow("gateway down");
  });

  it("a faithful translation of the prose scarf keeps its error visible", () => {
    // What a correct translation looks like: the stated 34 is copied, not fixed.
    const canonical = cleanOutput(`Title: Weekend Seed-Stitch Scarf
CO 31 sts.
Rows 1–6: Knit.
Row 7: K3, m1, k to last 3 sts, m1, k3. (34 sts)
Row 8: K3, *p1, k1; rep from * to last 4 sts, p1, k3.
Rows 9–107: Rep row 8.
Rows 108–113: Knit.
BO all sts.`);
    const proof = proofText(canonical);
    expect(proof.program.unread).toEqual([]);
    expect(proof.verdict).toBe("issues");
    expect(proof.sizes[0].rows.find((r) => r.status === "issue")?.after).toBe(33);
  });
});
