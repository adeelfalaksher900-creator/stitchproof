import { createGoogleGenerativeAI, google } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, type LanguageModel } from "ai";
import { z } from "zod";
import { aiRead } from "@/lib/ai/reader";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_CHARS = 20_000;
const Body = z.object({ text: z.string().trim().min(1, "Paste a pattern first.").max(MAX_CHARS, `Patterns are limited to ${MAX_CHARS.toLocaleString()} characters.`) });

interface Candidate {
  label: string;
  model: LanguageModel;
}

/**
 * Models to try, in order: the visitor's own key (from the "AI key" box), the site's Gemini key (free tier),
 * the site's OpenRouter key, then Vercel AI Gateway when it has been turned on with a key or a chosen model.
 */
function candidates(userKey: string | null): Candidate[] {
  const list: Candidate[] = [];
  // Copying notation needs no deep reasoning; the lite model answers in seconds.
  const ids = process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : ["gemini-flash-lite-latest", "gemini-flash-latest"];
  // A visitor's own key is used for this request only, never stored or logged.
  if (userKey) {
    const own = createGoogleGenerativeAI({ apiKey: userKey });
    for (const id of ids) list.push({ label: `google/${id}`, model: own(id) });
  }
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    for (const id of ids) list.push({ label: `google/${id}`, model: google(id) });
  }
  if (process.env.OPENROUTER_API_KEY) {
    const router = createOpenAICompatible({ name: "openrouter", baseURL: "https://openrouter.ai/api/v1", apiKey: process.env.OPENROUTER_API_KEY });
    // A cheap paid model first, then OpenRouter's free-model router for keys with no credit.
    const models = process.env.OPENROUTER_MODEL ? [process.env.OPENROUTER_MODEL] : ["google/gemini-2.5-flash-lite", "openrouter/free"];
    for (const id of models) list.push({ label: `openrouter/${id}`, model: router(id) });
  }
  if (process.env.AI_GATEWAY_API_KEY || process.env.STITCHPROOF_MODEL) {
    for (const id of [process.env.STITCHPROOF_MODEL, "anthropic/claude-haiku-4.5"]) {
      if (id && !list.some((c) => c.label === id)) list.push({ label: id, model: id });
    }
  }
  return list;
}

// The shared limit is a Vercel Firewall rule (10 POSTs a minute per IP on /api/read).
// This per-instance copy is a second line for local runs and anything the firewall lets through.
const WINDOW_MS = 60_000;
const LIMIT = 10;
const hits = new Map<string, number[]>();

function limited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  // Drop addresses that have gone quiet, rather than resetting everyone at once.
  if (hits.size > 5000) for (const [k, v] of hits) if (now - v[v.length - 1] >= WINDOW_MS) hits.delete(k);
  return recent.length > LIMIT;
}

/** Browsers send Origin on every POST; one from another site means someone else's page is calling. */
function foreignOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host !== (req.headers.get("x-forwarded-host") ?? req.headers.get("host"));
  } catch {
    return true;
  }
}

export async function POST(req: Request) {
  if (foreignOrigin(req)) {
    return Response.json({ error: "The AI reader only answers Stitchproof's own pages." }, { status: 403 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (limited(ip)) {
    return Response.json({ error: "Too many readings in a minute. Try again shortly." }, { status: 429 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }

  const header = req.headers.get("x-gemini-key")?.trim() ?? "";
  const userKey = /^[\w-]{20,200}$/.test(header) ? header : null;
  const models = candidates(userKey);
  if (models.length === 0) {
    return Response.json({ error: "The AI reader isn't configured here." }, { status: 503 });
  }

  // Stay inside the function's 60 s limit even when a model is slow.
  const deadline = AbortSignal.timeout(52_000);
  let lastError = "";
  for (const { label, model } of models) {
    if (deadline.aborted) break;
    try {
      const result = await aiRead(parsed.data.text, async ({ system, prompt }) => {
        const { text } = await generateText({
          model,
          system,
          prompt,
          temperature: 0,
          // Gemini thinks by default; other routes get their provider's default.
          ...(label.startsWith("google/") ? { reasoning: "none" as const } : {}),
          maxOutputTokens: 6000,
          abortSignal: AbortSignal.any([deadline, AbortSignal.timeout(label.startsWith("openrouter/") ? 25_000 : 18_000)]),
        });
        return text;
      });
      return Response.json({ ...result, model: label });
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      console.error(`[read] ${label} failed:`, lastError.slice(0, 300));
    }
  }
  const error = userKey ? "The AI reader couldn't use your key. Check it under “AI key”." : "The AI reader is unavailable right now.";
  return Response.json({ error }, { status: 503 });
}
