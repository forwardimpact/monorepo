import { test, expect } from "@playwright/test";

test("job builder can generate a job", async ({ page }) => {
  const errors = [];

  page.on("pageerror", (error) => {
    errors.push(error.message);
  });

  await page.goto("./#/job-builder");

  // Page loads with the job builder form
  await expect(page.locator("h1")).toContainText("Job Builder");

  // Select discipline, grade, track
  // Uses IDs from examples/ data which is used by CI
  await page.selectOption("#discipline-select", "software_engineering");
  await page.selectOption("#grade-select", "L3");
  await page.selectOption("#track-select", "platform");

  // Verify preview appears with valid combination message
  await expect(page.locator(".job-preview")).toBeVisible();
  await expect(page.locator(".job-preview-valid")).toBeVisible();
  await expect(page.locator(".job-preview-title")).toContainText(
    "Software Engineer",
  );

  // Navigate to full job definition
  await page.click("#generate-btn");
  await expect(page.locator("h1")).toContainText("Software Engineer");

  // Check no JS errors occurred
  expect(errors).toEqual([]);
});
