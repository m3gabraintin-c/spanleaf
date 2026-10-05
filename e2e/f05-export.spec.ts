import { test, expect, signIn, newProject, addPhotos, exportZip, images, canvasReady, waitSaved, isWhite, px, ASSET } from "./fixtures";

test.describe("F05 export", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("F05-H1 one PNG per slide in a zip named after the project", async ({ page }) => {
    await newProject(page, { name: "Beach Trip 2026", slides: 4 });
    await addPhotos(page, ASSET("gradient.png"));
    const out = await exportZip(page);
    expect(out.filename).toBe("beach-trip-2026.zip");
    expect(out.names).toEqual(["slide-01.png", "slide-02.png", "slide-03.png", "slide-04.png"]);
  });

  test("F05-E1 every format exports at its own size", async ({ page }) => {
    const want: Record<string, [number, number]> = { "4:5": [1080, 1350], "3:4": [1080, 1440], "1:1": [1080, 1080], "9:16": [1080, 1920] };
    for (const [fmt, [w, h]] of Object.entries(want)) {
      await newProject(page, { format: fmt as "4:5", slides: 2 });
      const out = await exportZip(page);
      expect(out.slides.map((s) => `${s.width}x${s.height}`), fmt).toEqual([`${w}x${h}`, `${w}x${h}`]);
      await page.getByRole("button", { name: "Done" }).click();
    }
  });

  test("F05-E2 file names: accents are kept as plain letters, emoji-only and symbols fall back sensibly", async ({ page }) => {
    const cases: [string, RegExp][] = [
      ["Café été", /^cafe-ete\.zip$/],
      ["🎉🎉", /^project\.zip$/],
      ["a/b\\c:d*e?f", /^a-b-c-d-e-f\.zip$/],
      ["  ..hidden..  ", /^hidden\.zip$/],
      ["x".repeat(80), /^x{60}\.zip$/],
    ];
    for (const [name, re] of cases) {
      await newProject(page, { name, slides: 1 });
      const out = await exportZip(page);
      expect(out.filename, name).toMatch(re);
      await page.getByRole("button", { name: "Done" }).click();
    }
  });

  test("F05-E3 double clicking Export gives one download", async ({ page }) => {
    await newProject(page, { slides: 2 });
    let downloads = 0;
    page.on("download", () => downloads++);
    const btn = page.getByRole("button", { name: "Export" });
    await btn.dblclick();
    await expect(page.getByRole("dialog")).toContainText("Your slides are ready", { timeout: 15000 });
    await page.waitForTimeout(500);
    expect(downloads).toBe(1);
  });

  test("F05-E4 Download again hands over the same zip", async ({ page }) => {
    await newProject(page, { name: "again", slides: 2 });
    await exportZip(page);
    const dl = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download again" }).click();
    expect((await dl).suggestedFilename()).toBe("again.zip");
  });

  test("F05-E5 an empty project exports plain white slides", async ({ page }) => {
    await newProject(page, { slides: 3 });
    const out = await exportZip(page);
    for (const s of out.slides) for (const [x, y] of [[0, 0], [540, 675], [1079, 1349]]) expect(isWhite(px(s, x, y))).toBe(true);
  });

  test("F05-E6 ten slides with a big photo across them exports in reasonable time", async ({ page }) => {
    await newProject(page, { slides: 10 });
    await addPhotos(page, ASSET("huge.jpg"));
    const t0 = Date.now();
    const out = await exportZip(page);
    expect(out.slides).toHaveLength(10);
    expect(Date.now() - t0).toBeLessThan(20_000);
  });

  test("F05-E7 it works with no network at all (everything is local in this build)", async ({ page, context }) => {
    await newProject(page, { slides: 2 });
    await addPhotos(page, ASSET("gradient.png"));
    await context.setOffline(true);
    const out = await exportZip(page);
    expect(out.slides).toHaveLength(2);
    await context.setOffline(false);
  });

  test("F05-E8 exporting right after an edit includes that edit", async ({ page }) => {
    await newProject(page);
    await addPhotos(page, ASSET("gradient.png"));
    await page.getByRole("region", { name: "Canvas area" }).focus();
    for (let i = 0; i < 5; i++) await page.keyboard.press("Shift+ArrowDown");
    const [img] = await images(page);
    const out = await exportZip(page); // before autosave has run
    const y = Math.round(img.y + 5);
    expect(isWhite(px(out.slides[0], Math.round(img.x + img.w / 2), y))).toBe(false);
    expect(isWhite(px(out.slides[0], Math.round(img.x + img.w / 2), Math.round(img.y - 20)))).toBe(true);
  });

  test("F05-E9 Escape can't cancel a render halfway, and focus returns to Export afterwards", async ({ page }) => {
    await newProject(page, { slides: 6 });
    await addPhotos(page, ASSET("huge.jpg"));
    const dl = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeVisible();
    await dl;
    await expect(page.getByRole("dialog")).toContainText("Your slides are ready");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Export" })).toBeFocused();
  });

  test("F05-E10 zoomed all the way in, the export is still 1080 wide", async ({ page }) => {
    await newProject(page, { slides: 3 });
    const zin = page.getByRole("button", { name: "Zoom in" });
    while (await zin.isEnabled()) await zin.click();
    const out = await exportZip(page);
    expect(out.slides.every((s) => s.width === 1080 && s.height === 1350)).toBe(true);
  });

  test("F05-A1 accessibility with the export dialog open", async ({ page }) => {
    const { axeClean } = await import("./fixtures");
    await newProject(page, { slides: 2 });
    await exportZip(page);
    await axeClean(page, "S17 export done");
    await canvasReady(page);
    await waitSaved(page);
  });
});
