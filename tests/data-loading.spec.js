import { test, expect } from "@playwright/test";

test("skills list loads and displays skills", async ({ page }) => {
  const errors = [];

  page.on("pageerror", (error) => {
    errors.push(error.message);
  });

  await page.goto("./#/skill");

  // Page loads with skills grouped by capability
  await expect(page.locator("h1")).toContainText("Skills");
  const capabilityHeaders = page.locator(".capability-header");
  await expect(capabilityHeaders.first()).toBeVisible();

  // Click into a skill detail (cards are clickable, not wrapped in links)
  await page.locator(".card-clickable").first().click();

  // Verify we're on a detail page with back link and section content
  await expect(page.locator(".back-link")).toBeVisible();
  await expect(page.locator(".detail-section").first()).toBeVisible();

  // Check no JS errors occurred
  expect(errors).toEqual([]);
});
