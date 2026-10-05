// Makes the hero image for the landing page: our own sample artwork spread across three slides in the real editor.
// Needs the demo build on :3100. Output: public/launch/editor.webp
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import sharp from "sharp";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const ART = path.resolve("test-output/assets/hero-landscape.png");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="3000" height="1000" viewBox="0 0 3000 1000">
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d3b57"/><stop offset="0.55" stop-color="#e58e72"/><stop offset="1" stop-color="#f7d7a8"/></linearGradient>
  <radialGradient id="sun" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#fff3d1"/><stop offset="1" stop-color="#fff3d1" stop-opacity="0"/></radialGradient>
</defs>
<rect width="3000" height="1000" fill="url(#sky)"/>
<circle cx="1500" cy="560" r="330" fill="url(#sun)"/>
<circle cx="1500" cy="560" r="86" fill="#fff6dd"/>
<path d="M0 700 C300 560 520 640 800 600 S1300 520 1560 610 S2200 540 2500 620 S2850 640 3000 580 V1000 H0Z" fill="#8d5a63" opacity="0.85"/>
<path d="M0 780 C260 690 560 760 900 700 S1500 650 1900 740 S2500 690 3000 760 V1000 H0Z" fill="#4a3f5c"/>
<path d="M0 860 C400 800 700 880 1100 830 S1800 790 2200 860 S2700 820 3000 850 V1000 H0Z" fill="#26304a"/>
<path d="M0 940 C500 900 900 960 1400 925 S2200 900 3000 940 V1000 H0Z" fill="#141b2e"/>
</svg>`;
fs.mkdirSync(path.dirname(ART), { recursive: true });
await sharp(Buffer.from(svg)).png().toFile(ART);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto("http://localhost:3100/login");
await page.getByLabel("Email").fill("hero@example.test");
await page.getByRole("button", { name: "Continue" }).click();
await page.waitForURL("**/app");
await page.getByRole("link", { name: "New project" }).first().click();
await page.getByLabel("Name").fill("Summer 2026");
await page.getByRole("button", { name: "Create project" }).click();
await page.waitForURL("**/app/project/**");
await page.getByText(/Slide 1 of/).waitFor();
await page.locator('input[type="file"]').setInputFiles(ART);
await page.waitForFunction(() => window.Konva.stages[0].find("Image").every((n) => n.image()) && window.Konva.stages[0].find("Image").length === 1);

const tool = async (name) => {
  const b = page.getByRole("navigation", { name: "Editor tools" }).getByRole("button", { name });
  if ((await b.getAttribute("aria-pressed")) !== "true") await b.click();
};
await tool("Layers");
const panel = page.getByRole("region", { name: "Layers", exact: true });
await panel.getByLabel("Width").fill("3120");
await panel.getByLabel("X", { exact: true }).fill("60");
await panel.getByLabel("Y", { exact: true }).fill("160");

await tool("Text");
await page.getByRole("button", { name: "Add text" }).click();
await page.locator("#text-value").fill("Summer 2026");
await page.getByLabel("Font").selectOption("playfair-display");
await page.getByLabel("Size").fill("170");
await page.getByRole("radio", { name: "#ffffff" }).click();
await page.waitForTimeout(800);
await tool("Layers");
const pw = page.getByRole("region", { name: "Layers", exact: true });
await pw.getByLabel("X", { exact: true }).fill("1280");
await pw.getByLabel("Y", { exact: true }).fill("520");
await page.getByRole("region", { name: "Canvas area" }).focus();
await page.keyboard.press("Escape");
for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Zoom out" }).click();
await page.waitForTimeout(1200);
const raw = path.resolve("test-output/hero-raw.png");
await page.screenshot({ path: raw });
await browser.close();
fs.mkdirSync("public/launch", { recursive: true });
await sharp(raw).resize({ width: 1800 }).webp({ quality: 80 }).toFile("public/launch/editor.webp");
console.log("wrote public/launch/editor.webp", (fs.statSync("public/launch/editor.webp").size / 1024).toFixed(0) + " KB");
