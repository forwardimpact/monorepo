import { readdirSync, statSync, openSync, readSync, closeSync } from "node:fs";
import { join } from "node:path";

/**
 * Read the first newline-terminated line of a file. Bounded to 64 KiB
 * which is well above any orchestrator envelope.
 *
 * @param {string} path
 * @returns {string}
 */
function readFirstLine(path) {
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(65536);
    const bytes = readSync(fd, buf, 0, buf.length, 0);
    const slice = buf.slice(0, bytes).toString("utf8");
    const nl = slice.indexOf("\n");
    return nl === -1 ? slice : slice.slice(0, nl);
  } finally {
    closeSync(fd);
  }
}

/**
 * Scan a directory for `.ndjson` files whose meta header carries the
 * given discussion_id. The Step 2.6 first-line guarantee makes the
 * lookup cheap: we read only the first line per file. Files without a
 * meta header (e.g. legacy supervise/facilitate traces) are skipped
 * silently — not erroneous.
 *
 * @param {string} dir
 * @param {string} discussionId
 * @returns {Array<{path: string, mtimeMs: number}>}
 */
export function findTracesByDiscussion(dir, discussionId) {
  const matches = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  for (const entry of entries) {
    if (!entry.endsWith(".ndjson")) continue;
    const path = join(dir, entry);
    let firstLine;
    try {
      firstLine = readFirstLine(path);
    } catch {
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(firstLine);
    } catch {
      continue;
    }
    const event = parsed.event ?? parsed;
    if (event?.type !== "meta") continue;
    if (event.discussion_id !== discussionId) continue;
    matches.push({ path, mtimeMs: statSync(path).mtimeMs });
  }
  matches.sort((a, b) => a.mtimeMs - b.mtimeMs);
  return matches;
}

/**
 * `fit-trace by-discussion <discussion-id> [trace-dir]` — list trace
 * files whose meta header carries the given discussion_id, one per
 * line, ordered by first-event timestamp (file mtime ascending). The
 * result is usable with `xargs cat` for a chronological merge.
 *
 * @param {object} values
 * @param {string[]} args
 */
export async function runByDiscussionCommand(values, args) {
  const [discussionId, traceDirArg] = args;
  if (!discussionId) throw new Error("<discussion-id> is required");
  const dir = traceDirArg ?? values["trace-dir"] ?? "traces";
  const matches = findTracesByDiscussion(dir, discussionId);
  for (const { path } of matches) {
    process.stdout.write(`${path}\n`);
  }
}
