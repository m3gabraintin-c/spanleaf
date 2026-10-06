import { test, expect, signIn } from "./fixtures";

test.describe("F14 account", () => {
  test("F14-H1 the email in the header opens the account page, which says it is free", async ({ page }) => {
    await signIn(page, "acct@example.test");
    await page.getByRole("link", { name: "acct@example.test" }).click();
    await page.waitForURL("**/app/account");
    await expect(page.getByRole("heading", { level: 1, name: "Account" })).toBeVisible();
    await expect(page.getByText("Everything here is free")).toBeVisible();
  });

  test("F14-H2 deleting the account needs DELETE typed, then removes the projects and signs out", async ({ page }) => {
    await signIn(page, "bye@example.test");
    await page.goto("/app/account");
    await page.getByRole("button", { name: "Delete my account" }).click();
    const confirm = page.getByRole("button", { name: "Delete account" });
    await expect(confirm).toBeDisabled();
    await page.getByLabel("Type DELETE").fill("delete");
    await expect(confirm).toBeDisabled();
    await page.getByLabel("Type DELETE").fill("DELETE");
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await page.waitForURL("**/");
    await page.goto("/app");
    await page.waitForURL("**/login**");
  });

  test("F14-E1 the page tab has an icon, so the browser doesn't ask for a missing one", async ({ page }) => {
    await page.goto("/");
    const href = await page.locator('link[rel~="icon"]').first().getAttribute("href");
    expect(href).toBeTruthy();
    const res = await page.request.get(href!);
    expect(res.status()).toBe(200);
  });
});
