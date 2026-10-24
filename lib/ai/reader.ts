import { parsePattern } from "@/lib/stitch/parse";
import { repairPrompt, SYSTEM_PROMPT, userPrompt } from "./prompt";

export type Generate = (args: { system: string; prompt: string }) => Promise<string>;

export interface ReadResult {
  canonical: string;
  attempts: number;
  unread: { line: number; text: string; reason: string }[];
  rows: number;
}

/** Remove code fences or chatter a model might wrap around the notation. */
export function cleanOutput(raw: string): string {
  let t = raw.trim();
  const fence = /```[a-z]*\n([\s\S]*?)```/i.exec(t);
  if (fence) t = fence[1].trim();
  return t
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n")
    .trim();
}

/**
 * Ask the model for a translation, then check it with the offline reader.
 * If the reader can't read some lines, ask once more with those exact problems.
 * Lines the model marks UNSURE are kept as unread — never guessed.
 */
export async function aiRead(original: string, generate: Generate): Promise<ReadResult> {
  let canonical = cleanOutput(await generate({ system: SYSTEM_PROMPT, prompt: userPrompt(original) }));
  let program = parsePattern(canonical);
  let attempts = 1;
  const fixable = () => program.unread.filter((u) => !/AI reader wasn't sure/.test(u.reason));
  if (fixable().length > 0 || program.rows.length === 0) {
    const problems = program.rows.length === 0
      ? ["No rows could be read at all."]
      : fixable().map((u) => `Line "${u.text}": ${u.reason}`);
    const retry = cleanOutput(
      await generate({ system: SYSTEM_PROMPT, prompt: repairPrompt(original, canonical, problems) }),
    );
    const retryProgram = parsePattern(retry);
    attempts = 2;
    if (retryProgram.rows.length > 0 && retryProgram.unread.length <= program.unread.length) {
      canonical = retry;
      program = retryProgram;
    }
  }
  return { canonical, attempts, unread: program.unread, rows: program.rows.length };
}
