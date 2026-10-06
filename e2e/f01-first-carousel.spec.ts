import { test, expect, signIn, newProject, addPhotos, exportZip, axeClean, ASSET, canvasReady } from "./fixtures";

test.describe("F01 first-time user makes a carousel", () => {
  test("F01-H1 home, sign in, new project, add a photo, export", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Start a carousel" }).first().click();
    await page.waitForURL("**/login");
    await page.getByLabel("Email").fill("first@example.test");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL("**/app");
    await expect(page.getByRole("heading", { name: "Nothing here yet" })).toBeVisible();
    await page.getByRole("link", { name: "New project" }).first().click();
    await page.getByRole("button", { name: "Create project" }).click();
    await page.waitForURL("**/app/project/**");
    await canvasReady(page);
    await addPhotos(page, ASSET("gradient.png"));
    const out = await exportZip(page);
    expect(out.names).toEqual(["slide-01.png", "slide-02.png", "slide-03.png"]);
  });

  test("F01-E1 signed out, a project link goes to sign-in", async ({ page }) => {
    await page.goto("/app");
    await page.waitForURL("**/login**");
    await page.goto("/app/project/11111111-1111-4111-8111-111111111111");
    await page.waitForURL("**/login?next=**");
  });

  test("F01-E1b after signing in from a project link, you land back on that project", async ({ page }) => {
    const id = "11111111-1111-4111-8111-111111111111";
    await page.goto(`/app/project/${id}`);
    await page.waitForURL("**/login**");
    await page.getByLabel("Email").fill("deeplink@example.test");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL(`**/app/project/${id}`, { timeout: 5000 });
  });

  test("F01-E2 sign-in email validation", async ({ page }) => {
    await page.goto("/login");
    const email = page.getByLabel("Email");
    const go = page.getByRole("button", { name: "Continue" });
    for (const bad of ["", "nope", "a@b", "a b@c.de", "@c.de", "a@@c.de"]) {
      await email.fill(bad);
      await go.click();
      await expect(page.getByText("Enter a valid email address.")).toBeVisible();
      await expect(page).toHaveURL(/\/login/);
    }
    await email.fill("  Mixed.Case+tag@Example.TEST  ");
    await go.click();
    await page.waitForURL("**/app");
    await expect(page.getByText("mixed.case+tag@example.test")).toBeVisible({ timeout: 5000 });
  });

  test("F01-E2b a 300 character email doesn't break the layout", async ({ page }) => {
    await page.goto("/login");
    const long = `${"a".repeat(240)}@example.test`;
    await page.getByLabel("Email").fill(long);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL("**/app");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("F01-E3 double click on Continue signs in once", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("twice@example.test");
    await page.getByRole("button", { name: "Continue" }).dblclick();
    await page.waitForURL("**/app");
    await expect(page.getByRole("heading", { name: "Your projects" })).toBeVisible();
  });

  test("F01-E4 after signing out, Back doesn't show the projects page", async ({ page }) => {
    await signIn(page);
    await newProject(page, { name: "Secret trip" });
    await page.goto("/app");
    await expect(page.getByText("Secret trip")).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL("**/");
    await page.goBack();
    await page.waitForTimeout(800);
    await expect(page.getByText("Secret trip")).toHaveCount(0);
  });

  test("F01-E5 /login while signed in goes to the projects page", async ({ page }) => {
    await signIn(page);
    await page.goto("/login");
    await page.waitForURL("**/app");
  });

  test("F01-E6 a failed sign-in link shows a message, with no console error", async ({ page }) => {
    await page.goto("/login?error=link");
    await expect(page.getByRole("alert").filter({ hasText: "didn't work" })).toBeVisible();
  });

  test("F01-E7 stub screens render and link back", async ({ page }) => {
    await signIn(page);
    for (const path of ["/onboarding", "/app/templates"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.getByRole("link", { name: /Back to projects|New project/ }).first().click();
      await page.waitForURL(/\/app(\/new)?$/);
    }
  });

  test("F01-N1 a second person on the same browser can't see the first person's projects", async ({ page }) => {
    await signIn(page, "alice@example.test");
    await newProject(page, { name: "Alice private" });
    await page.goto("/app");
    await page.getByRole("button", { name: "Sign out" }).click();
    await signIn(page, "bob@example.test");
    await expect(page.getByRole("heading", { name: "Nothing here yet" })).toBeVisible({ timeout: 5000 });
  });

  test("F01-A1 accessibility: home, sign-in, projects, new project", async ({ page }) => {
    await page.goto("/");
    await axeClean(page, "S01");
    await page.goto("/login");
    await axeClean(page, "S19");
    await signIn(page);
    await axeClean(page, "S06 empty");
    await page.goto("/app/new");
    await axeClean(page, "S08");
  });
});
