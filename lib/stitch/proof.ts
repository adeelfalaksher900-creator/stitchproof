import { parsePattern } from "./parse";
import { simulateAll } from "./simulate";
import type { Program, SizeResult } from "./types";

export type Verdict = "proven" | "issues" | "partial" | "empty";

export interface Proof {
  program: Program;
  sizes: SizeResult[];
  verdict: Verdict;
  issueCount: number;
  unverifiableCount: number;
  /** Rows (by key) that have an issue in at least one size. */
  issueRows: Set<string>;
}

export function proofProgram(program: Program): Proof {
  const sizes = simulateAll(program);
  const issueRows = new Set<string>();
  let issueCount = 0;
  let unverifiableCount = 0;
  for (const s of sizes) {
    issueCount += s.issues;
    for (const r of s.rows) {
      if (r.status === "issue") issueRows.add(r.key);
    }
  }
  unverifiableCount = sizes[0]?.unverifiable ?? 0;
  const verdict: Verdict =
    program.rows.length === 0
      ? "empty"
      : issueCount > 0
        ? "issues"
        : program.unread.length > 0 || unverifiableCount > 0
          ? "partial"
          : "proven";
  return { program, sizes, verdict, issueCount, unverifiableCount, issueRows };
}

export function proofText(text: string): Proof {
  return proofProgram(parsePattern(text));
}

/** True when the offline reader understood every instruction line. */
export function readsOffline(program: Program): boolean {
  return program.unread.length === 0 && program.rows.length > 0;
}
