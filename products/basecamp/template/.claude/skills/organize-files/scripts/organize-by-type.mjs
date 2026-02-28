#!/usr/bin/env node
/**
 * Organize files in a directory by type into subdirectories.
 *
 * Scans the top level of the given directory and moves files into category
 * subdirectories: Screenshots, Documents, Images, Archives, and Installers.
 * Categories are determined by file extension and name prefix. Files that do
 * not match any category are left in place. Does NOT delete anything.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  statSync,
} from "node:fs";
import { basename, extname, join } from "node:path";

const HELP = `organize-by-type — sort files into type-based subdirectories

Usage: node scripts/organize-by-type.mjs <directory> [-h|--help]

Creates subdirectories (Documents, Images, Archives, Installers, Screenshots)
and moves matching top-level files into them. Does NOT delete any files.`;

if (process.argv.includes("-h") || process.argv.includes("--help")) {
  console.log(HELP);
  process.exit(0);
}

const CATEGORIES = [
  {
    name: "Screenshots",
    test: (name) =>
      name.startsWith("Screenshot") || name.startsWith("Screen Shot"),
  },
  {
    name: "Documents",
    test: (_name, ext) =>
      [
        ".pdf",
        ".doc",
        ".docx",
        ".txt",
        ".md",
        ".rtf",
        ".csv",
        ".xlsx",
      ].includes(ext),
  },
  {
    name: "Images",
    test: (_name, ext) =>
      [".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(ext),
  },
  {
    name: "Archives",
    test: (name, ext) =>
      [".zip", ".rar"].includes(ext) || name.endsWith(".tar.gz"),
  },
  {
    name: "Installers",
    test: (_name, ext) => ext === ".dmg",
  },
];

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error("Usage: node scripts/organize-by-type.mjs <directory>");
    process.exit(1);
  }
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    console.error(`Error: Directory not found: ${dir}`);
    process.exit(1);
  }

  // Create subdirectories
  for (const cat of CATEGORIES) {
    mkdirSync(join(dir, cat.name), { recursive: true });
  }

  let moved = 0;
  for (const name of readdirSync(dir)) {
    const fullPath = join(dir, name);
    const stat = statSync(fullPath, { throwIfNoEntry: false });
    if (!stat || !stat.isFile()) continue;

    const ext = extname(name).toLowerCase();
    for (const cat of CATEGORIES) {
      if (cat.test(name, ext)) {
        const dest = join(dir, cat.name, name);
        renameSync(fullPath, dest);
        console.log(`${name} -> ${cat.name}/`);
        moved++;
        break;
      }
    }
  }

  console.log(`\nOrganization complete: ${dir} (${moved} files moved)`);
}

main();
