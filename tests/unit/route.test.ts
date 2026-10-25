import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/read/route";

// Gemini always fails here, so a reading can only come from the OpenRouter fallback.
vi.mock("ai", async (original) => ({
  ...(await original<typeof import("ai")>()),
  generateText: vi.fn(async ({ model }: { model: { provider: string } }) => {
    if (model.provider.startsWith("google")) throw new Error("quota exceeded");
    return { text: "CO 10 sts." };
  }),
}));

afterEach(() => vi.unstubAllEnvs());

const call = (headers: Record<string, string>) =>
  POST(new Request("https://stitchproof.test/api/read", { method: "POST", headers: { "content-type": "application/json", host: "stitchproof.test", ...headers }, body: JSON.stringify({ text: "CO 10 sts." }) }));

describe("/api/read", () => {
  it("refuses calls from other sites' pages", async () => {
    const res = await call({ origin: "https://evil.example" });
    expect(res.status).toBe(403);
  });

  it("lets its own pages through to the usual checks", async () => {
    const res = await call({ origin: "https://stitchproof.test" });
    // No AI provider is configured in tests, so the request gets as far as that.
    expect(res.status).toBe(503);
  });

  it("falls back to OpenRouter when Gemini fails", async () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-google-key");
    vi.stubEnv("OPENROUTER_API_KEY", "test-openrouter-key");
    const res = await call({ origin: "https://stitchproof.test" });
    expect(res.status).toBe(200);
    expect((await res.json()).model).toBe("openrouter/google/gemini-2.5-flash-lite");
  });
});
