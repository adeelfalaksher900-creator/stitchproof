import { proofText } from "../lib/stitch/proof";
import { findFixes } from "../lib/stitch/fixes";
import { SAMPLES } from "../lib/samples";
const id = process.argv[2] ?? "beanie";
const text = SAMPLES.find(s => s.id === id)!.text;
const proof = proofText(text);
console.log("verdict", proof.verdict, "unread", proof.program.unread);
proof.sizes.forEach((s, si) => {
  console.log("==", s.size, "issues", s.issues, "final", s.finalCount);
  s.rows.forEach((r, i) => { if (r.status !== "ok") console.log(" ", proof.program.rows[i].label, r.before, "->", r.after, r.declared, r.messages.map(m=>m.text).join(" | ")); });
  const first = s.rows.find(r => r.status === "issue");
  if (first) for (const f of findFixes(text, proof.program, first.key, si)) console.log("  FIX:", f.description, "|", f.evidence, "|", f.lineAfter);
});
