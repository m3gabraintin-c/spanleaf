// Screenshots of the editor panels (layers, text, colour, and the phone layout).
// Needs the demo build running on :3100.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const OUT = path.resolve(process.env.SHOTS_DIR || "test-output/screens");
fs.mkdirSync(OUT, { recursive: true });
const ASSETS = path.resolve("test-output/assets");
const browser = await chromium.launch();

async function session(opts) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  await page.goto("http://localhost:3100/login");
  await page.getByLabel("Email").fill("shots@example.test");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("**/app");
  await page.getByRole("link", { name: "New project" }).first().click();
  await page.getByLabel("Name").fill("Summer trip");
  await page.getByRole("button", { name: "Create project" }).click();
  await page.waitForURL("**/app/project/**");
  await page.getByText(/Slide 1 of/).waitFor();
  return page;
}
const tool = async (page, name) => {
  const b = page.getByRole("navigation", { name: "Editor tools" }).getByRole("button", { name });
  if ((await b.getAttribute("aria-pressed")) !== "true") await b.click();
};
async function fill(page) {
  await page.locator('input[type="file"]').setInputFiles([path.join(ASSETS, "gradient.png"), path.join(ASSETS, "transparent.png")]);
  await page.waitForFunction(() => window.Konva.stages[0].find("Image").length === 2 && window.Konva.stages[0].find("Image").every((n) => n.image()));
  await tool(page, "Text");
  await page.getByRole("button", { name: "Add text" }).click();
  await page.locator("#text-value").fill("Summer 2026");
  await page.getByLabel("Font").selectOption("playfair-display");
  await page.waitForTimeout(600);
}

for (const [suffix, opts] of [
  ["", { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }],
  ["-mobile", { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }],
]) {
  const page = await session(opts);
  await fill(page);
  await page.screenshot({ path: path.join(OUT, `S12${suffix}.png`) }); // text panel, text selected
  await tool(page, "Layers");
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, `S10${suffix}.png`) });
  await tool(page, "Colour");
  await page.getByRole("radio", { name: "#f2efe9" }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, `S16${suffix}.png`) });
  await page.context().close();
}
await browser.close();
console.log("saved to", OUT);
