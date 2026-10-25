import { parsePattern } from "./stitch/parse";
import { readsOffline } from "./stitch/proof";
import type { Program } from "./stitch/types";

/** A visitor's own Gemini key, kept only in this browser (see components/AiKey). */
export const KEY_STORE = "stitchproof:gemini-key";
export const KEY_RE = /^[\w-]{20,200}$/;

export function savedKey(): string | null {
  try {
    const k = localStorage.getItem(KEY_STORE);
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
    return {
      program: offline,
      readingText: text,
      readBy: "offline",
      aiNote: "Couldn't reach the AI reader. Showing what the offline reader could read.",
    };
  }
}
