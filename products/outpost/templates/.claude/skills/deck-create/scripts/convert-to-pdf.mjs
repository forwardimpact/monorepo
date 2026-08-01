#!/usr/bin/env bun
/**
 * Convert HTML slides to PDF with Playwright.
 *
 * This script renders an HTML file that contains slide markup (1280x720px per
 * slide) into a PDF document. Each slide measures exactly 1280x720 pixels. The
 * PDF keeps the background colours and the images. Without arguments, the
 * script reads from /tmp and writes to ~/Desktop.
 *
 * Requires: bun install playwright && bunx playwright install chromium
 */

import { join } from "node:path";
import { resolve } from "node:path";
import { homedir } from "node:os";

const HELP = `convert-to-pdf — render HTML slides to PDF with Playwright

Usage: bun scripts/convert-to-pdf.mjs [input.html] [output.pdf] [-h|--help]

Arguments:
  input.html   HTML slides file (default: /tmp/outpost-presentation.html)
  output.pdf   Output PDF path (default: ~/Desktop/presentation.pdf)

Requires: bun install playwright && bunx playwright install chromium`;

if (process.argv.includes("-h") || process.argv.includes("--help")) {
  console.log(HELP);
  process.exit(0);
}

const positional = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const input = positional[0] || "/tmp/outpost-presentation.html";
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
