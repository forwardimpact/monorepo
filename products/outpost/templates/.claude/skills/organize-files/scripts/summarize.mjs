#!/usr/bin/env bun
/**
 * Summarize the contents of ~/Desktop/ and ~/Downloads/.
 *
 * The script counts top-level files in both directories by type
 * (Screenshots, PDFs, Images, Documents, Archives, Installers, Other). It
 * prints a human-readable table for each directory. The organize-files skill
 * uses this script to preview directory contents before it organizes them.
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { homedir } from "node:os";

const HELP = `summarize — count files by type in ~/Desktop/ and ~/Downloads/

Usage: node scripts/summarize.mjs [-h|--help]

Prints a summary of file types found at the top level of each directory.`;

if (process.argv.includes("-h") || process.argv.includes("--help")) {
  console.log(HELP);
  process.exit(0);
}

const HOME = homedir();

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);
const DOC_EXTS = new Set([
  ".doc",
  ".docx",
  ".txt",
  ".md",
  ".rtf",
  ".csv",
  ".xlsx",
]);
const ARCHIVE_EXTS = new Set([".zip", ".rar"]);

function classifyFile(name, ext) {
  if (name.startsWith("Screenshot") || name.startsWith("Screen Shot"))
    return "Screenshots";
  if (ext === ".pdf") return "PDFs";
  if (IMAGE_EXTS.has(ext)) return "Images";
  if (DOC_EXTS.has(ext)) return "Documents";
  if (ARCHIVE_EXTS.has(ext) || name.endsWith(".tar.gz")) return "Archives";
  if (ext === ".dmg") return "Installers";
  return "Other";
}

function countFiles(dir) {
  if (!existsSync(dir)) return null;

  const counts = {
    Screenshots: 0,
    PDFs: 0,
    Images: 0,
    Documents: 0,
    Archives: 0,
    Installers: 0,
    Other: 0,
  };

  for (const name of readdirSync(dir)) {
    const fullPath = join(dir, name);
    const stat = statSync(fullPath, { throwIfNoEntry: false });
    if (!stat || !stat.isFile()) continue;
    if (name.startsWith(".")) continue;

    const category = classifyFile(name, extname(name).toLowerCase());
    counts[category]++;
  }

  return counts;
}

function main() {
  for (const dirName of ["Desktop", "Downloads"]) {
    const dir = join(HOME, dirName);
    const counts = countFiles(dir);
    if (!counts) continue;

    console.log(`=== ${dirName} ===`);
    for (const [label, count] of Object.entries(counts)) {
      console.log(`${label.padEnd(12)} ${count}`);
    }
    console.log("");
  }
}

main();
