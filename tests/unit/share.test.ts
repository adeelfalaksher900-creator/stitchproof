import { describe, expect, it } from "vitest";
import { readShared, shareUrl } from "@/lib/share";
import { SAMPLES } from "@/lib/samples";

it("round-trips a pattern through a share link and stays short", async () => {
  const text = SAMPLES[0].text;
  const url = await shareUrl(text, "https://example.test");
  expect(url.startsWith("https://example.test/proof#p=")).toBe(true);
  expect(url.length).toBeLessThan(text.length);
  expect(await readShared(url.slice(url.indexOf("#")))).toBe(text);
});

it("ignores broken or foreign fragments", async () => {
  expect(await readShared("#p=not-valid-data")).toBeNull();
  expect(await readShared("#something-else")).toBeNull();
});

describe("share link safety", () => {
  it("rejects a link that would expand far beyond the pattern limit", async () => {
    const bomb = await shareUrl("k".repeat(5_000_000), "https://x.test");
    expect(await readShared(bomb.slice(bomb.indexOf("#")))).toBeNull();
  });
});
