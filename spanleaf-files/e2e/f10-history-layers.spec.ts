import {
  test, expect, signIn, newProject, addPhotos, images, dragImage, clickImage, geo, toScreen, readProject, elementsOf, waitSaved,
  waitImagesLoaded, canvasReady, openTool, exportZip, px, guideCount, axeClean, ASSET,
} from "./fixtures";

test.describe("F10 undo, redo, duplicate, lock and the layers panel", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  const undo = (page: import("@playwright/test").Page) => page.getByRole("button", { name: "Undo" });
  const redo = (page: import("@playwright/test").Page) => page.getByRole("button", { name: "Redo" });
  const canvas = (page: import("@playwright/test").Page) => page.getByRole("region", { name: "Canvas area" });

  test("F10-U1 undo and redo with the buttons, and with Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y", async ({ page }) => {
    await newProject(page);
    await expect(undo(page)).toBeDisabled();
    await expect(redo(page)).toBeDisabled();
    await addPhotos(page, ASSET("gradient.png"));
    await expect(undo(page)).toBeEnabled();
    await undo(page).click();
    expect(await images(page)).toHaveLength(0);
    await expect(redo(page)).toBeEnabled();
    await redo(page).click();
    await waitImagesLoaded(page, 1);
    await canvas(page).focus();
    await page.keyboard.press("Control+z");
    expect(await images(page)).toHaveLength(0);
    await page.keyboard.press("Control+Shift+z");
    await waitImagesLoaded(page, 1);
    await page.keyboard.press("Control+z");
    await page.keyboard.press("Control+y");
    await waitImagesLoaded(page, 1);
  });

  test("F10-U2 twenty arrow presses are one undo step", async ({ page }) => {
    await newProject(page);
    await addPhotos(page, ASSET("gradient.png"));
    const x0 = (await images(page))[0].x;
    await canvas(page).focus();
    for (let i = 0; i < 20; i++) await page.keyboard.press("ArrowRight");
    expect((await images(page))[0].x).toBeCloseTo(x0 + 20, 1);
    await undo(page).click();
    expect((await images(page))[0].x).toBeCloseTo(x0, 1);
  });

  test("F10-U3 undoing a drag puts the photo back, and redo moves it again", async ({ page }) => {
    await newProject(page);
    await addPhotos(page, ASSET("gradient.png"));
    const before = (await images(page))[0];
    await dragImage(page, 0, 250, 120);
    const moved = (await images(page))[0];
    expect(moved.x).toBeGreaterThan(before.x + 100);
    await undo(page).click();
    expect((await images(page))[0].x).toBeCloseTo(before.x, 0);
    await redo(page).click();
    expect((await images(page))[0].x).toBeCloseTo(moved.x, 0);
  });

  test("F10-U4 in a text box, Ctrl+Z undoes the typing, not the layers", async ({ page }) => {
    await newProject(page);
    await addPhotos(page, ASSET("gradient.png"));
    await openTool(page, "Text");
    await page.getByRole("button", { name: "Add text" }).click();
    const box = page.locator("#text-value");
    await box.fill("Hello there");
    await box.focus();
    await page.keyboard.press("End");
    await page.keyboard.type(" friend");
    await page.keyboard.press("Control+z");
    expect((await images(page)).length, "the photo must still be there").toBe(1);
    await expect(box).not.toHaveValue("Hello there friend");
  });

  test("F10-U5 history is empty after a reload, and an undo is saved", async ({ page }) => {
    const id = await newProject(page);
    await addPhotos(page, ASSET("gradient.png"));
    await addPhotos(page, ASSET("transparent.png"), 2);
    await undo(page).click();
    await waitSaved(page);
    expect(await elementsOf(page, id)).toHaveLength(1);
    await page.reload();
    await canvasReady(page);
    await waitImagesLoaded(page, 1);
    await expect(undo(page)).toBeDisabled();
  });

  test("F10-U6 a new edit after undo removes the redo", async ({ page }) => {
    await newProject(page);
    await addPhotos(page, ASSET("gradient.png"));
    await undo(page).click();
    await expect(redo(page)).toBeEnabled();
    await addPhotos(page, ASSET("transparent.png"));
    await expect(redo(page)).toBeDisabled();
  });

  test("F10-D1 Ctrl+D copies the layer just above it, selects the copy, and undo removes it", async ({ page }) => {
    const id = await newProject(page);
    await addPhotos(page, ASSET("gradient.png"));
    const [a] = await images(page);
    await canvas(page).focus();
    await page.keyboard.press("Control+d");
    const after = await images(page);
    expect(after).toHaveLength(2);
    expect(after[1].x - a.x).toBeCloseTo(48, 0);
    expect(after[1].y - a.y).toBeCloseTo(48, 0);
    await waitSaved(page);
    const els = await elementsOf(page, id);
    expect(els[1].mediaId).toBe(els[0].mediaId);
    expect(els[1].id).not.toBe(els[0].id);
    const handles = await page.evaluate(() => (window as any).Konva.stages[0].find("Transformer")[0].nodes()[0]?.id());
    expect(handles).toBe(els[1].id);
    await undo(page).click();
    expect(await images(page)).toHaveLength(1);
  });

  test("F10-D2 the menu's Duplicate does the same", async ({ page }) => {
    await newProject(page);
    await addPhotos(page, ASSET("gradient.png"));
    await page.getByRole("toolbar", { name: "Selected element" }).getByRole("button", { name: "Duplicate" }).click();
    expect(await images(page)).toHaveLength(2);
  });

  test("F10-M1 the floating menu sits above the selection, follows it, and goes away with the selection", async ({ page }) => {
    await newProject(page);
    await addPhotos(page, ASSET("gradient.png"));
    const menu = page.getByRole("toolbar", { name: "Selected element" });
    await expect(menu).toBeVisible();
    const photoTop = async () => {
      const g = await geo(page);
      const [img] = await images(page);
      return g.top + img.y * g.s;
    };
    const box1 = (await menu.boundingBox())!;
    expect(box1.y + box1.height).toBeLessThanOrEqual((await photoTop()) + 1);
    await dragImage(page, 0, 120, 60);
    await expect(menu).toBeVisible();
    const box2 = (await menu.boundingBox())!;
    expect(box2.y + box2.height).toBeLessThanOrEqual((await photoTop()) + 1);
    expect(box2.x).not.toBeCloseTo(box1.x, 0);
    await canvas(page).focus();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
  });

  test("F10-M2 near the top edge the menu moves below the photo instead of going off screen", async ({ page }) => {
    await newProject(page);
    await addPhotos(page, ASSET("gradient.png"));
    const [img] = await images(page);
    await dragImage(page, 0, 0, -img.y - 20); // up against the top
    const menu = page.getByRole("toolbar", { name: "Selected element" });
    await expect(menu).toBeVisible();
    const box = (await menu.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    const g = await geo(page);
    const [now] = await images(page);
    expect(box.y).toBeGreaterThanOrEqual(g.top + now.y * g.s);
  });

  test("F10-M3 the menu is a toolbar the keyboard can reach, and works", async ({ page }) => {
    await newProject(page);
    await addPhotos(page, ASSET("gradient.png"));
    const menu = page.getByRole("toolbar", { name: "Selected element" });
    await menu.getByRole("button", { name: "Lock" }).focus();
    await page.keyboard.press("Enter");
    await expect(menu.getByRole("button", { name: "Unlock" })).toBeVisible();
    await expect(menu.getByRole("button", { name: "Delete" })).toBeDisabled();
  });

  test("F10-L1 a locked layer can be selected but not moved, nudged, resized, reordered or deleted, and unlocking restores it all", async ({ page }) => {
    const id = await newProject(page);
    await addPhotos(page, [ASSET("gradient.png"), ASSET("transparent.png")]);
    await page.getByRole("toolbar", { name: "Selected element" }).getByRole("button", { name: "Lock" }).click();
    const [, b] = await images(page);
    await dragImage(page, 1, 200, 100);
    await canvas(page).focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("]");
    await page.keyboard.press("Delete");
    const after = (await images(page))[1];
    expect([after.x, after.y]).toEqual([b.x, b.y]);
    expect(await images(page)).toHaveLength(2);
    const handles = await page.evaluate(() => (window as any).Konva.stages[0].find("Transformer")[0].nodes().length);
    expect(handles, "a locked layer has no resize handles").toBe(0);
    await page.getByRole("toolbar", { name: "Selected element" }).getByRole("button", { name: "Unlock" }).click();
    await dragImage(page, 1, 200, 100);
    expect((await images(page))[1].x).toBeGreaterThan(b.x + 100);
    await waitSaved(page);
    expect((await elementsOf(page, id))[1].locked).toBe(false);
  });

  test("F10-P1 the layers panel lists photos front first, and clicking a row selects it", async ({ page }) => {
    await newProject(page);
    await addPhotos(page, [ASSET("gradient.png"), ASSET("transparent.png")]);
    await openTool(page, "Layers");
    const rows = page.getByRole("list", { name: /Layers/ }).getByRole("listitem");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("transparent.png");
    await expect(rows.nth(1)).toContainText("gradient.png");
    const id = await page.evaluate(() => (window as any).Konva.stages[0].find("Image")[0].id());
    await rows.nth(1).getByRole("button", { name: /^gradient\.png/ }).click();
    const selected = await page.evaluate(() => (window as any).Konva.stages[0].find("Transformer")[0].nodes()[0]?.id());
    expect(selected).toBe(id);
  });

  test("F10-P2 Bring forward and Send backward change what is on top, in the export too", async ({ page }) => {
    await newProject(page, { slides: 1 });
    await addPhotos(page, [ASSET("gradient.png"), ASSET("transparent.png")]);
    // both land near the middle of the slide. The solid green half of transparent.png is on top.
    const [grad, tr] = await images(page);
    const probeX = Math.round(tr.x + tr.w * 0.75);
    const probeY = Math.round(tr.y + tr.h / 2);
    expect(probeX).toBeGreaterThan(grad.x);
    const top = await exportZip(page);
    expect(px(top.slides[0], probeX, probeY)[1]).toBeGreaterThan(120); // green
    await page.getByRole("button", { name: "Done" }).click();
    await openTool(page, "Layers");
    await page.getByRole("button", { name: "Send backward" }).click();
    const back = await exportZip(page);
    const p = px(back.slides[0], probeX, probeY);
    expect(p[0] + p[2], "now the gradient is on top, so the pixel is reddish or bluish").toBeGreaterThan(150);
  });

  test("F10-P3 Alt+Up and Alt+Down on a layer row reorder it", async ({ page }) => {
    await newProject(page);
    await addPhotos(page, [ASSET("gradient.png"), ASSET("transparent.png")]);
    await openTool(page, "Layers");
    const before = await page.evaluate(() => (window as any).Konva.stages[0].find("Image").map((n: any) => n.id()));
    const rows = page.getByRole("list", { name: /Layers/ }).getByRole("listitem");
    await rows.nth(1).getByRole("button", { name: /^gradient\.png/ }).focus();
    await page.keyboard.press("Alt+ArrowUp");
    const after = await page.evaluate(() => (window as any).Konva.stages[0].find("Image").map((n: any) => n.id()));
    expect(after).toEqual([before[1], before[0]]);
    await expect(rows.nth(0)).toContainText("gradient.png");
  });

  test("F10-P4 dragging a row's handle reorders the layers", async ({ page }) => {
    await newProject(page);
    await addPhotos(page, [ASSET("gradient.png"), ASSET("transparent.png")]);
    await openTool(page, "Layers");
    const rows = page.getByRole("list", { name: /Layers/ }).getByRole("listitem");
    const grip = rows.nth(1).getByRole("button", { name: /Reorder/ });
    const target = rows.nth(0);
    const gb = (await grip.boundingBox())!;
    const tb = (await target.boundingBox())!;
    await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2);
    await page.mouse.down();
    await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2 - 10, { steps: 4 });
    await page.mouse.move(gb.x + gb.width / 2, tb.y + 4, { steps: 8 });
    await page.mouse.up();
    await expect(rows.nth(0)).toContainText("gradient.png");
  });

  test("F10-P5 dragging with the keyboard: Space, arrow, Space", async ({ page }) => {
    await newProject(page);
    await addPhotos(page, [ASSET("gradient.png"), ASSET("transparent.png")]);
    await openTool(page, "Layers");
    const rows = page.getByRole("list", { name: /Layers/ }).getByRole("listitem");
    await rows.nth(1).getByRole("button", { name: /Reorder/ }).focus();
    await page.keyboard.press("Space");
    await page.waitForTimeout(250); // the drag library takes a moment to start listening for the arrow keys
    await page.keyboard.press("ArrowUp");
    await page.waitForTimeout(250);
    await page.keyboard.press("Space");
    await expect(rows.nth(0)).toContainText("gradient.png");
  });

  test("F10-P6 position, size and rotation can be typed in, and a photo keeps its shape", async ({ page }) => {
    const id = await newProject(page);
    await addPhotos(page, ASSET("gradient.png"));
    await openTool(page, "Layers");
    const panel = page.getByRole("region", { name: "Layers", exact: true });
    const [before] = await images(page);
    await panel.getByLabel("X", { exact: true }).fill("300");
    await panel.getByLabel("Y", { exact: true }).fill("200");
    await panel.getByLabel("Width").fill("432");
    await panel.getByLabel("Rotation").fill("15");
    await waitSaved(page);
    const el = (await elementsOf(page, id))[0];
    expect(el.x).toBe(300);
    expect(el.y).toBe(200);
    expect(el.w).toBe(432);
    expect(el.h).toBeCloseTo((before.h * 432) / before.w, 1);
    expect(el.rotation).toBe(15);
  });

  test("F10-P7 numbers outside the canvas are pulled back so the photo can still be found", async ({ page }) => {
    const id = await newProject(page);
    await addPhotos(page, ASSET("gradient.png"));
    await openTool(page, "Layers");
    const panel = page.getByRole("region", { name: "Layers", exact: true });
    await panel.getByLabel("X", { exact: true }).fill("99999");
    await panel.getByLabel("Rotation").fill("9999");
    await waitSaved(page);
    const el = (await elementsOf(page, id))[0];
    expect(el.x).toBeLessThanOrEqual(3240 - 40);
    expect(el.rotation).toBe(360);
  });

  test("F10-P8 keyboard only: add, select in the list, move by number, reorder, duplicate, delete", async ({ page }) => {
    const id = await newProject(page);
    await page.locator('input[type="file"]').setInputFiles([ASSET("gradient.png"), ASSET("transparent.png")]);
    await waitImagesLoaded(page, 2);
    await openTool(page, "Layers");
    const panel = page.getByRole("region", { name: "Layers", exact: true });
    const rows = page.getByRole("list", { name: /Layers/ }).getByRole("listitem");
    await rows.nth(1).getByRole("button", { name: /^gradient\.png/ }).focus();
    await page.keyboard.press("Enter");
    const x = panel.getByLabel("X", { exact: true });
    await x.focus();
    await page.keyboard.press("Control+a");
    await page.keyboard.type("150");
    await panel.getByRole("button", { name: "Bring to front" }).focus();
    await page.keyboard.press("Enter");
    await panel.getByRole("button", { name: "Duplicate" }).focus();
    await page.keyboard.press("Enter");
    await expect(rows).toHaveCount(3);
    await panel.getByRole("button", { name: "Delete" }).focus();
    await page.keyboard.press("Enter");
    await expect(rows).toHaveCount(2);
    await waitSaved(page);
    const els = await elementsOf(page, id);
    expect(els).toHaveLength(2);
    expect(els.find((e: any) => e.name === "gradient.png").x).toBe(150);
  });

  test("F10-P9 an empty project shows an empty state, and the panel is accessible", async ({ page }) => {
    await newProject(page);
    await openTool(page, "Layers");
    await expect(page.getByRole("heading", { name: "No layers yet" })).toBeVisible();
    await axeClean(page, "layers empty");
    await openTool(page, "Media");
    await addPhotos(page, ASSET("gradient.png"));
    await openTool(page, "Layers");
    await axeClean(page, "layers with a selection");
  });

  test("F10-X1 order and lock survive a reload", async ({ page }) => {
    const id = await newProject(page);
    await addPhotos(page, [ASSET("gradient.png"), ASSET("transparent.png")]);
    await page.getByRole("toolbar", { name: "Selected element" }).getByRole("button", { name: "Lock" }).click();
    await openTool(page, "Layers");
    await page.getByRole("button", { name: /^Lock gradient/ }).click().catch(() => {});
    await waitSaved(page);
    const before = await elementsOf(page, id);
    expect(before.map((e: any) => e.locked)).toEqual([true, true]);
    await page.reload();
    await canvasReady(page);
    await waitImagesLoaded(page, 2);
    const after = await elementsOf(page, id);
    expect(after.map((e: any) => [e.id, e.locked])).toEqual(before.map((e: any) => [e.id, e.locked]));
  });
});
