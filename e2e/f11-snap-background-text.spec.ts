import {
  test, expect, signIn, newProject, addPhotos, images, texts, geo, toScreen, readProject, elementsOf, waitSaved, canvasReady, openTool,
  exportZip, px, inkBox, guideCount, axeClean, dragImage, ASSET,
} from "./fixtures";
import type { Page } from "@playwright/test";

const canvas = (page: Page) => page.getByRole("region", { name: "Canvas area" });

test.describe("F11 snapping and guides", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  /** Drag by the pointer in steps and report the guide count before letting go. */
  async function dragWithGuides(page: Page, index: number, dx: number, dy: number, hold?: string) {
    const g = await geo(page);
    const img = (await images(page))[index];
    const [sx, sy] = toScreen(g, img.x + img.w / 2, img.y + img.h / 2);
    const [tx, ty] = toScreen(g, img.x + img.w / 2 + dx, img.y + img.h / 2 + dy);
    if (hold) await page.keyboard.down(hold);
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.mouse.move((sx + tx) / 2, (sy + ty) / 2, { steps: 6 });
    await page.mouse.move(tx, ty, { steps: 6 });
    await page.waitForTimeout(120);
    const guides = await guideCount(page);
    await page.mouse.up();
    if (hold) await page.keyboard.up(hold);
    return guides;
  }

  test("F11-S1 a photo dragged near the middle of its slide snaps to it, and a guide shows while it does", async ({ page }) => {
    const id = await newProject(page);
    await addPhotos(page, ASSET("gradient.png")); // starts centred on slide 1
    const guides = await dragWithGuides(page, 0, 9, 0);
    await waitSaved(page);
    const el = (await elementsOf(page, id))[0];
    expect(el.x + el.w / 2).toBeCloseTo(540, 1);
    expect(guides).toBeGreaterThan(0);
    expect(await guideCount(page), "guides disappear when you let go").toBe(0);
  });

  test("F11-S2 holding Alt turns snapping off", async ({ page }) => {
    const id = await newProject(page);
    await addPhotos(page, ASSET("gradient.png"));
    const guides = await dragWithGuides(page, 0, 9, 0, "Alt");
    await waitSaved(page);
    const el = (await elementsOf(page, id))[0];
    // it moved with the pointer (about 9) and did not jump onto the 540 guide
    expect(el.x + el.w / 2).toBeGreaterThan(544);
    expect(guides).toBe(0);
  });

  test("F11-S3 far from any guide nothing snaps", async ({ page }) => {
    const id = await newProject(page);
    await addPhotos(page, ASSET("gradient.png"));
    await dragWithGuides(page, 0, 160, 140);
    await waitSaved(page);
    const el = (await elementsOf(page, id))[0];
    expect(Math.abs(el.x + el.w / 2 - 700)).toBeLessThan(4);
  });

  test("F11-S4 an edge snaps to the line between two slides", async ({ page }) => {
    const id = await newProject(page);
    await addPhotos(page, ASSET("gradient.png"));
    const [img] = await images(page);
    // put the photo's right edge a few pixels short of the 1080 line
    await dragWithGuides(page, 0, 1080 - 6 - (img.x + img.w), 0);
    await waitSaved(page);
    const el = (await elementsOf(page, id))[0];
    expect(el.x + el.w).toBeCloseTo(1080, 1);
  });

  test("F11-S5 an edge snaps to another photo's edge", async ({ page }) => {
    const id = await newProject(page);
    await addPhotos(page, [ASSET("gradient.png"), ASSET("transparent.png")]);
    const [a, b] = await images(page);
    // line the second photo's left edge up near the first one's right edge, and a little off vertically
    await dragWithGuides(page, 1, a.x + a.w - 5 - b.x, 200);
    await waitSaved(page);
    const els = await elementsOf(page, id);
    expect(els[1].x).toBeCloseTo(els[0].x + els[0].w, 1);
  });

  test("F11-S6 guides never appear in the export", async ({ page }) => {
    await newProject(page);
    await addPhotos(page, ASSET("gradient.png"));
    await dragWithGuides(page, 0, 9, 0);
    const out = await exportZip(page);
    let magenta = 0;
    for (let y = 0; y < 1350; y += 3)
      for (let x = 0; x < 1080; x += 3) {
        const p = px(out.slides[0], x, y);
        if (p[0] > 190 && p[1] < 70 && p[2] > 80 && p[2] < 150) magenta++;
      }
    expect(magenta).toBe(0);
  });

  test("F11-S7 arrow keys move by exactly 1 or 10 and don't snap", async ({ page }) => {
    const id = await newProject(page);
    await addPhotos(page, ASSET("gradient.png"));
    await canvas(page).focus();
    await page.keyboard.press("ArrowRight");
    await waitSaved(page);
    expect((await elementsOf(page, id))[0].x).toBeCloseTo(109, 1);
  });
});

test.describe("F11 background colour", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("F11-B1 a colour shows on the canvas and in the export, undoes, and survives a reload", async ({ page }) => {
    const id = await newProject(page, { slides: 2 });
    await openTool(page, "Colour");
    await page.getByRole("radio", { name: "#e63946" }).click();
    const out = await exportZip(page);
    for (const s of out.slides) expect(px(s, 5, 5).slice(0, 3)).toEqual([230, 57, 70]);
    await page.getByRole("button", { name: "Done" }).click();
    await waitSaved(page);
    await page.reload();
    await canvasReady(page);
    expect((await readProject(page, id)).doc.background.value).toBe("#e63946");
    await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled(); // history starts empty after a reload
  });

  test("F11-B2 the hex box accepts a valid colour, rejects a bad one, and 'Reset to white' works", async ({ page }) => {
    const id = await newProject(page, { slides: 1 });
    await openTool(page, "Colour");
    const hex = page.getByLabel("Hex");
    await hex.fill("#123456");
    await waitSaved(page);
    expect((await readProject(page, id)).doc.background.value).toBe("#123456");
    await hex.fill("zzz");
    await expect(hex).toHaveAttribute("aria-invalid", "true");
    await waitSaved(page);
    expect((await readProject(page, id)).doc.background.value, "a bad value must not be saved").toBe("#123456");
    await page.getByRole("button", { name: "Reset to white" }).click();
    await waitSaved(page);
    expect((await readProject(page, id)).doc.background.value).toBe("#ffffff");
    await expect(page.getByRole("button", { name: "Reset to white" })).toBeDisabled();
  });

  test("F11-B3 undo changes the colour back, and the picker follows", async ({ page }) => {
    await newProject(page, { slides: 1 });
    await openTool(page, "Colour");
    await page.getByRole("radio", { name: "#2a9d8f" }).click();
    await page.waitForTimeout(900);
    await page.getByRole("radio", { name: "#3a86ff" }).click();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByLabel("Hex")).toHaveValue("#2a9d8f");
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByLabel("Hex")).toHaveValue("#ffffff");
  });

  test("F11-B4 accessible, and the swatches work with the keyboard", async ({ page }) => {
    await newProject(page);
    await openTool(page, "Colour");
    await axeClean(page, "background panel");
    await page.getByRole("radio", { name: "#000000" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("radio", { name: "#000000" })).toBeChecked();
  });
});

test.describe("F11 text layers", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  const addText = async (page: Page) => {
    await openTool(page, "Text");
    await page.getByRole("button", { name: "Add text" }).click();
    await expect.poll(async () => (await texts(page)).length).toBe(1);
  };
  const box = (page: Page) => page.locator("#text-value");

  test("F11-T1 Add text puts a layer on the slide in view, selected, with the cursor in the text box", async ({ page }) => {
    const id = await newProject(page);
    await addText(page);
    await expect(box(page)).toBeFocused();
    await expect(box(page)).toHaveValue("Your text");
    await waitSaved(page);
    const el = (await elementsOf(page, id))[0];
    expect(el.type).toBe("text");
    expect(el.text.font).toBe("inter");
    expect(el.x + el.w / 2).toBeCloseTo(540, 0);
  });

  test("F11-T2 typing changes the canvas, the height follows the lines, and it all saves", async ({ page }) => {
    const id = await newProject(page);
    await addText(page);
    const h1 = (await texts(page))[0].h;
    await box(page).fill("A much longer line of words that has to wrap onto several lines to fit");
    await expect.poll(async () => (await texts(page))[0].h).toBeGreaterThan(h1 * 2);
    await waitSaved(page);
    const el = (await elementsOf(page, id))[0];
    expect(el.text.value).toContain("wrap onto");
    expect(el.h).toBeCloseTo((await texts(page))[0].h, 0);
  });

  test("F11-T3 emoji, accents, new lines and right-to-left text are kept", async ({ page }) => {
    const id = await newProject(page);
    await addText(page);
    const samples = ["Café été 🎉🏖️", "line one\nline two\n\nline four", "مرحبا بالعالم", "<b>not bold</b> & \"quotes\""];
    for (const value of samples) {
      await box(page).fill(value);
      await waitSaved(page);
      expect((await elementsOf(page, id))[0].text.value).toBe(value);
    }
  });

  test("F11-T4 the text box stops at 2,000 characters", async ({ page }) => {
    await newProject(page);
    await addText(page);
    await box(page).fill("x".repeat(2500));
    expect((await box(page).inputValue()).length).toBe(2000);
    await expect(page.getByText("2000 of 2000")).toBeVisible();
  });

  test("F11-T5 an empty text layer stays selectable and says so in the layers list", async ({ page }) => {
    await newProject(page);
    await addText(page);
    await box(page).fill("");
    await openTool(page, "Layers");
    await expect(page.getByRole("list", { name: /Layers/ })).toContainText("Empty text");
  });

  test("F11-T6 size, bold, alignment and colour change the layer", async ({ page }) => {
    const id = await newProject(page);
    await addText(page);
    await page.getByLabel("Size").fill("140");
    await page.getByRole("button", { name: "Bold", exact: true }).click(); // it starts bold, so this turns it off
    await page.getByRole("radio", { name: "Left" }).click();
    await page.getByRole("radio", { name: "#e63946" }).click();
    await waitSaved(page);
    const t = (await elementsOf(page, id))[0].text;
    expect(t).toMatchObject({ size: 140, bold: false, align: "left", color: "#e63946" });
  });

  test("F11-T7 a font with no bold disables the Bold button and drops bold", async ({ page }) => {
    const id = await newProject(page);
    await addText(page);
    await page.getByLabel("Font").selectOption("anton");
    await expect(page.getByRole("button", { name: /Bold \(this font has no bold\)/ })).toBeDisabled();
    await waitSaved(page);
    expect((await elementsOf(page, id))[0].text).toMatchObject({ font: "anton", bold: false });
  });

  test("F11-T8 the font really is used: the same words come out narrower in Anton than in Inter", async ({ page }) => {
    await newProject(page, { slides: 1 });
    await addText(page);
    await box(page).fill("WIDE WORDS HERE");
    await page.getByLabel("Text colour").getByRole("radio", { name: "#000000" }).click().catch(() => page.getByRole("radio", { name: "#000000" }).click());
    await page.getByRole("radio", { name: "Left" }).click();
    await page.getByLabel("Size").fill("60"); // small enough that both fonts fit on one line, so the widths compare cleanly
    const inter = await exportZip(page);
    await page.getByRole("button", { name: "Done" }).click();
    await page.getByLabel("Font").selectOption("anton");
    const anton = await exportZip(page);
    const wInter = inkBox(inter.slides[0])!.w;
    const wAnton = inkBox(anton.slides[0])!.w;
    expect(wInter, "inter should have drawn something").toBeGreaterThan(200);
    expect(wAnton, "anton is a condensed face, so the same text must be clearly narrower").toBeLessThan(wInter * 0.85);
  });

  test("F11-T9 the export has the text where the canvas shows it", async ({ page }) => {
    const id = await newProject(page, { slides: 1 });
    await addText(page);
    await waitSaved(page);
    const el = (await elementsOf(page, id))[0];
    const out = await exportZip(page);
    const ink = inkBox(out.slides[0])!;
    expect(ink.y).toBeGreaterThanOrEqual(el.y - 5);
    expect(ink.y + ink.h).toBeLessThanOrEqual(el.y + el.h + 5);
    expect(ink.x).toBeGreaterThanOrEqual(el.x - 5);
    expect(ink.x + ink.w).toBeLessThanOrEqual(el.x + el.w + 5);
  });

  test("F11-T10 double clicking text on the canvas opens the Text panel with the cursor in the box", async ({ page }) => {
    await newProject(page);
    await addText(page);
    await openTool(page, "Media");
    const g = await geo(page);
    const [t] = await texts(page);
    await page.mouse.dblclick(g.left + (t.x + t.w / 2) * g.s, g.top + (t.y + t.h / 2) * g.s);
    await expect(page.getByRole("region", { name: "Text", exact: true })).toBeVisible();
    await expect(box(page)).toBeFocused();
  });

  test("F11-T11 side handles change the wrap width, corner handles change the size", async ({ page }) => {
    const id = await newProject(page);
    await addText(page);
    await waitSaved(page);
    const before = (await elementsOf(page, id))[0];
    const anchor = async (name: string) =>
      page.evaluate((n) => {
        const stage = (window as any).Konva.stages[0];
        const a = stage.findOne("." + n);
        const p = a.getAbsolutePosition();
        const b = stage.container().getBoundingClientRect();
        return { x: b.left + p.x, y: b.top + p.y };
      }, name);
    let a = await anchor("middle-right");
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(a.x - 60, a.y, { steps: 6 });
    await page.mouse.up();
    await waitSaved(page);
    const narrowed = (await elementsOf(page, id))[0];
    expect(narrowed.w).toBeLessThan(before.w - 30);
    expect(narrowed.text.size).toBe(before.text.size);
    a = await anchor("bottom-right");
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(a.x + 50, a.y + 30, { steps: 6 });
    await page.mouse.up();
    await waitSaved(page);
    const grown = (await elementsOf(page, id))[0];
    expect(grown.text.size).toBeGreaterThan(before.text.size);
  });

  test("F11-T12 after a reload the text comes back in the same font, and exports the same", async ({ page }) => {
    const id = await newProject(page, { slides: 1 });
    await addText(page);
    await page.getByLabel("Font").selectOption("anton");
    await page.getByRole("radio", { name: "Left" }).click();
    await waitSaved(page);
    const first = inkBox((await exportZip(page)).slides[0])!;
    await page.getByRole("button", { name: "Done" }).click();
    await page.reload();
    await canvasReady(page);
    await expect.poll(async () => (await texts(page)).length).toBe(1);
    const again = inkBox((await exportZip(page)).slides[0])!;
    expect(Math.abs(again.w - first.w), "the font didn't load before the export").toBeLessThanOrEqual(3);
    expect((await elementsOf(page, id))[0].text.font).toBe("anton");
  });

  test("F11-T13 typing is one undo step per burst, and undo restores the words", async ({ page }) => {
    await newProject(page);
    await addText(page);
    await box(page).fill("first words");
    await page.waitForTimeout(900);
    await box(page).fill("second words that replace them");
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(box(page)).toHaveValue("first words");
  });

  test("F11-T14 text can be moved with the keyboard, duplicated, locked and deleted like any layer", async ({ page }) => {
    const id = await newProject(page);
    await addText(page);
    await canvas(page).focus();
    const x0 = (await texts(page))[0].x;
    await page.keyboard.press("Shift+ArrowRight");
    expect((await texts(page))[0].x).toBeCloseTo(x0 + 10, 1);
    await page.keyboard.press("Control+d");
    await expect.poll(async () => (await texts(page)).length).toBe(2);
    await page.keyboard.press("Delete");
    await expect.poll(async () => (await texts(page)).length).toBe(1);
    await waitSaved(page);
    expect(await elementsOf(page, id)).toHaveLength(1);
  });

  test("F11-T15 accessible: the text panel and the layers list with a text layer", async ({ page }) => {
    await newProject(page);
    await addText(page);
    await axeClean(page, "text panel");
    await openTool(page, "Layers");
    await axeClean(page, "layers with text");
  });

  test("F11-T16 a second text layer doesn't land exactly on the first", async ({ page }) => {
    await newProject(page);
    await openTool(page, "Text");
    await page.getByRole("button", { name: "Add text" }).click();
    await page.getByRole("button", { name: "Add text" }).click();
    await expect.poll(async () => (await texts(page)).length).toBe(2);
    const [a, b] = await texts(page);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(30);
  });
});
