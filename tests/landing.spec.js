import { test, expect } from "@playwright/test";

test("loads front page successfully", async ({ page }) => {
  const errors = [];

  page.on("pageerror", (error) => {
    errors.push(error.message);
  });

  await page.goto("./");

  // Wait for the landing page h1 to appear (rendered by JavaScript)
  await expect(page.locator("h1")).toContainText("Engineering Pathway");

  // Check no JS errors occurred
  expect(errors).toEqual([]);
});
