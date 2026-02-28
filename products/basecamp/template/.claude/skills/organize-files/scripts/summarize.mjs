#!/usr/bin/env node
/**
 * Summarize the contents of ~/Desktop/ and ~/Downloads/.
 *
 * Counts top-level files in both directories by type (Screenshots, PDFs,
 * Images, Documents, Archives, Installers, Other) and prints a human-readable
 * table for each. Used by the organize-files skill to preview directory
 * contents before organizing.
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

    const ext = extname(name).toLowerCase();
    if (name.startsWith("Screenshot") || name.startsWith("Screen Shot")) {
      counts.Screenshots++;
    } else if (ext === ".pdf") {
      counts.PDFs++;
    } else if ([".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(ext)) {
      counts.Images++;
    } else if (
      [".doc", ".docx", ".txt", ".md", ".rtf", ".csv", ".xlsx"].includes(ext)
    ) {
      counts.Documents++;
    } else if ([".zip", ".rar"].includes(ext) || name.endsWith(".tar.gz")) {
      counts.Archives++;
    } else if (ext === ".dmg") {
      counts.Installers++;
    } else {
      counts.Other++;
    }
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
