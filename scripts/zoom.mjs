import { chromium } from "playwright";
const [url, out, wait="6500"] = process.argv.slice(2);
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 3 });
await p.goto(url, { waitUntil: "load" });
await p.evaluate(() => document.getElementById("how").scrollIntoView());
await p.waitForTimeout(+wait);
const el = await p.$(".iso-stage svg"); await el.screenshot({ path: out });
await b.close();
