import { test, expect } from "@playwright/test";

test("front page loads successfully", async ({ page }) => {
  const errors = [];

  page.on("pageerror", (error) => {
    errors.push(error.message);
  });

  // Abort the non-essential external requests (fonts, prism)
  await page.route(
    (url) => !url.hostname.includes("localhost"),
    (route) => route.abort(),
  );

  await page.goto("./", { waitUntil: "domcontentloaded" });

  // Wait for the landing page h1 to appear. JavaScript renders it.
  // Match on "Pathway" alone. The full title comes from the synthetic
  // standard.yaml. It changes each time an LLM regenerates the prose
  // cache (e.g. "BioNova Engineering Excellence Pathway").
  await expect(page.locator("h1")).toContainText("Pathway");

  // Check no JS errors occurred
  expect(errors).toEqual([]);
});
