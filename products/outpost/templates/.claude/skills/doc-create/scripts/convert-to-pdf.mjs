#!/usr/bin/env bun
/**
 * Convert an HTML document to an A4 PDF with Playwright.
 *
 * The script renders an HTML file into an A4 PDF. It keeps the background
 * colours. It sets zero margins. The script expects the HTML to handle its own
 * page layout through CSS @page rules and page-break-after. Without an output
 * path, the script writes the PDF next to the input file.
 *
 * Requires: bun install playwright && bunx playwright install chromium
 */

import { resolve, dirname, basename, join } from "node:path";

const HELP = `convert-to-pdf — render an HTML document to A4 PDF with Playwright

Usage: bun scripts/convert-to-pdf.mjs <input.html> [output.pdf] [-h|--help]

Arguments:
  input.html   HTML document file (required)
  output.pdf   Output PDF path (default: same directory and name as input, with .pdf extension)

Requires: bun install playwright && bunx playwright install chromium`;

if (
  process.argv.includes("-h") ||
  process.argv.includes("--help") ||
  process.argv.length < 3
) {
  console.log(HELP);
  process.exit(process.argv.length < 3 ? 1 : 0);
}

const positional = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const input = resolve(positional[0]);
const output =
  positional[1] || join(dirname(input), basename(input, ".html") + ".pdf");

const { chromium } = await import("playwright");
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`file://${input}`, { waitUntil: "networkidle" });
await page.pdf({
  path: output,
  format: "A4",
  printBackground: true,
  margin: { top: "0", right: "0", bottom: "0", left: "0" },
});
await browser.close();
console.log(`Done: ${output}`);
