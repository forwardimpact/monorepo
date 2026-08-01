import { test, expect } from "@playwright/test";

test("job builder can generate a job", async ({ page }) => {
  const errors = [];

  page.on("pageerror", (error) => {
    errors.push(error.message);
  });

  // Abort the non-essential external requests (fonts, prism)
  await page.route(
    (url) => !url.hostname.includes("localhost"),
    (route) => route.abort(),
  );

  await page.goto("./#/job-builder", { waitUntil: "domcontentloaded" });

  // The page loads with the job builder form
  await expect(page.locator("h1")).toContainText("Job Builder");

  // Select discipline, level, track
  // The test uses IDs from data/. fit-terrain generates them
  await page.selectOption("#discipline-select", "software-engineering");
  await page.selectOption("#level-select", "J070");
  await page.selectOption("#track-select", "platform");

  // Verify the preview appears with the valid-combination message
  await expect(page.locator(".job-preview")).toBeVisible();
  await expect(page.locator(".job-preview-valid")).toBeVisible();
  await expect(page.locator(".job-preview-title")).toContainText(
    "Software Engineer",
  );

  // Navigate to the full job definition
  await page.click("#generate-btn");
  await expect(page.locator("h1")).toContainText("Software Engineer");

  // Check no JS errors occurred
  expect(errors).toEqual([]);
});
