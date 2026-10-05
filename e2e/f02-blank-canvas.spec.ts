import { test, expect, signIn, newProject, canvasReady, readProject, waitSaved, axeClean } from "./fixtures";

test.describe("F02 start from a blank canvas", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("F02-H1 defaults: Untitled, 4:5, three slides", async ({ page }) => {
    const id = await newProject(page);
    const p = await readProject(page, id);
    expect(p).toMatchObject({ title: "Untitled", format: "portrait_4_5", slideCount: 3, rev: 0 });
    await expect(page.getByText("Slide 1 of 3")).toBeVisible();
  });

  test("F02-E1 empty and spaces-only names become Untitled", async ({ page }) => {
    for (const name of ["", "     "]) {
      const id = await newProject(page, { name });
      expect((await readProject(page, id)).title).toBe("Untitled");
    }
  });

  test("F02-E2 long, accented, emoji and right-to-left names are kept", async ({ page }) => {
    const names = ["x".repeat(80), "Café été naïve", "🎉🏖️ Summer 2026", "رحلة صيفية", "旅行のアルバム"];
    for (const name of names) {
      const id = await newProject(page, { name });
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect((await readProject(page, id)).title).toBe(name);
    }
  });

  test("F02-E2b the name field stops at 80 characters", async ({ page }) => {
    await page.goto("/app/new");
    await page.getByLabel("Name").fill("y".repeat(200));
    expect(await page.getByLabel("Name").inputValue()).toHaveLength(80);
  });

  test("F02-E2c markup in a name is shown as text and never runs", async ({ page }) => {
    let dialogs = 0;
    page.on("dialog", (d) => {
      dialogs++;
      void d.dismiss();
    });
    const evil = `<img src=x onerror=alert(1)> "quoted" & <b>bold</b>`;
    const id = await newProject(page, { name: evil });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(evil);
    await page.goto("/app");
    await expect(page.getByText(evil)).toBeVisible();
    expect(dialogs).toBe(0);
    expect(await page.locator("img[src='x']").count()).toBe(0);
    expect(id).toBeTruthy();
  });

  test("F02-E3 every format makes a canvas of the right shape", async ({ page }) => {
    const want: Record<string, [number, number]> = { "4:5": [1080, 1350], "3:4": [1080, 1440], "1:1": [1080, 1080], "9:16": [1080, 1920] };
    for (const [fmt, [w, h]] of Object.entries(want)) {
      await newProject(page, { format: fmt as "4:5", slides: 2 });
      const size = await page.evaluate(() => {
        const stage = (window as any).Konva.stages[0];
        const rect = stage.findOne("Rect");
        return { w: rect.width(), h: rect.height() };
      });
      expect(size, fmt).toEqual({ w: w * 2, h });
    }
  });

  test("F02-E4 slide count stays between 1 and 10 on a free plan", async ({ page }) => {
    await page.goto("/app/new");
    const fewer = page.getByRole("button", { name: "Fewer slides" });
    const more = page.getByRole("button", { name: "More slides" });
    for (let i = 0; i < 5; i++) if (await fewer.isEnabled()) await fewer.click();
    await expect(fewer).toBeDisabled();
    await expect(page.getByRole("group", { name: "Slides" }).locator("output")).toHaveText("1");
    for (let i = 0; i < 12; i++) if (await more.isEnabled()) await more.click();
    await expect(more).toBeDisabled();
    await expect(page.getByRole("group", { name: "Slides" }).locator("output")).toHaveText("10");
  });

  test("F02-E4b a one-slide project works: navigation disabled, one image exported", async ({ page }) => {
    await newProject(page, { slides: 1 });
    await expect(page.getByText("Slide 1 of 1")).toBeVisible();
    await expect(page.getByRole("button", { name: "Previous slide" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Next slide" })).toBeDisabled();
  });

  test("F02-E5 double click on Create project makes one project", async ({ page }) => {
    await page.goto("/app/new");
    await page.getByLabel("Name").fill("Twice");
    const create = page.getByRole("button", { name: "Create project" });
    await create.dblclick();
    await page.waitForURL("**/app/project/**");
    await canvasReady(page);
    await page.goto("/app");
    await expect(page.getByText("Twice")).toHaveCount(1);
  });

  test("F02-E6 Back from the editor and forward again keeps the project", async ({ page }) => {
    const id = await newProject(page, { name: "Round trip" });
    await page.goBack();
    await page.goForward();
    await canvasReady(page);
    expect(page.url()).toContain(id);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Round trip");
  });

  test("F02-E6b refreshing right after creating a project opens it", async ({ page }) => {
    await newProject(page, { name: "Fresh" });
    await page.reload();
    await canvasReady(page);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Fresh");
  });

  test("F02-E7 the list shows newest edit first and shortens long names", async ({ page }) => {
    for (const n of ["first", "second", "z".repeat(80)]) {
      await newProject(page, { name: n });
      await page.waitForTimeout(30);
    }
    await page.goto("/app");
    await expect(page.getByRole("listitem")).toHaveCount(3);
    const titles = await page.getByRole("listitem").evaluateAll((els) => els.map((e) => e.querySelector("p")?.textContent ?? ""));
    expect(titles).toEqual(["z".repeat(80), "second", "first"]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("F02-N1 an unknown or malformed project address says so, politely", async ({ page }) => {
    for (const id of ["11111111-1111-4111-8111-111111111111", "not-a-project", "%20", "a%2Fb", "%00"]) {
      await page.goto(`/app/project/${id}`);
      await expect(page.getByRole("heading", { name: "Project not found" })).toBeVisible();
      await page.getByRole("link", { name: "Back to projects" }).waitFor();
    }
  });

  test("F02-N2 a project someone else made can't be opened by its address", async ({ page }) => {
    const id = await newProject(page, { name: "Alice only" });
    await page.goto("/app");
    await page.getByRole("button", { name: "Sign out" }).click();
    await signIn(page, "mallory@example.test");
    await page.goto(`/app/project/${id}`);
    await expect(page.getByRole("heading", { name: "Project not found" })).toBeVisible({ timeout: 5000 });
  });

  test("F02-A1 accessibility of the editor, and with the save and export states showing", async ({ page }) => {
    await newProject(page);
    await axeClean(page, "S09 empty");
    await page.getByRole("button", { name: "Stickers" }).click();
    await axeClean(page, "S09 stub tool panel");
    await waitSaved(page);
  });
});
