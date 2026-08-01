import { test, expect } from "@playwright/test";

test("navigation between pages works", async ({ page }) => {
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

  // Navigate to the disciplines page through the hash
  await page.goto("./#/discipline", { waitUntil: "domcontentloaded" });
  await expect(page.locator("h1")).toContainText("Discipline");

  // Navigate to behaviours
  await page.goto("./#/behaviour", { waitUntil: "domcontentloaded" });
  await expect(page.locator("h1")).toContainText("Behaviour");

  // Return home through the nav brand link. Match on "Pathway" alone. The
  // full title comes from synthetic standard.yaml and varies per LLM regen.
  await page.locator("a.nav-brand").click();
  await expect(page.locator("h1")).toContainText("Pathway");

  // Check no JS errors occurred
  expect(errors).toEqual([]);
});
