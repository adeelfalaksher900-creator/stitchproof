import { findFixes, type Fix } from "./fixes";
import { parsePattern } from "./parse";
import { proofProgram, type Proof } from "./proof";

export interface Erratum {
  id: string;
  size: number;
  sizeName: string;
  rowKey: string;
  rowLabel: string;
  line: number;
  messages: string[];
  /** Rows in this size that go wrong because of this one. */
  knockOn: number;
  fix?: Fix;
}

/**
 * Find the root errata: take the first issue, find its best fix, apply it,
 * re-proof, and repeat. Rows that only went wrong because of an earlier
 * mistake disappear along the way, so knitters see causes, not symptoms.
 */
export function findErrata(text: string, proof: Proof, max = 8): { errata: Erratum[]; fixedText: string | null } {
  const errata: Erratum[] = [];
  let current = text;
  let currentProof = proof;
  const skipped = new Set<string>();

  for (let guard = 0; guard < max; guard++) {
    let target: { size: number; key: string } | null = null;
    for (let s = 0; s < currentProof.sizes.length && !target; s++) {
      const r = currentProof.sizes[s].rows.find((row) => row.status === "issue" && !skipped.has(`${s}:${row.key}`));
      if (r) target = { size: s, key: r.key };
    }
    if (!target) break;

    const program = currentProof.program;
    const row = program.rows.find((r) => r.key === target!.key)!;
    const result = currentProof.sizes[target.size].rows.find((r) => r.key === target!.key)!;
    const issuesInSize = currentProof.sizes[target.size].issues;
    const fixes = findFixes(current, program, target.key, target.size, 1);
    const fix = fixes[0];
    let knockOn = 0;
    if (fix) {
      const next = proofProgram(parsePattern(fix.newText));
      knockOn = Math.max(0, issuesInSize - next.sizes[target.size].issues - 1);
      errata.push({
        id: `${target.size}:${target.key}`,
        size: target.size,
        sizeName: program.sizes[target.size],
        rowKey: target.key,
        rowLabel: row.label,
        line: row.line,
        messages: result.messages.map((m) => m.text),
        knockOn,
        fix,
      });
      current = fix.newText;
      currentProof = next;
    } else {
      // No safe fix: report it and move past every issue it explains in this size.
      const others = currentProof.sizes[target.size].rows.filter((r) => r.status === "issue");
      errata.push({
        id: `${target.size}:${target.key}`,
        size: target.size,
        sizeName: program.sizes[target.size],
        rowKey: target.key,
        rowLabel: row.label,
        line: row.line,
        messages: result.messages.map((m) => m.text),
        knockOn: others.length - 1,
      });
      for (const o of others) skipped.add(`${target.size}:${o.key}`);
    }
  }
  const allFixed = errata.length > 0 && errata.every((e) => e.fix) && currentProof.verdict !== "issues";
  return { errata, fixedText: allFixed ? current : errata.some((e) => e.fix) ? current : null };
}
