import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/read/route";

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
});
