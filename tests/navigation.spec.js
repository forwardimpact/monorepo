import { test, expect } from "@playwright/test";

test("navigation between pages works", async ({ page }) => {
  const errors = [];

  page.on("pageerror", (error) => {
    errors.push(error.message);
  });

  await page.goto("./");

  // Navigate via hash to disciplines page
  await page.goto("./#/discipline");
  await expect(page.locator("h1")).toContainText("Disciplines");

  // Navigate to behaviours
  await page.goto("./#/behaviour");
  await expect(page.locator("h1")).toContainText("Behaviours");

  // Return home via nav brand link
  await page.locator(".nav-brand a").click();
  await expect(page.locator("h1")).toContainText("Engineering Pathway");

  // Check no JS errors occurred
  expect(errors).toEqual([]);
});
