// Convert HTML slides to PDF using Playwright.
//
// Usage: node scripts/convert-to-pdf.js [input.html] [output.pdf]
//
// Defaults:
//   input:  /tmp/basecamp-presentation.html
//   output: ~/Desktop/presentation.pdf
//
// Requires: npm install playwright && npx playwright install chromium

const { chromium } = require("playwright");
const path = require("path");

const input = process.argv[2] || "/tmp/basecamp-presentation.html";
const output =
  process.argv[3] || path.join(process.env.HOME, "Desktop", "presentation.pdf");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`file://${path.resolve(input)}`, {
    waitUntil: "networkidle",
  });
  await page.pdf({
    path: output,
    width: "1280px",
    height: "720px",
    printBackground: true,
  });
  await browser.close();
  console.log(`Done: ${output}`);
})();
