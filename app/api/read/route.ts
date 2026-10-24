import { google } from "@ai-sdk/google";
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
 * Models to try, in order. A Gemini key (free tier) is used first when set;
 * otherwise Vercel AI Gateway, which authenticates with the deployment's OIDC token.
 */
function candidates(): Candidate[] {
  const list: Candidate[] = [];
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    const id = process.env.GEMINI_MODEL || "gemini-flash-latest";
    list.push({ label: `google/${id}`, model: google(id) });
  }
  if (process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL) {
    const ids = [process.env.STITCHPROOF_MODEL, "anthropic/claude-haiku-5.5", "anthropic/claude-haiku-4.5"];
    for (const id of ids) {
      if (id && !list.some((c) => c.label === id)) list.push({ label: id, model: id });
    }
  }
  return list;
}

// Best-effort, per-instance rate limit: 10 readings per minute per address.
const WINDOW_MS = 60_000;
const LIMIT = 10;
const hits = new Map<string, number[]>();

function limited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > LIMIT;
}

export async function POST(req: Request) {
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

  const models = candidates();
  if (models.length === 0) {
    return Response.json({ error: "The AI reader isn't configured here." }, { status: 503 });
  }

  let lastError = "";
  for (const { label, model } of models) {
    try {
      const result = await aiRead(parsed.data.text, async ({ system, prompt }) => {
        const { text } = await generateText({
          model,
          system,
          prompt,
          temperature: 0,
          maxOutputTokens: 6000,
          abortSignal: AbortSignal.timeout(40_000),
        });
        return text;
      });
      return Response.json({ ...result, model: label });
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      console.error(`[read] ${label} failed:`, lastError.slice(0, 300));
    }
  }
  return Response.json({ error: "The AI reader is unavailable right now." }, { status: 503 });
}
