// Shared file-walking helpers for the invariant rule modules.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Recursively collect files under `dir`, skipping directory names in `skip`
 * and keeping paths whose file name satisfies `match`.
 *
 * @param {string} dir - Absolute directory to walk.
 * @param {{ skip: Set<string>, match: (name: string) => boolean }} options
 * @returns {string[]} Absolute file paths.
 */
export function collectFiles(dir, { skip, match }) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (skip.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectFiles(full, { skip, match }));
    } else if (match(entry)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Parse a JSON file, returning `null` when missing or unparseable.
 *
 * @param {string} path - Absolute file path.
 * @returns {object|null}
 */
export function readJsonOrNull(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}
