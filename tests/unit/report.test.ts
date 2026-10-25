import { expect, it } from "vitest";
import { proofReport } from "@/lib/report";
import { SAMPLES } from "@/lib/samples";
import { findErrata } from "@/lib/stitch/errata";
import { proofText } from "@/lib/stitch/proof";

it("summarises every erratum with its size, knock-on rows, fix and the proof link", () => {
  const text = SAMPLES.find((s) => s.id === "beanie")!.text;
  const proof = proofText(text);
  const { errata } = findErrata(text, proof);
  const report = proofReport({
    title: "Harbour Beanie", counted: 54, rowsWord: "rounds", sizes: proof.program.sizes, errata,
    link: "https://example.test/proof#p=abc", date: new Date("2026-10-25T00:00:00Z"),
  });
  expect(report).toContain("Checked 54 rounds in 3 sizes (Child, Adult S, Adult L) on 2026-10-25.");
  expect(report).toContain("Result: 3 places where the stitch counts don't add up.");
  expect(report).toMatch(/1\. Rnd 1, size Child: .*2 stitches are left over/);
  expect(report).toContain("Likely fix: Change 8 to 7 in Rnd 49 (size Adult L only).");
  expect(report).toContain("See every row: https://example.test/proof#p=abc");
});

it("doesn't claim every row adds up when some couldn't be counted", () => {
  const report = proofReport({ title: "Hat", counted: 20, rowsWord: "rounds", sizes: ["One size"], errata: [], unverified: 1, link: "https://example.test/p" });
  expect(report).toContain("Result: every row that can be counted adds up.");
  expect(report).toContain("Not counted: 1 row worked to a measurement or with short rows");
});
