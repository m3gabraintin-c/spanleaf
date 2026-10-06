// End-to-end proof of milestone 1: a photo placed across a slide edge exports as correctly aligned
// slides. Runs against a production build: npm run build && npx next start -p 3100, then npm run verify.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { unzipSync } from "fflate";
import { PNG } from "pngjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const axeSrc = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

const BASE = process.env.BASE_URL || "http://localhost:3100";
const OUT = path.resolve("test-output");
const SHOTS = path.resolve(process.env.SHOTS_DIR || "test-output/screens");
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
const problems = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
}

// A 1600x1000 image that fades red to blue left to right. Smooth, so any misalignment shows.
function makeGradient(file) {
  const W = 1600, H = 1000;
  const png = new PNG({ width: W, height: H });
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (W * y + x) << 2;
      png.data[i] = Math.round(255 * (1 - x / (W - 1)));
      png.data[i + 1] = 40;
      png.data[i + 2] = Math.round(255 * (x / (W - 1)));
      png.data[i + 3] = 255;
    }
  fs.writeFileSync(file, PNG.sync.write(png));
}
const GRADIENT = path.join(OUT, "gradient.png");
makeGradient(GRADIENT);

const browser = await chromium.launch();
// Device pixel ratio 2 on purpose: export must still be 1080 wide per slide.
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, acceptDownloads: true });
const page = await ctx.newPage();
page.on("console", (m) => {
  if (["error", "warning"].includes(m.type())) problems.push(`console ${m.type()}: ${m.text()}`);
});
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));

async function readProjectFromIDB(p, id) {
  return p.evaluate(
    (pid) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("carousel-fake");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction("kv", "readonly");
          const r = tx.objectStore("kv").get(`project:${pid}`);
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        };
      }),
    id,
  );
}
async function waitSaved(p) {
  await p.getByText("Saved", { exact: true }).waitFor({ timeout: 8000 });
}
async function axe(p, name) {
  await p.evaluate(axeSrc);
  const res = await p.evaluate(async () =>
    window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa", "best-practice"] } }),
  );
  check(`axe: ${name}`, res.violations.length === 0, res.violations.map((v) => `${v.id}(${v.nodes.length}) ${v.nodes[0].target.join(" ")}`).join("; "));
}

// ---- marketing and auth screens
await page.goto(BASE + "/");
await page.waitForLoadState("networkidle");
await page.screenshot({ path: path.join(SHOTS, "S01.png") });
await axe(page, "S01 home");
await page.goto(BASE + "/login");
await page.screenshot({ path: path.join(SHOTS, "S19.png") });
await axe(page, "S19 sign in");

// signed-out guard
await page.goto(BASE + "/app");
await page.waitForURL("**/login**"); // the redirect now carries ?next=/app
check("signed-out /app redirects to /login", true);

// invalid email shows an error
await page.getByLabel("Email").fill("nope");
await page.getByRole("button", { name: "Continue" }).click();
check("invalid email shows an error", await page.getByText("Enter a valid email address.").isVisible());

await page.getByLabel("Email").fill("tester@example.com");
await page.getByRole("button", { name: "Continue" }).click();
await page.waitForURL("**/app");

// ---- projects list (empty), new project
await page.getByText("Nothing here yet").waitFor();
await page.screenshot({ path: path.join(SHOTS, "S06-empty.png") });
await axe(page, "S06 projects (empty)");
await page.getByRole("link", { name: "New project" }).first().click();
await page.waitForURL("**/app/new");
await page.getByLabel("Name").fill("Straddle test");
await page.screenshot({ path: path.join(SHOTS, "S08.png") });
await axe(page, "S08 new project");
await page.getByRole("button", { name: "Create project" }).click();
await page.waitForURL("**/app/project/**");
const projectId = page.url().split("/").pop();
await page.getByText("Slide 1 of 3").waitFor();

// ---- add a photo
await page.locator('input[type="file"]').setInputFiles(GRADIENT);
await page.getByText("Added gradient.png to slide 1").waitFor({ state: "attached", timeout: 10000 });
await waitSaved(page);
check("photo added and autosaved", true);

const ready = await page.evaluate(async () => {
  for (let i = 0; i < 100; i++) {
    const n = window.Konva?.stages?.[0]?.findOne?.("Image");
    if (n && n.image()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
});
check("image drew on the canvas", ready);
await page.screenshot({ path: path.join(SHOTS, "S09.png") });
await axe(page, "S09 editor (photo selected)");

// ---- drag it across the slide 1 / slide 2 edge with the real mouse
const geo = await page.evaluate(() => {
  const stage = window.Konva.stages[0];
  const node = stage.findOne("Image");
  const box = stage.container().getBoundingClientRect();
  const s = stage.scaleX();
  return { id: node.id(), x: node.x(), y: node.y(), w: node.width(), h: node.height(), s, left: box.left, top: box.top, px: stage.x(), py: stage.y() };
});
const toScreen = (cx, cy) => [geo.left + geo.px + cx * geo.s, geo.top + geo.py + cy * geo.s];
const [sx, sy] = toScreen(geo.x + geo.w / 2, geo.y + geo.h / 2);
const targetCentre = 1080 + 60; // image centre lands 60 px into slide 2
const [tx, ty] = toScreen(targetCentre, geo.y + geo.h / 2);
await page.mouse.move(sx, sy);
await page.mouse.down();
await page.mouse.move((sx + tx) / 2, sy, { steps: 8 });
await page.mouse.move(tx, ty, { steps: 8 });
await page.mouse.up();
await waitSaved(page);

const saved = await readProjectFromIDB(page, projectId);
const el = saved.doc.elements[0];
check("drag moved the photo across the slide edge", el.x < 1080 && el.x + el.w > 1080, `x=${el.x} w=${el.w} (edge at 1080)`);
check("saved doc has no scale, only x y w h rotation", ["x", "y", "w", "h", "rotation"].every((k) => typeof el[k] === "number") && !("scaleX" in el));

// ---- resize with a corner handle, keep ratio
const before = { w: el.w, h: el.h };
const anchor = await page.evaluate(() => {
  const stage = window.Konva.stages[0];
  const a = stage.findOne(".bottom-right");
  const p = a.getAbsolutePosition();
  const box = stage.container().getBoundingClientRect();
  return { x: box.left + p.x, y: box.top + p.y };
});
await page.mouse.move(anchor.x, anchor.y);
await page.mouse.down();
await page.mouse.move(anchor.x - 40, anchor.y - 25, { steps: 6 });
await page.mouse.up();
await waitSaved(page);
const resized = (await readProjectFromIDB(page, projectId)).doc.elements[0];
check("corner handle resized the photo and kept its ratio", resized.w < before.w && Math.abs(resized.w / resized.h - before.w / before.h) < 0.01, `${before.w}x${before.h} -> ${resized.w}x${resized.h}`);

// ---- export
const downloadPromise = page.waitForEvent("download");
await page.getByRole("button", { name: "Export" }).click();
const dl = await downloadPromise;
const zipPath = path.join(OUT, dl.suggestedFilename());
await dl.saveAs(zipPath);
await page.getByText("Your slides are ready").waitFor();
await page.screenshot({ path: path.join(SHOTS, "S17.png") });
check("export downloads a zip named after the project", dl.suggestedFilename() === "straddle-test.zip", dl.suggestedFilename());
await page.getByRole("button", { name: "Done" }).click();

const files = unzipSync(new Uint8Array(fs.readFileSync(zipPath)));
const names = Object.keys(files).sort();
check("zip has one PNG per slide", JSON.stringify(names) === JSON.stringify(["slide-01.png", "slide-02.png", "slide-03.png"]), names.join(", "));
const slides = names.map((n) => PNG.sync.read(Buffer.from(files[n])));
check("every slide is 1080x1350 even at device pixel ratio 2", slides.every((s) => s.width === 1080 && s.height === 1350), slides.map((s) => `${s.width}x${s.height}`).join(" "));

// Expected colour of the gradient at a canvas pixel, from the saved placement.
const e = (await readProjectFromIDB(page, projectId)).doc.elements[0];
const expected = (cx) => {
  const u = (cx - e.x + 0.5) / e.w;
  return [Math.round(255 * (1 - u)), 40, Math.round(255 * u)];
};
const px = (img, x, y) => {
  const i = (img.width * y + x) << 2;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
};
let worst = 0;
let samples = 0;
const yMid = Math.round(e.y + e.h / 2);
for (let cx = Math.ceil(e.x) + 6; cx < e.x + e.w - 6; cx += 11) {
  const slide = Math.floor(cx / 1080);
  const [r, g, b] = px(slides[slide], cx - slide * 1080, yMid);
  const [er, eg, eb] = expected(cx);
  worst = Math.max(worst, Math.abs(r - er), Math.abs(g - eg), Math.abs(b - eb));
  samples++;
}
check("photo pixels match the expected gradient on both sides of the edge", worst <= 8, `${samples} samples, worst channel error ${worst}`);

let seam = 0;
for (let y = Math.ceil(e.y) + 4; y < e.y + e.h - 4; y += 25) {
  const a = px(slides[0], 1079, y);
  const b = px(slides[1], 0, y);
  seam = Math.max(seam, Math.abs(a[0] - b[0]), Math.abs(a[2] - b[2]));
}
check("no seam: last column of slide 1 and first of slide 2 differ by a gradient step", seam <= 4, `max difference ${seam}`);

const white = (p) => p[0] === 255 && p[1] === 255 && p[2] === 255 && p[3] === 255;
check("slide 3 is plain white", [[5, 5], [540, 675], [1074, 1344]].every(([x, y]) => white(px(slides[2], x, y))));
check("no divider line in the export", white(px(slides[0], 1079, 20)) && white(px(slides[1], 0, 20)));
const outside = px(slides[0], Math.floor(e.x) - 3, yMid);
check("no selection handles or border in the export", white(outside), `pixel just left of the photo: ${outside.join(",")}`);

// ---- reload keeps the work
await page.reload();
await page.getByText("Slide 1 of 3").waitFor();
const again = await page.evaluate(async () => {
  for (let i = 0; i < 100; i++) {
    const n = window.Konva?.stages?.[0]?.findOne?.("Image");
    if (n && n.image()) return { x: n.x(), w: n.width() };
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
});
check("reload restores the photo where it was", !!again && Math.abs(again.x - e.x) < 0.5, JSON.stringify(again));

// ---- keyboard only: select, nudge, delete
const gone = await page.evaluate(() => window.Konva.stages[0].findOne("Image").id());
const start = await page.evaluate(() => {
  const stage = window.Konva.stages[0];
  const n = stage.findOne("Image");
  const p = n.getAbsolutePosition();
  const box = stage.container().getBoundingClientRect();
  return { x: box.left + p.x + 30, y: box.top + p.y + 30 };
});
await page.mouse.click(start.x, start.y);
const x0 = await page.evaluate(() => window.Konva.stages[0].findOne("Image").x());
await page.keyboard.press("ArrowRight");
await page.keyboard.press("ArrowRight");
await page.keyboard.press("Shift+ArrowRight");
const x1 = await page.evaluate(() => window.Konva.stages[0].findOne("Image").x());
check("arrow keys nudge 1 px, Shift+arrow 10 px", Math.abs(x1 - x0 - 12) < 0.01, `${x0} -> ${x1}`);
await waitSaved(page);

// ---- two tabs: the second save must be refused, not overwrite
const page2 = await ctx.newPage();
await page2.goto(BASE + "/app/project/" + projectId);
await page2.getByText("Slide 1 of 3").waitFor();
await page2.evaluate(async () => {
  for (let i = 0; i < 100; i++) {
    if (window.Konva?.stages?.[0]?.findOne?.("Image")?.image()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
});
const s2 = await page2.evaluate(() => {
  const stage = window.Konva.stages[0];
  const p = stage.findOne("Image").getAbsolutePosition();
  const box = stage.container().getBoundingClientRect();
  return { x: box.left + p.x + 30, y: box.top + p.y + 30 };
});
await page2.mouse.click(s2.x, s2.y);
await page2.keyboard.press("ArrowDown");
await page2.getByText("Saved", { exact: true }).waitFor({ timeout: 8000 });
await page2.close();
await page.keyboard.press("ArrowDown");
await page.getByRole("dialog", { name: "Edited somewhere else" }).waitFor({ timeout: 8000 });
check("a stale second tab gets a conflict dialog instead of overwriting", true);
await page.screenshot({ path: path.join(SHOTS, "S09-conflict.png") });
await page.reload();
await page.getByText("Slide 1 of 3").waitFor();

// ---- delete with the keyboard
await page.evaluate(async () => {
  for (let i = 0; i < 100; i++) {
    if (window.Konva?.stages?.[0]?.findOne?.("Image")?.image()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
});
const s3 = await page.evaluate(() => {
  const stage = window.Konva.stages[0];
  const p = stage.findOne("Image").getAbsolutePosition();
  const box = stage.container().getBoundingClientRect();
  return { x: box.left + p.x + 30, y: box.top + p.y + 30 };
});
await page.mouse.click(s3.x, s3.y);
await page.keyboard.press("Delete");
const count = await page.evaluate(() => window.Konva.stages[0].find("Image").length);
check("Delete removes the selected photo", count === 0);
await waitSaved(page);

// ---- bad files
await page.locator('input[type="file"]').setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
check("a non-image file is refused with a clear message", await page.getByText("That file type isn't supported").first().waitFor({ timeout: 5000 }).then(() => true, () => false));
await page.locator('input[type="file"]').setInputFiles({ name: "broken.png", mimeType: "image/png", buffer: Buffer.from("not really a png") });
check("a damaged image is refused with a clear message", await page.getByText("couldn't be opened").first().waitFor({ timeout: 5000 }).then(() => true, () => false));

// ---- projects list with a project, and the phone layout
await page.goto(BASE + "/app");
await page.getByText("Straddle test").waitFor();
await page.screenshot({ path: path.join(SHOTS, "S06.png") });
await axe(page, "S06 projects (filled)");

const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
// share the signed-in storage with the phone context
const phonePage = await phone.newPage();
phonePage.on("console", (m) => {
  if (["error", "warning"].includes(m.type())) problems.push(`phone console ${m.type()}: ${m.text()}`);
});
await phonePage.goto(BASE + "/login");
await phonePage.getByLabel("Email").fill("phone@example.com");
await phonePage.getByRole("button", { name: "Continue" }).click();
await phonePage.waitForURL("**/app");
await phonePage.getByRole("link", { name: "New project" }).first().click();
await phonePage.getByRole("button", { name: "Create project" }).click();
await phonePage.waitForURL("**/app/project/**");
await phonePage.getByText("Slide 1 of 3").waitFor();
await phonePage.locator('input[type="file"]').setInputFiles(GRADIENT);
await phonePage.getByText("Added gradient.png to slide 1").waitFor({ state: "attached", timeout: 10000 });
await phonePage.waitForTimeout(600);
await phonePage.screenshot({ path: path.join(SHOTS, "S09-mobile.png") });
const overflow = await phonePage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check("phone editor: no sideways page scroll", overflow <= 0, `overflow ${overflow}px`);

// ---- touch: drag a photo with a finger, pan the canvas with a finger (Chromium touch emulation, not Safari)
const cdp = await phone.newCDPSession(phonePage);
const finger = async (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }] });
const geoP = await phonePage.evaluate(() => {
  const stage = window.Konva.stages[0];
  const n = stage.findOne("Image");
  const p = n.getAbsolutePosition();
  const box = stage.container().getBoundingClientRect();
  return { x0: n.x(), cx: box.left + p.x + 40, cy: box.top + p.y + 40, s: stage.scaleX(), scroll: document.querySelector('[aria-label="Canvas area"]').scrollLeft };
});
await finger("touchStart", geoP.cx, geoP.cy);
for (let i = 1; i <= 8; i++) await finger("touchMove", geoP.cx + i * 6, geoP.cy + i * 3);
await finger("touchEnd", 0, 0);
await phonePage.waitForTimeout(300);
const afterDrag = await phonePage.evaluate(() => ({ x: window.Konva.stages[0].findOne("Image").x(), scroll: document.querySelector('[aria-label="Canvas area"]').scrollLeft }));
check("touch: dragging a photo with a finger moves the photo", afterDrag.x - geoP.x0 > 20 / geoP.s * 0.6, `moved ${(afterDrag.x - geoP.x0).toFixed(0)} canvas px`);
check("touch: dragging a photo does not scroll the canvas", Math.abs(afterDrag.scroll - geoP.scroll) < 2, `scrollLeft ${geoP.scroll} -> ${afterDrag.scroll}`);

const panStart = await phonePage.evaluate(() => {
  const stage = window.Konva.stages[0];
  const box = stage.container().getBoundingClientRect();
  const s = stage.scaleX();
  // an empty spot low on slide 1, clear of the photo
  return { x: box.left + stage.x() + 900 * s, y: box.top + stage.y() + 1300 * s, scroll: document.querySelector('[aria-label="Canvas area"]').scrollLeft };
});
await finger("touchStart", panStart.x, panStart.y);
for (let i = 1; i <= 10; i++) await finger("touchMove", panStart.x - i * 12, panStart.y);
await finger("touchEnd", 0, 0);
await phonePage.waitForTimeout(500);
const scrolled = await phonePage.evaluate(() => document.querySelector('[aria-label="Canvas area"]').scrollLeft);
check("touch: dragging on empty canvas pans the slides", scrolled - panStart.scroll > 40, `scrollLeft ${panStart.scroll} -> ${scrolled}`);

const touchAction = await phonePage.evaluate(() => getComputedStyle(window.Konva.stages[0].content).touchAction);
console.log("INFO  Konva stage touch-action:", touchAction);
await axe(phonePage, "S09 editor on a phone");
await phone.close();

check("no console errors or warnings in any page", problems.length === 0, problems.slice(0, 5).join(" | "));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} checks passed`);
fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
