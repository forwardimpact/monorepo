import { closeSync, openSync, readSync } from "node:fs";
import { join } from "node:path";

const FIRST_LINE_CAP = 64 * 1024;

/**
 * Read the first newline-terminated line of a file, bounded to the first
 * {@link FIRST_LINE_CAP} bytes. Trace `.ndjson` files can be many MB; the
 * Step 2.6 meta header is always small, so a bounded `readSync` avoids
 * loading whole files into memory just to inspect the header. This uses
 * `node:fs` directly because the `runtime.fsSync` surface exposes no
 * positional `openSync`/`readSync` — the file is grandfathered for
 * `import:fs` in `check-ambient-deps.deny.json` until that seam exists.
 *
 * @param {string} path
 * @returns {string}
 */
function readFirstLine(path) {
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(FIRST_LINE_CAP);
    const bytes = readSync(fd, buf, 0, buf.length, 0);
    const text = buf.toString("utf8", 0, bytes);
    const nl = text.indexOf("\n");
    return nl === -1 ? text : text.slice(0, nl);
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
 * @param {object} fsSync - Sync filesystem surface (`runtime.fsSync`).
 * @returns {Array<{path: string, mtimeMs: number}>}
 */
export function findTracesByDiscussion(dir, discussionId, fsSync) {
  const matches = [];
  let entries;
  try {
    entries = fsSync.readdirSync(dir);
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
    matches.push({ path, mtimeMs: fsSync.statSync(path).mtimeMs });
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
 * @param {import("@forwardimpact/libcli").InvocationContext} ctx
 * @returns {Promise<{ok: true} | {ok: false, code: number, error: string}>}
 */
export async function runByDiscussionCommand(ctx) {
  const runtime = ctx.deps.runtime;
  const discussionId = ctx.args["discussion-id"];
  if (!discussionId)
    return { ok: false, code: 1, error: "<discussion-id> is required" };
  const dir = ctx.args["trace-dir"] ?? ctx.options["trace-dir"] ?? "traces";
  const matches = findTracesByDiscussion(dir, discussionId, runtime.fsSync);
  for (const { path } of matches) {
    runtime.proc.stdout.write(`${path}\n`);
  }
  return { ok: true };
}
