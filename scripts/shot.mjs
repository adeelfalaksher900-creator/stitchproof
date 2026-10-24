// Usage: node scripts/shot.mjs <url> <out.png> [width] [height] [actions-json]
import { chromium } from "playwright";
const [url, out, w = "1440", h = "900", actions = "[]"] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: "load" });
for (const a of JSON.parse(actions)) {
  if (a.click) await page.getByText(a.click, { exact: a.exact ?? false }).first().click();
  if (a.role) await page.getByRole(a.role, { name: a.name }).first().click();
  if (a.wait) await page.waitForTimeout(a.wait);
  if (a.fill) await page.locator(a.fill).fill(a.value);
  if (a.press) await page.keyboard.press(a.press);
  if (a.scroll) await page.evaluate((y) => window.scrollTo(0, y), a.scroll);
  if (a.eval) await page.evaluate(a.eval);
}
await page.screenshot({ path: out, fullPage: process.env.FULL === "1" });
console.log("errors:", JSON.stringify(errors));
await browser.close();
