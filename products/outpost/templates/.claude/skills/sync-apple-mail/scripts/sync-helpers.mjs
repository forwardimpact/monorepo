import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { basename, join, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { globSync } from "node:fs";

// This module loads node:sqlite lazily through createRequire. Test environments
// (bun, older node) that lack the built-in can then import this module. The
// only call site is openDb below. Production runs on Node 22+, where
// node:sqlite resolves.
const requireModule = createRequire(import.meta.url);

const HOME = homedir();
export const OUTDIR = join(HOME, ".cache/fit/outpost/apple_mail");
export const ATTACHMENTS_DIR = join(OUTDIR, "attachments");
const STATE_DIR = join(HOME, ".cache/fit/outpost/state");
const STATE_FILE = join(STATE_DIR, "apple_mail_last_sync");
const ROWID_STATE_FILE = join(STATE_DIR, "apple_mail_last_rowid");
export const MAX_THREADS = 500;

/** Locate the Apple Mail SQLite database file under ~/Library/Mail. */
export function findDb() {
  const mailDir = join(HOME, "Library/Mail");
  const paths = globSync(join(mailDir, "V*/MailData/Envelope Index"))
    .sort()
    .reverse();
  if (paths.length === 0) {
    console.error(
      "Error: Apple Mail database not found. Check that Mail is configured.",
    );
    process.exit(1);
  }
  return paths[0];
}

/** Open a read-only SQLite connection. Retry once if the database is locked. */
export function openDb(dbPath) {
  const { DatabaseSync } = requireModule("node:sqlite");
  try {
    return new DatabaseSync(dbPath, { readOnly: true });
  } catch (err) {
    if (err.message.includes("locked")) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
      return new DatabaseSync(dbPath, { readOnly: true });
    }
    throw err;
  }
}

/** Execute a SQL query and return all rows. Log the error and return an empty array on failure. */
export function query(db, sql) {
  try {
    return db.prepare(sql).all();
  } catch (err) {
    console.error(`SQLite error: ${err.message}`);
    return [];
  }
}

/** Load the last sync timestamp from disk. Use daysBack days ago on the first run. */
export function loadLastSync(daysBack = 30) {
  try {
    const iso = readFileSync(STATE_FILE, "utf-8").trim();
    if (iso) {
      const dt = new Date(iso);
      if (!isNaN(dt.getTime())) return Math.floor(dt.getTime() / 1000);
    }
  } catch {
    // First sync
  }
  return Math.floor((Date.now() - daysBack * 86400000) / 1000);
}

/** Persist the current sync timestamp and optionally the last-seen message ROWID to disk. */
export function saveSyncState(lastRowid = null) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(STATE_FILE, new Date().toISOString());
  if (lastRowid != null) {
    writeFileSync(ROWID_STATE_FILE, String(lastRowid));
  }
}

/** Load the last-seen message ROWID from disk. Return 0 on the first run. */
export function loadLastRowid() {
  try {
    const val = readFileSync(ROWID_STATE_FILE, "utf-8").trim();
    if (val && /^\d+$/.test(val)) return parseInt(val, 10);
  } catch {
    // First sync
  }
  return 0;
}

/** Convert a Unix timestamp in seconds to a human-readable UTC date string. */
export function unixToReadable(ts) {
  if (ts == null) return "Unknown";
  try {
    return new Date(ts * 1000)
      .toISOString()
      .replace("T", " ")
      .replace(/\.\d+Z/, " UTC");
  } catch {
    return "Unknown";
  }
}

/** Detect whether the messages table uses conversation_id or thread_id as the thread column. */
export function discoverThreadColumn(db) {
  const rows = query(db, "PRAGMA table_info(messages);");
  const columns = new Set(rows.map((r) => r.name));
  if (columns.has("conversation_id")) return "conversation_id";
  if (columns.has("thread_id")) return "thread_id";
  return null;
}

/** Return distinct thread IDs that have new messages since the given timestamp or ROWID. */
export function findChangedThreads(db, threadCol, sinceTs, lastRowid) {
  return query(
    db,
    `
    SELECT DISTINCT m.${threadCol} AS tid
    FROM messages m
    WHERE (m.date_received > ${sinceTs} OR m.ROWID > ${lastRowid})
      AND m.deleted = 0
      AND m.mailbox IN (
        SELECT ROWID FROM mailboxes
        WHERE url LIKE '%/Inbox%'
           OR url LIKE '%/INBOX%'
           OR url LIKE '%/Sent%'
      )
    LIMIT ${MAX_THREADS};
  `,
  );
}

/** Fetch all messages in a thread ordered by date, with sender and summary metadata. */
export function fetchThreadMessages(db, threadCol, tid) {
  return query(
    db,
    `
    SELECT
      m.ROWID AS message_id,
      m.${threadCol} AS thread_id,
      COALESCE(s.subject, '(No Subject)') AS subject,
      COALESCE(m.subject_prefix, '') AS subject_prefix,
      COALESCE(a.address, 'Unknown') AS sender,
      COALESCE(a.comment, '') AS sender_name,
      m.date_received,
      COALESCE(su.summary, '') AS summary,
      COALESCE(m.list_id_hash, 0) AS list_id_hash,
      COALESCE(m.automated_conversation, 0) AS automated_conversation
    FROM messages m
    LEFT JOIN subjects s ON m.subject = s.ROWID
    LEFT JOIN addresses a ON m.sender = a.ROWID
    LEFT JOIN summaries su ON m.summary = su.ROWID
    WHERE m.${threadCol} = ${tid}
      AND m.deleted = 0
    ORDER BY m.date_received ASC;
  `,
  );
}

/** Fetch To and CC recipients for the given message IDs, grouped by message and type. */
export function fetchRecipients(db, messageIds) {
  if (messageIds.length === 0) return {};
  const idList = messageIds.join(",");
  const rows = query(
    db,
    `
    SELECT
      r.message AS message_id,
      r.type,
      COALESCE(a.address, '') AS address,
      COALESCE(a.comment, '') AS name
    FROM recipients r
    LEFT JOIN addresses a ON r.address = a.ROWID
    WHERE r.message IN (${idList})
    ORDER BY r.message, r.type, r.position;
  `,
  );
  const result = {};
  for (const r of rows) {
    if (r.type === 2) continue;
    result[r.message_id] ??= {};
    result[r.message_id][r.type] ??= [];
    result[r.message_id][r.type].push(r);
  }
  return result;
}

/** Fetch attachment metadata for the given message IDs, grouped by message. */
export function fetchAttachments(db, messageIds) {
  if (messageIds.length === 0) return {};
  const idList = messageIds.join(",");
  const rows = query(
    db,
    `
    SELECT a.message AS message_id, a.attachment_id, a.name
    FROM attachments a
    WHERE a.message IN (${idList})
    ORDER BY a.message, a.ROWID;
  `,
  );
  const result = {};
  for (const r of rows) {
    result[r.message_id] ??= [];
    result[r.message_id].push({
      attachment_id: r.attachment_id,
      name: r.name,
    });
  }
  return result;
}

const FALLBACK_ATTACHMENT_NAME = "unnamed";
// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional. It strips ASCII control bytes from attacker-controlled filenames.
const CONTROL_CHARS_RE = /[\x00-\x1f\x7f]/g;

/**
 * Coerce an arbitrary `attachments.name` value into a single, non-empty
 * basename safe to join under a per-thread destDir. Strips path separators
 * (POSIX and win32). Strips ASCII control bytes. Then takes the last
 * non-empty/non-dot segment. Returns `"unnamed"` for any input that
 * collapses to empty, `.`, or `..`. Never throws.
 */
export function sanitiseAttachmentName(raw) {
  if (typeof raw !== "string") return FALLBACK_ATTACHMENT_NAME;
  const stripped = raw.replace(CONTROL_CHARS_RE, "");
  const segments = stripped.split(/[/\\]/);
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (seg && seg !== "." && seg !== "..") return seg;
  }
  return FALLBACK_ATTACHMENT_NAME;
}

function indexAttachmentPath(path, attachmentIndex) {
  const parts = path.split("/Attachments/", 2);
  if (parts.length !== 2) return;
  const segments = parts[1].split("/");
  if (segments.length >= 3 && /^\d+$/.test(segments[0])) {
    const msgRowid = parseInt(segments[0], 10);
    attachmentIndex.set(`${msgRowid}:${segments[1]}`, path);
  }
}

function indexEmlxPath(path, emlxIndex) {
  const name = basename(path);
  const msgId = name.split(".")[0];
  if (!/^\d+$/.test(msgId)) return;
  const mid = parseInt(msgId, 10);
  const existing = emlxIndex.get(mid);
  if (!existing || name.length < basename(existing).length) {
    emlxIndex.set(mid, path);
  }
}

function scanMailFiles(mailDir) {
  return execFileSync(
    "find",
    [
      mailDir,
      "(",
      "-name",
      "*.emlx",
      "-o",
      "-path",
      "*/Attachments/*",
      ")",
      "-type",
      "f",
    ],
    { encoding: "utf-8", timeout: 60000, maxBuffer: 50 * 1024 * 1024 },
  );
}

/** Scan ~/Library/Mail for .emlx and attachment files and build lookup indexes by message ID. */
export function buildFileIndexes() {
  const mailDir = join(HOME, "Library/Mail");
  const emlxIndex = new Map();
  const attachmentIndex = new Map();

  try {
    const output = scanMailFiles(mailDir);
    for (const path of output.trim().split("\n")) {
      if (!path) continue;
      if (path.includes("/Attachments/")) {
        indexAttachmentPath(path, attachmentIndex);
      } else if (path.endsWith(".emlx")) {
        indexEmlxPath(path, emlxIndex);
      }
    }
  } catch {
    // Timeout or no results
  }

  return { emlxIndex, attachmentIndex };
}

function copySingleAttachment(
  att,
  mid,
  threadId,
  attachmentIndex,
  seenFilenames,
  attachmentsDir = ATTACHMENTS_DIR,
) {
  const name = sanitiseAttachmentName(att.name);
  const source = attachmentIndex.get(`${mid}:${att.attachment_id}`);

  if (!source || !existsSync(source)) {
    return { name, available: false, path: null };
  }

  let destName = name;
  if (seenFilenames.has(destName)) destName = `${mid}_${name}`;
  seenFilenames.add(destName);

  const destDir = join(attachmentsDir, String(threadId));
  mkdirSync(destDir, { recursive: true });
  const destPath = join(destDir, destName);

  const resolvedDir = resolve(destDir);
  const resolvedPath = resolve(destPath);
  const dirWithSep = resolvedDir.endsWith(sep)
    ? resolvedDir
    : resolvedDir + sep;
  if (!resolvedPath.startsWith(dirWithSep)) {
    return { name: destName, available: false, path: null };
  }

  try {
    copyFileSync(source, destPath);
    return { name: destName, available: true, path: destPath };
  } catch {
    return { name: destName, available: false, path: null };
  }
}

/** Copy all attachments for a thread's messages into the cache directory and deduplicate the filenames. `attachmentsDir` defaults to the module-level `ATTACHMENTS_DIR`. Tests inject a temp directory. */
export function copyThreadAttachments(
  threadId,
  messages,
  attachmentsByMsg,
  attachmentIndex,
  attachmentsDir = ATTACHMENTS_DIR,
) {
  const results = {};
  const seenFilenames = new Set();

  for (const msg of messages) {
    const mid = msg.message_id;
    const msgAttachments = attachmentsByMsg[mid] ?? [];
    if (msgAttachments.length === 0) continue;

    results[mid] = msgAttachments.map((att) =>
      copySingleAttachment(
        att,
        mid,
        threadId,
        attachmentIndex,
        seenFilenames,
        attachmentsDir,
      ),
    );
  }
  return results;
}
