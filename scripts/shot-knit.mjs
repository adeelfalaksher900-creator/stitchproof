import { chromium } from "playwright";
const b = await chromium.launch();
for (const [w, h, out] of [[1440, 900, "shots/knit.png"], [390, 844, "shots/knit_m.png"]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto("http://localhost:3000/proof?sample=beanie&run=1"); await p.waitForTimeout(1800);
  await p.getByRole("button", { name: /Apply all 3 fixes/ }).click(); await p.waitForTimeout(1500);
  await p.getByRole("link", { name: /Start knitting/ }).click(); await p.waitForTimeout(1200);
  for (let i = 0; i < 42; i++) await p.keyboard.press("ArrowRight");
  await p.waitForTimeout(800);
  await p.screenshot({ path: out });
  await p.close();
}
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto("http://localhost:3000/patterns"); await p.waitForTimeout(800);
await p.screenshot({ path: "shots/patterns.png" });
await b.close();
