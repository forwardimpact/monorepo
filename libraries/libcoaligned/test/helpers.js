// Shared setup for the enumeration-drift test siblings: a scratch-repo factory
// and the sync filesystem surface the probes take. At runtime the invariant kit
// injects runtime.fsSync; in tests node:fs supplies the same surface directly.
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const fsSync = { existsSync, readFileSync, readdirSync, statSync };

/**
 * Create a scratch repo whose layout the fs-glob probe walks; the caller
 * removes it (rmSync) when done.
 *
 * @param {Record<string, string>} layout - relative path → file content.
 * @returns {string} The temp repo root.
 */
export function withRepo(layout) {
  const root = mkdtempSync(join(tmpdir(), "enum-drift-"));
  for (const [rel, content] of Object.entries(layout)) {
    const full = join(root, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}
