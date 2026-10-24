// Usage: npx tsx scripts/check-pattern.ts <fixture-name> — prints rows that don't add up.
import { CLEAN_PATTERNS } from "../lib/stitch/fixtures";
import { proofText } from "../lib/stitch/proof";
const p = proofText(CLEAN_PATTERNS[process.argv[2]]);
console.log(p.verdict, p.program.unread);
p.sizes.forEach((s) => s.rows.forEach((r, i) => r.status !== "ok" && console.log(s.size, p.program.rows[i].label, r.before, "->", r.after, r.messages.map((m) => m.text))));
