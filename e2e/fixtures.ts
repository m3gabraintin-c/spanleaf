import { test as base, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import path from "node:path";
import { PNG } from "pngjs";
import { unzipSync } from "fflate";
import fs from "node:fs";

export { expect };
export const ASSET = (name: string) => path.resolve("test-output/assets", name);

/**
 * Every test fails on a console error or warning, an uncaught exception, or a 5xx response, on any page
 * it opens. A test that expects one removes it with allow().
 */
export const test = base.extend<{ problems: string[]; allow: (re: RegExp) => void }>({
  problems: [
    async ({ page, context }, use) => {
      const list: string[] = [];
      const watch = (p: Page) => {
        p.on("console", (m) => {
          if (m.type() === "error" || m.type() === "warning") list.push(`console ${m.type()}: ${m.text()}`);
        });
        p.on("pageerror", (e) => list.push(`pageerror: ${e.message}`));
        p.on("response", (r) => {
          if (r.status() >= 500) list.push(`${r.status()} on ${r.url()}`);
        });
      };
      watch(page);
      context.on("page", watch);
      await use(list);
      expect(list, "console errors, uncaught exceptions or 5xx responses").toEqual([]);
    },
    { auto: true },
  ],
  allow: async ({ problems }, use) => {
    await use((re) => {
      for (let i = problems.length - 1; i >= 0; i--) if (re.test(problems[i])) problems.splice(i, 1);
    });
    // anything arriving later is still checked at teardown by the problems fixture
  },
});

// ---------------------------------------------------------------- flows

export async function signIn(page: Page, email = "tester@example.test") {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("**/app");
}

export interface NewProjectOpts {
  name?: string;
  format?: "4:5" | "3:4" | "1:1" | "9:16";
  slides?: number;
}

export async function newProject(page: Page, opts: NewProjectOpts = {}): Promise<string> {
  await page.goto("/app/new");
  if (opts.name !== undefined) await page.getByLabel("Name").fill(opts.name);
  if (opts.format) await page.getByRole("radio", { name: opts.format }).click();
  if (opts.slides) await page.getByLabel("Number of slides").fill(String(opts.slides));
  await page.getByRole("button", { name: "Create project" }).click();
  await page.waitForURL("**/app/project/**");
  await canvasReady(page);
  return page.url().split("/").pop()!;
}

export async function canvasReady(page: Page) {
  await page.getByText(/Slide \d+ of \d+/).waitFor();
  await page.waitForFunction(() => (window as any).Konva?.stages?.length > 0);
}

// ---------------------------------------------------------------- canvas access (reads the real Konva stage)

export interface Geo { s: number; left: number; top: number }
export const geo = (page: Page): Promise<Geo> =>
  page.evaluate(() => {
    const stage = (window as any).Konva.stages[0];
    const box = stage.container().getBoundingClientRect();
    return { s: stage.scaleX(), left: box.left + stage.x(), top: box.top + stage.y() };
  });
export const toScreen = (g: Geo, cx: number, cy: number): [number, number] => [g.left + cx * g.s, g.top + cy * g.s];

export interface Img { id: string; x: number; y: number; w: number; h: number; rotation: number; loaded: boolean }
export const images = (page: Page): Promise<Img[]> =>
  page.evaluate(() =>
    (window as any).Konva.stages[0].find("Image").map((n: any) => ({ id: n.id(), x: n.x(), y: n.y(), w: n.width(), h: n.height(), rotation: n.rotation(), loaded: !!n.image() })),
  );

export async function waitImagesLoaded(page: Page, count?: number) {
  await expect
    .poll(async () => {
      const list = await images(page);
      return list.length > 0 && list.every((i) => i.loaded) && (count === undefined || list.length === count);
    })
    .toBe(true);
}

export async function addPhotos(page: Page, files: string | string[], expectedTotal?: number) {
  const list = Array.isArray(files) ? files : [files];
  await page.locator('input[type="file"]').setInputFiles(list);
  await waitImagesLoaded(page, expectedTotal ?? list.length);
}

/** Press on the photo's centre and drag it by (dx, dy) canvas pixels. */
export async function dragImage(page: Page, index: number, dx: number, dy: number) {
  const g = await geo(page);
  const img = (await images(page))[index];
  const [sx, sy] = toScreen(g, img.x + img.w / 2, img.y + img.h / 2);
  const [tx, ty] = toScreen(g, img.x + img.w / 2 + dx, img.y + img.h / 2 + dy);
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move((sx + tx) / 2, (sy + ty) / 2, { steps: 6 });
  await page.mouse.move(tx, ty, { steps: 6 });
  await page.mouse.up();
}

export async function waitSaved(page: Page) {
  await page.getByText("Saved", { exact: true }).waitFor({ timeout: 10_000 });
}

export async function readProject(page: Page, id: string): Promise<any> {
  return page.evaluate(
    (pid) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("carousel-fake");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const r = open.result.transaction("kv", "readonly").objectStore("kv").get(`project:${pid}`);
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        };
      }),
    id,
  );
}

// ---------------------------------------------------------------- export

export interface Exported { filename: string; names: string[]; slides: PNG[] }
export async function exportZip(page: Page): Promise<Exported> {
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export" }).click();
  const d = await dl;
  const p = path.resolve("test-output", `dl-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`);
  await d.saveAs(p);
  const files = unzipSync(new Uint8Array(fs.readFileSync(p)));
  const names = Object.keys(files).sort();
  return { filename: d.suggestedFilename(), names, slides: names.map((n) => PNG.sync.read(Buffer.from(files[n]))) };
}

export const px = (img: PNG, x: number, y: number) => {
  const i = (img.width * y + x) << 2;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
};
export const isWhite = (p: number[]) => p[0] === 255 && p[1] === 255 && p[2] === 255 && p[3] === 255;

export async function axeClean(page: Page, label: string) {
  const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa", "best-practice"]).analyze();
  expect(res.violations.map((v) => `${label}: ${v.id} ${v.nodes[0].target.join(" ")}`), `axe on ${label}`).toEqual([]);
}

// ---------------------------------------------------------------- editing helpers

/** Opens a tool in the rail (Media, Text, Layers, Colour ...) if it isn't open already. */
export async function openTool(page: Page, name: string) {
  const b = page.getByRole("navigation", { name: "Editor tools" }).getByRole("button", { name });
  if ((await b.getAttribute("aria-pressed")) !== "true") await b.click();
  await page.getByRole("region", { name, exact: true }).waitFor();
}

export const elementsOf = async (page: Page, id: string): Promise<any[]> => (await readProject(page, id)).doc.elements;

export const texts = (page: Page): Promise<{ id: string; x: number; y: number; w: number; h: number; text: string; size: number; font: string }[]> =>
  page.evaluate(() =>
    (window as any).Konva.stages[0].find("Text").map((n: any) => ({ id: n.id(), x: n.x(), y: n.y(), w: n.width(), h: n.height(), text: n.text(), size: n.fontSize(), font: n.fontFamily() })),
  );

export const guideCount = (page: Page): Promise<number> => page.evaluate(() => (window as any).Konva.stages[0].find(".guide").length);

/** Click the middle of the nth photo, which selects it. */
export async function clickImage(page: Page, index: number) {
  const g = await geo(page);
  const img = (await images(page))[index];
  await page.mouse.click(g.left + (img.x + img.w / 2) * g.s, g.top + (img.y + img.h / 2) * g.s);
}

/** The smallest box around every pixel that isn't the given background colour. */
export function inkBox(img: PNG, bg: number[] = [255, 255, 255]) {
  let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1;
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++) {
      const p = px(img, x, y);
      if (Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) > 60) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
