import path from "node:path";
import {
  GITATTRIBUTES_FILE,
  METRICS_CSV_MERGE_ATTRIBUTE,
} from "./constants.js";

/**
 * Ensure the wiki's tracked `.gitattributes` declares the metrics-CSV union
 * merge attribute (`metrics/**\/*.csv merge=union`), idempotently.
 *
 * Present-and-correct means no write: if the exact attribute line already
 * appears in the file, the file is left byte-unchanged and `{ changed: false }`
 * is returned. Otherwise the line is appended (preserving any existing
 * `.gitattributes` content) or the file is created with just that line, and
 * `{ changed: true }` is returned.
 *
 * The single union declaration governs every clone because it is a tracked
 * worktree file; per-clone config (`core.attributesFile`, `.git/info/attributes`)
 * would not propagate to the sibling sessions that cause the loss.
 *
 * @param {string} wikiDir - The wiki clone directory.
 * @param {import('node:fs')} fsSync - Synchronous filesystem surface (`runtime.fsSync`).
 * @returns {{ changed: boolean }}
 */
export function ensureMetricsCsvMergeAttribute(wikiDir, fsSync) {
  const filePath = path.join(wikiDir, GITATTRIBUTES_FILE);
  if (fsSync.existsSync(filePath)) {
    const text = fsSync.readFileSync(filePath, "utf-8");
    const present = text
      .split("\n")
      .some((line) => line.trim() === METRICS_CSV_MERGE_ATTRIBUTE);
    if (present) return { changed: false };
    // Append the line, keeping existing content and ending with a newline.
    const base = text.endsWith("\n") || text === "" ? text : `${text}\n`;
    fsSync.writeFileSync(filePath, `${base}${METRICS_CSV_MERGE_ATTRIBUTE}\n`);
    return { changed: true };
  }
  fsSync.writeFileSync(filePath, `${METRICS_CSV_MERGE_ATTRIBUTE}\n`);
  return { changed: true };
}
