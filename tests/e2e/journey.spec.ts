import { expect, test } from "@playwright/test";

test.describe("core journey", () => {
  test("the clean sample is proven offline", async ({ page }) => {
    await page.goto("/proof?sample=dishcloth&run=1");
    await expect(page.getByText("Proven", { exact: true })).toBeVisible();
    await expect(page.getByText("offline · no AI needed")).toBeVisible();
  });

  test("the flawed beanie shows three errata and ends proven after fixes", async ({ page }) => {
    await page.goto("/proof?sample=beanie&run=1");
    await expect(page.getByRole("heading", { name: "3 errata found across 3 sizes." })).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(3);
    await page.getByRole("button", { name: /Apply all 3 fixes/ }).click();
    await expect(page.getByText("Proven", { exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Knitting pattern" })).toHaveValue(/CO 88 \(96, 104\)/);
  });

  test("a single fix can be applied", async ({ page }) => {
    await page.goto("/proof?sample=beanie&run=1");
    const first = page.getByRole("article").first();
    await first.getByRole("button", { name: "Apply fix" }).click();
    await expect(page.getByRole("heading", { name: "2 errata found across 3 sizes." })).toBeVisible();
  });

  test("rows expand into plain English", async ({ page }) => {
    await page.goto("/proof?sample=dishcloth&run=1");
    await page.getByRole("button", { name: /Row 5/ }).first().click();
    await expect(page.getByText(/repeat \[purl 2, knit 2\] until 5 stitches remain — that's 9 times/)).toBeVisible();
  });

  test("knit mode keeps your place after a reload", async ({ page }) => {
    await page.goto("/proof?sample=dishcloth&run=1");
    await page.getByRole("link", { name: /Start knitting/ }).click();
    await expect(page.getByText("Cast on 44 stitches.", { exact: false })).toBeVisible();
    for (let i = 0; i < 4; i++) await page.getByRole("button", { name: /Next row/ }).click();
    await expect(page.locator("article").getByText("Row 4", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.locator("article").getByText("Row 4", { exact: true })).toBeVisible();
    await page.goto("/patterns");
    await expect(page.getByRole("heading", { name: "Garter-Rib Dishcloth" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Continue knitting/ })).toBeVisible();
  });

  test("an over-long pattern is refused with a clear message", async ({ page }) => {
    await page.goto("/proof");
    await page.getByRole("textbox", { name: "Knitting pattern" }).fill("k".repeat(20_001));
    await page.getByRole("button", { name: /Proof pattern/ }).click();
    await expect(page.getByRole("alert").filter({ hasText: "limited to 20,000 characters" })).toBeVisible();
  });

  test("offline mode never calls the AI reader", async ({ page }) => {
    let called = false;
    await page.route("**/api/read", (r) => { called = true; return r.abort(); });
    await page.goto("/proof");
    await page.getByRole("button", { name: /Offline/ }).click();
    await page.getByRole("textbox", { name: "Knitting pattern" }).fill("Cast on 31 stitches.\nKnit every row for six rows.");
    await page.getByRole("button", { name: /Proof pattern/ }).click();
    await expect(page.getByText("1 line not counted")).toBeVisible();
    expect(called).toBe(false);
  });

  test("when the AI reader fails, the page falls back clearly", async ({ page }) => {
    await page.route("**/api/read", (r) => r.fulfill({ status: 503, json: { error: "The AI reader is unavailable right now." } }));
    await page.goto("/proof?sample=scarf&run=1");
    await expect(page.getByText(/Showing what the offline reader could read/)).toBeVisible();
    await expect(page.getByText("Not verified")).toBeVisible();
    await expect(page.getByRole("heading", { name: /nothing was checked yet/ })).toBeVisible();
  });
});

test.describe("sharing and help", () => {
  test("a share link opens the same proof in a fresh browser", async ({ page, browser, browserName }) => {
    test.skip(browserName !== "chromium", "clipboard permissions are Chromium-only here");
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/proof?sample=beanie&run=1");
    await page.getByRole("button", { name: /Share proof/ }).click();
    await expect(page.getByText(/Share link copied/)).toBeVisible();
    const url = await page.evaluate(() => navigator.clipboard.readText());
    expect(url).toContain("/proof#p=");
    const fresh = await browser.newContext();
    const other = await fresh.newPage();
    await other.goto(url);
    await expect(other.getByText(/Opened a shared pattern/)).toBeVisible();
    await expect(other.getByRole("heading", { name: "3 errata found across 3 sizes." })).toBeVisible();
    await fresh.close();
  });

  test("the notation guide opens and closes", async ({ page }) => {
    await page.goto("/proof");
    await page.getByRole("button", { name: /What can I paste/ }).click();
    await expect(page.getByRole("dialog", { name: "What Stitchproof reads" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

test("a visitor's own AI key is saved in the browser and sent with AI readings", async ({ page }) => {
  let sent: string | null = null;
  await page.route("**/api/read", (r) => {
    sent = r.request().headers()["x-gemini-key"] ?? null;
    return r.fulfill({ status: 503, json: { error: "The AI reader couldn't use your key. Check it under “AI key”." } });
  });
  await page.goto("/proof");
  await page.getByRole("button", { name: "AI key" }).click();
  await page.getByLabel("Gemini API key").fill("short");
  await page.getByRole("button", { name: "Save key" }).click();
  await expect(page.getByText(/doesn't look like an API key/)).toBeVisible();
  await page.getByLabel("Gemini API key").fill("AIzaTEST_key-0123456789abcdef");
  await page.getByRole("button", { name: "Save key" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/proof?sample=scarf&run=1");
  await expect(page.getByText(/couldn't use your key/)).toBeVisible();
  expect(sent).toBe("AIzaTEST_key-0123456789abcdef");
});
