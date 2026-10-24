import { generateText } from "ai";
import { z } from "zod";
import { aiRead } from "@/lib/ai/reader";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_CHARS = 20_000;
const Body = z.object({ text: z.string().trim().min(1, "Paste a pattern first.").max(MAX_CHARS, `Patterns are limited to ${MAX_CHARS.toLocaleString()} characters.`) });

const MODELS = [process.env.STITCHPROOF_MODEL, "anthropic/claude-haiku-5.5", "anthropic/claude-haiku-4.5"].filter(
  (m, i, a): m is string => Boolean(m) && a.indexOf(m) === i,
);

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

  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN && !process.env.VERCEL) {
    return Response.json({ error: "The AI reader isn't configured here." }, { status: 503 });
  }

  let lastError = "";
  for (const model of MODELS) {
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
      return Response.json({ ...result, model });
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      console.error(`[read] ${model} failed:`, lastError.slice(0, 300));
    }
  }
  return Response.json({ error: "The AI reader is unavailable right now." }, { status: 503 });
}
