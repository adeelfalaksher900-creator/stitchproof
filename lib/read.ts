import { SAMPLES } from "./samples";
import { parsePattern } from "./stitch/parse";
import { readsOffline } from "./stitch/proof";
import type { Program } from "./stitch/types";

/**
 * A visitor's own Gemini key (see components/AiKey). Kept for this tab's session by default,
 * or on this device if the visitor ticks "Remember"; never sent anywhere but our AI route.
 */
export const KEY_STORE = "stitchproof:gemini-key";
export const KEY_RE = /^[\w-]{20,200}$/;

export function savedKey(): string | null {
  try {
    const k = sessionStorage.getItem(KEY_STORE) ?? localStorage.getItem(KEY_STORE);
    return k && KEY_RE.test(k) ? k : null;
  } catch {
    return null;
  }
}

export type ReaderMode = "auto" | "offline";

export interface Reading {
  program: Program;
  /** The exact text the program was read from (original, or the AI's notation). */
  readingText: string;
  readBy: "offline" | "ai";
  model?: string;
  attempts?: number;
  /** Why the AI reader wasn't used or failed, when relevant. */
  aiNote?: string;
}

export const MAX_CHARS = 20_000;

export async function readPattern(
  text: string,
  mode: ReaderMode,
  onStage?: (stage: "offline" | "ai") => void,
  signal?: AbortSignal,
): Promise<Reading> {
  onStage?.("offline");
  const offline = parsePattern(text);
  if (readsOffline(offline)) return { program: offline, readingText: text, readBy: "offline" };
  if (mode === "offline") {
    return {
      program: offline,
      readingText: text,
      readBy: "offline",
      aiNote: offline.unread.length ? "Offline only: lines the offline reader couldn't read are listed below." : undefined,
    };
  }
  onStage?.("ai");
  const key = savedKey();
  try {
    const res = await fetch("/api/read", {
      method: "POST",
      headers: { "content-type": "application/json", ...(key ? { "x-gemini-key": key } : {}) },
      body: JSON.stringify({ text }),
      signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || typeof data.canonical !== "string") {
      // A visitor's own key failing is news to them, so it isn't papered over.
      const saved = key ? null : savedSampleReading(text);
      if (saved) return saved;
      return {
        program: offline,
        readingText: text,
        readBy: "offline",
        aiNote: `${data.error ?? "The AI reader is unavailable right now."} Showing what the offline reader could read.`,
      };
    }
    const program = parsePattern(data.canonical);
    return { program, readingText: data.canonical, readBy: "ai", model: data.model, attempts: data.attempts };
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    const saved = key ? null : savedSampleReading(text);
    if (saved) return saved;
    return {
      program: offline,
      readingText: text,
      readBy: "offline",
      aiNote: "Couldn't reach the AI reader. Showing what the offline reader could read.",
    };
  }
}

/** The built-in prose sample keeps working when the live AI can't answer, and says so. */
function savedSampleReading(text: string): Reading | null {
  const sample = SAMPLES.find((s) => s.savedReading && s.text.trim() === text.trim());
  if (!sample?.savedReading) return null;
  const { canonical, model } = sample.savedReading;
  return {
    program: parsePattern(canonical),
    readingText: canonical,
    readBy: "ai",
    model,
    aiNote: "The live AI reader didn't answer, so this sample shows a reading the same model made earlier. Your own patterns always use the live reader.",
  };
}
