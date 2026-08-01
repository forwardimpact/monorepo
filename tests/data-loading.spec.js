import { test, expect } from "@playwright/test";

test("skills list loads and displays skills", async ({ page }) => {
  const errors = [];

  page.on("pageerror", (error) => {
    errors.push(error.message);
  });

  // Abort the non-essential external requests (fonts, prism)
  await page.route(
    (url) => !url.hostname.includes("localhost"),
    (route) => route.abort(),
  );

  await page.goto("./#/skill", { waitUntil: "domcontentloaded" });

  // The page loads with skills grouped by capability
  await expect(page.locator("h1")).toContainText("Skill");
  const capabilityHeaders = page.locator(".capability-header");
  await expect(capabilityHeaders.first()).toBeVisible();

  // Click into a skill detail. The cards are clickable without a link wrapper
  await page.locator(".card-clickable").first().click();

  // Verify the detail page shows a back link and section content
  await expect(page.locator(".back-link")).toBeVisible();
  await expect(page.locator(".detail-section").first()).toBeVisible();

  // Check no JS errors occurred
  expect(errors).toEqual([]);
});
