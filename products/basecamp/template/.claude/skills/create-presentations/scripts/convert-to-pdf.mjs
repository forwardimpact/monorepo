#!/usr/bin/env node
/**
 * Convert HTML slides to PDF using Playwright.
 *
 * Renders an HTML file containing slide markup (1280x720px per slide) into a
 * PDF document. Each slide is sized to exactly 1280x720 pixels with background
 * colours and images preserved. Defaults to reading from /tmp and writing to
 * ~/Desktop when no arguments are given.
 *
 * Requires: npm install playwright && npx playwright install chromium
 */

import { join } from "node:path";
import { resolve } from "node:path";
import { homedir } from "node:os";

const HELP = `convert-to-pdf — render HTML slides to PDF via Playwright

Usage: node scripts/convert-to-pdf.mjs [input.html] [output.pdf] [-h|--help]

Arguments:
  input.html   HTML slides file (default: /tmp/basecamp-presentation.html)
  output.pdf   Output PDF path (default: ~/Desktop/presentation.pdf)

Requires: npm install playwright && npx playwright install chromium`;

if (process.argv.includes("-h") || process.argv.includes("--help")) {
  console.log(HELP);
  process.exit(0);
}

const positional = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const input = positional[0] || "/tmp/basecamp-presentation.html";
const output = positional[1] || join(homedir(), "Desktop", "presentation.pdf");

const { chromium } = await import("playwright");
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`file://${resolve(input)}`, { waitUntil: "networkidle" });
await page.pdf({
  path: output,
  width: "1280px",
  height: "720px",
  printBackground: true,
});
await browser.close();
console.log(`Done: ${output}`);
