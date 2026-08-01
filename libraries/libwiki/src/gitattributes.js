import path from "node:path";
import {
  GITATTRIBUTES_FILE,
  METRICS_CSV_MERGE_ATTRIBUTE,
} from "./constants.js";

/**
 * Make sure the wiki's tracked `.gitattributes` declares the metrics-CSV union
 * merge attribute (`metrics/**\/*.csv merge=union`), idempotently.
 *
 * A present and correct line means no write. If the exact attribute line
 * already appears in the file, the function leaves the file byte-unchanged and
 * returns `{ changed: false }`. Otherwise it appends the line and keeps any
 * existing `.gitattributes` content, or it creates the file with only that
 * line. It then returns `{ changed: true }`.
 *
 * The single union declaration governs every clone because it is a tracked
 * worktree file. Per-clone config (`core.attributesFile`,
 * `.git/info/attributes`) would not propagate to the sibling sessions that
 * cause the loss.
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
    // Append the line. Keep existing content and end with a newline.
    const base = text.endsWith("\n") || text === "" ? text : `${text}\n`;
    fsSync.writeFileSync(filePath, `${base}${METRICS_CSV_MERGE_ATTRIBUTE}\n`);
    return { changed: true };
  }
  fsSync.writeFileSync(filePath, `${METRICS_CSV_MERGE_ATTRIBUTE}\n`);
  return { changed: true };
}
