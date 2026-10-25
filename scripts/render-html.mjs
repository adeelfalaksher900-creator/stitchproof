// Usage: node scripts/render-html.mjs <file.html> <out.png> <width> <height>
import { chromium } from "playwright";
const [file, out, w, h] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
await p.goto("file://" + file, { waitUntil: "load" });
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(400);
await p.screenshot({ path: out });
await b.close();
