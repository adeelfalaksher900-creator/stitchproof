import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
await p.goto("http://localhost:3000/proof?sample=beanie&run=1"); await p.waitForTimeout(2000);
await p.screenshot({ path: "shots/dark_proof.png" });
await p.goto("http://localhost:3000/"); await p.evaluate(() => document.getElementById("how").scrollIntoView()); await p.waitForTimeout(6500);
await p.screenshot({ path: "shots/dark_fig.png" });
await b.close();
