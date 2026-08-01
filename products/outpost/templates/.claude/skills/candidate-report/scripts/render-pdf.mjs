#!/usr/bin/env bun
/**
 * Render a candidate-report HTML file to A4 PDF with Playwright.
 *
 * Usage: node scripts/render-pdf.mjs [input.html] [output.pdf]
 *
 * Defaults:
 *   input  → /tmp/candidate-report.html
 *   output → ~/Desktop/candidate-report.pdf
 *
 * Requires: bun install playwright && bunx playwright install chromium
 */

import { resolve, join } from "node:path";
import { homedir } from "node:os";

const HELP = `render-pdf — render candidate-report HTML to A4 PDF with Playwright

Usage: node scripts/render-pdf.mjs [input.html] [output.pdf] [-h|--help]

Arguments:
  input.html   HTML report file  (default: /tmp/candidate-report.html)
  output.pdf   Output PDF path   (default: ~/Desktop/candidate-report.pdf)

Requires: bun install playwright && bunx playwright install chromium`;

if (process.argv.includes("-h") || process.argv.includes("--help")) {
  console.log(HELP);
  process.exit(0);
}

const positional = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const input = positional[0] || "/tmp/candidate-report.html";
const output =
  positional[1] || join(homedir(), "Desktop", "candidate-report.pdf");

const { chromium } = await import("playwright");
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`file://${resolve(input)}`, { waitUntil: "networkidle" });
await page.pdf({
  path: output,
  format: "A4",
  printBackground: true,
  margin: { top: 0, right: 0, bottom: 0, left: 0 },
});
await browser.close();
console.log(`Done: ${output}`);
