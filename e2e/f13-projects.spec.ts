import { test, expect, signIn, newProject } from "./fixtures";

test.describe("F13 managing projects", () => {
  test("F13-H1 rename, duplicate, delete and undo the delete, and it all survives a reload", async ({ page }) => {
    await signIn(page);
    await newProject(page, { name: "Alpha" });
    await page.goto("/app");
    await expect(page.getByText("Alpha", { exact: true })).toBeVisible();

    // rename
    await page.getByRole("button", { name: "Rename Alpha" }).click();
    const dialog = page.getByRole("dialog", { name: "Rename project" });
    await dialog.getByRole("textbox", { name: "Name" }).fill("Beta");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Beta", { exact: true })).toBeVisible();
    await expect(page.getByText("Alpha", { exact: true })).toHaveCount(0);

    // duplicate
    await page.getByRole("button", { name: "Duplicate Beta" }).click();
    await expect(page.getByText("Beta copy", { exact: true })).toBeVisible();

    // delete, then change your mind
    await page.getByRole("button", { name: "Delete Beta copy" }).click();
    await expect(page.getByRole("status")).toContainText("Deleted");
    await expect(page.getByText("Beta copy", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByText("Beta copy", { exact: true })).toBeVisible();

    // and it is all still there after a reload
    await page.reload();
    await expect(page.getByText("Beta", { exact: true })).toBeVisible();
    await expect(page.getByText("Beta copy", { exact: true })).toBeVisible();
  });

  test("F13-E1 a deleted project's address no longer opens it", async ({ page }) => {
    await signIn(page);
    const id = await newProject(page, { name: "Gone" });
    await page.goto("/app");
    await page.getByRole("button", { name: "Delete Gone" }).click();
    await expect(page.getByRole("status")).toContainText("Deleted");
    await page.goto(`/app/project/${id}`);
    await expect(page.getByText(/doesn't exist|couldn't|not found/i).first()).toBeVisible();
  });

  test("F13-E2 a project can have many slides and slides can be added in the editor", async ({ page }) => {
    await signIn(page);
    await newProject(page, { slides: 60 });
    await expect(page.getByText("Slide 1 of 60")).toBeVisible();
    await page.getByRole("button", { name: "Slides", exact: true }).click();
    await page.getByRole("button", { name: "Add slide" }).click();
    await expect(page.getByText(/Slide \d+ of 61/)).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByText(/Slide \d+ of 60/)).toBeVisible();
  });
});
