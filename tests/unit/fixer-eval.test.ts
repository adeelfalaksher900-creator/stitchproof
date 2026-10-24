import { expect, it } from "vitest";
import { evaluateFixer } from "@/lib/stitch/evaluate";
import { CLEAN_PATTERNS } from "@/lib/stitch/fixtures";

it("catches and repairs every single-number typo that changes a stitch count", () => {
  const r = evaluateFixer(CLEAN_PATTERNS);
  expect(r.total).toBeGreaterThan(400);
  // Every typo that changes a count is detected and repaired to a pattern that adds up.
  expect(r.detected).toBe(r.total - r.invisible);
  expect(r.repaired).toBe(r.detected);
  // Most repairs restore the designer's exact original text.
  expect(r.restored / r.detected).toBeGreaterThan(0.85);
}, 60_000);
