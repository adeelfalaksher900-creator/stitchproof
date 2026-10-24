// Usage: npx tsx scripts/eval-fixer.ts — prints how well the fixer repairs randomly broken patterns.
import { CLEAN_PATTERNS } from "../lib/stitch/fixtures";
import { evaluateFixer } from "../lib/stitch/evaluate";

const t0 = Date.now();
const r = evaluateFixer(CLEAN_PATTERNS);
const pct = (a: number, b: number) => `${((100 * a) / b).toFixed(1)}%`;
console.log(`Typos tried: ${r.total} across ${Object.keys(CLEAN_PATTERNS).length} patterns`);
console.log(`Invisible to counting (change no stitch count): ${r.invisible}`);
console.log(`Detected: ${r.detected} (${pct(r.detected, r.total - r.invisible)} of count-changing typos)`);
console.log(`Repaired to "Proven": ${r.repaired} (${pct(r.repaired, r.detected)})`);
console.log(`Restored exactly to the original: ${r.restored} (${pct(r.restored, r.detected)})`);
console.log(`Time: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
for (const f of r.failures.slice(0, 12)) console.log("  not repaired:", f.pattern, "·", f.change);
