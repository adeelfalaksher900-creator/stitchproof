export interface SavedPattern {
  id: string;
  title: string;
  /** The text the knitter pasted (or Stitchproof's reading of it, after an AI read + fix). */
  text: string;
  /** Stitchproof notation from the AI reader, when one was used. */
  reading?: string;
  readBy?: string;
  sizes: string[];
  verdict: string;
  sizeIndex: number;
  /** Index into the program's rows for Knit mode. */
  row: number;
  updatedAt: number;
}

const KEY = "stitchproof:v1:patterns";

function safeParse(raw: string | null): SavedPattern[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((p) => p && typeof p.id === "string" && typeof p.text === "string") : [];
  } catch {
    return [];
  }
}

export function loadAll(): SavedPattern[] {
  try {
    return safeParse(window.localStorage.getItem(KEY)).sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function load(id: string): SavedPattern | undefined {
  return loadAll().find((p) => p.id === id);
}

export function save(p: SavedPattern): boolean {
  try {
    const all = loadAll().filter((x) => x.id !== p.id);
    all.unshift({ ...p, updatedAt: Date.now() });
    window.localStorage.setItem(KEY, JSON.stringify(all.slice(0, 50)));
    return true;
  } catch {
    return false;
  }
}

export function update(id: string, patch: Partial<SavedPattern>): boolean {
  const existing = load(id);
  if (!existing) return false;
  return save({ ...existing, ...patch });
}

export function remove(id: string): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(loadAll().filter((p) => p.id !== id)));
  } catch {
    /* storage unavailable */
  }
}

export function newId(): string {
  try {
    return crypto.randomUUID().slice(0, 8);
  } catch {
    return Math.random().toString(36).slice(2, 10);
  }
}

export function titleOf(text: string, fallback = "Untitled pattern"): string {
  const m = /^\s*title\s*:\s*(.+)$/im.exec(text);
  if (m) return m[1].trim().slice(0, 80);
  const first = text.split("\n").map((l) => l.trim()).find(Boolean);
  if (first && first.length <= 60 && !/^(co|cast on|row|rnd)\b/i.test(first)) return first;
  return fallback;
}
