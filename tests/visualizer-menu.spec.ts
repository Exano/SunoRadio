import { test, expect } from "@playwright/test";

const BASE = "http://localhost:3001";

test.describe("Visualizer Menu", () => {
  test("toggle button is visible in bottom bar without ?dev=1", async ({ page }) => {
    await page.goto(BASE);
    const toggle = page.locator("#viz-menu-toggle");
    await expect(toggle).toBeVisible({ timeout: 10_000 });
  });

  test("clicking toggle opens and closes the menu", async ({ page }) => {
    await page.goto(BASE);
    const toggle = page.locator("#viz-menu-toggle");
    const menu = page.locator("#dev-menu");

    await expect(toggle).toBeVisible({ timeout: 10_000 });
    // Menu should be hidden initially
    await expect(menu).not.toBeVisible();

    // Click to open
    await toggle.click();
    await expect(menu).toBeVisible();
    await expect(toggle).toHaveClass(/active/);

    // Click to close
    await toggle.click();
    await expect(menu).not.toBeVisible();
    await expect(toggle).not.toHaveClass(/active/);
  });

  test("menu title says Visualizer Menu", async ({ page }) => {
    await page.goto(BASE);
    const toggle = page.locator("#viz-menu-toggle");
    await expect(toggle).toBeVisible({ timeout: 10_000 });
    await toggle.click();

    const title = page.locator(".dev-menu-title");
    await expect(title).toHaveText("Visualizer Menu");
  });

  test("Ctrl+Shift+D also toggles the menu", async ({ page }) => {
    await page.goto(BASE);
    const menu = page.locator("#dev-menu");
    await page.waitForTimeout(1000);

    await expect(menu).not.toBeVisible();
    await page.keyboard.press("Control+Shift+D");
    await expect(menu).toBeVisible();
    await page.keyboard.press("Control+Shift+D");
    await expect(menu).not.toBeVisible();
  });
});
