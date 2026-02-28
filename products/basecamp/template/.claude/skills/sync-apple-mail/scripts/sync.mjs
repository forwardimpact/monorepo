#!/usr/bin/env node
/**
 * Sync Apple Mail threads to ~/.cache/fit/basecamp/apple_mail/ as markdown.
 *
 * Queries the macOS Mail Envelope Index SQLite database for threads with new
 * messages since the last sync. Writes one markdown file per thread containing
 * sender, recipients, date, body text (parsed from .emlx files), and attachment
 * links. Attachments are copied into a per-thread subdirectory.
 *
 * Requires macOS with Mail app configured and Full Disk Access granted.
 */

if (process.argv.includes("-h") || process.argv.includes("--help")) {
  console.log(`sync-apple-mail — sync email threads to markdown

Usage: node scripts/sync.mjs [--days N] [-h|--help]

Options:
  --days N     Days back to sync on first run (default: 30)
  -h, --help   Show this help message and exit

Requires macOS with Mail configured and Full Disk Access granted.`);
  process.exit(0);
}

import { DatabaseSync } from "node:sqlite";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { homedir } from "node:os";
import { globSync } from "node:fs";
import { parseEmlx } from "./parse-emlx.mjs";

const HOME = homedir();
const OUTDIR = join(HOME, ".cache/fit/basecamp/apple_mail");
const ATTACHMENTS_DIR = join(OUTDIR, "attachments");
const STATE_DIR = join(HOME, ".cache/fit/basecamp/state");
const STATE_FILE = join(STATE_DIR, "apple_mail_last_sync");
const MAX_THREADS = 500;

// --- Database helpers ---

/**
 * Find the Apple Mail Envelope Index database.
 * @returns {string}
 */
function findDb() {
  const mailDir = join(HOME, "Library/Mail");
  const paths = globSync(join(mailDir, "V*/MailData/Envelope Index"))
    .sort()
    .reverse();
  if (paths.length === 0) {
    console.error("Error: Apple Mail database not found. Is Mail configured?");
    process.exit(1);
  }
  return paths[0];
}

/**
 * Open the database in read-only mode with retry on lock.
 * @param {string} dbPath
 * @returns {import("node:sqlite").DatabaseSync}
 */
function openDb(dbPath) {
  try {
    return new DatabaseSync(dbPath, { readOnly: true });
  } catch (err) {
    if (err.message.includes("locked")) {
      // Retry once after 2s
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
      return new DatabaseSync(dbPath, { readOnly: true });
    }
    throw err;
  }
}

/**
 * Execute a read-only query and return results.
 * @param {import("node:sqlite").DatabaseSync} db
 * @param {string} sql
 * @returns {Array<Record<string, any>>}
 */
function query(db, sql) {
  try {
    return db.prepare(sql).all();
  } catch (err) {
    console.error(`SQLite error: ${err.message}`);
    return [];
  }
}

// --- Sync state ---

/**
 * Load the last sync timestamp. Returns Unix timestamp.
 * @param {number} daysBack
 * @returns {number}
 */
function loadLastSync(daysBack = 30) {
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

/** Save current time as the sync timestamp. */
function saveSyncState() {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(STATE_FILE, new Date().toISOString());
}

/**
 * Convert Unix timestamp to readable date string.
 * @param {number | null} ts
 * @returns {string}
 */
function unixToReadable(ts) {
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

// --- Database queries ---

/**
 * Determine which column to use for thread grouping.
 * @param {import("node:sqlite").DatabaseSync} db
 * @returns {string | null}
 */
function discoverThreadColumn(db) {
  const rows = query(db, "PRAGMA table_info(messages);");
  const columns = new Set(rows.map((r) => r.name));
  if (columns.has("conversation_id")) return "conversation_id";
  if (columns.has("thread_id")) return "thread_id";
  return null;
}

/**
 * Find thread IDs with messages newer than sinceTs.
 * @param {import("node:sqlite").DatabaseSync} db
 * @param {string} threadCol
 * @param {number} sinceTs
 * @returns {Array<{ tid: number }>}
 */
function findChangedThreads(db, threadCol, sinceTs) {
  return query(
    db,
    `
    SELECT DISTINCT m.${threadCol} AS tid
    FROM messages m
    WHERE m.date_received > ${sinceTs}
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

/**
 * Fetch all messages in a thread with sender info.
 * @param {import("node:sqlite").DatabaseSync} db
 * @param {string} threadCol
 * @param {number} tid
 * @returns {Array<Record<string, any>>}
 */
function fetchThreadMessages(db, threadCol, tid) {
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

/**
 * Batch-fetch To/Cc recipients for a set of message IDs.
 * @param {import("node:sqlite").DatabaseSync} db
 * @param {number[]} messageIds
 * @returns {Record<number, Record<number, Array<Record<string, any>>>>}
 */
function fetchRecipients(db, messageIds) {
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
    if (r.type === 2) continue; // Skip Bcc
    result[r.message_id] ??= {};
    result[r.message_id][r.type] ??= [];
    result[r.message_id][r.type].push(r);
  }
  return result;
}

/**
 * Batch-fetch attachment metadata for a set of message IDs.
 * @param {import("node:sqlite").DatabaseSync} db
 * @param {number[]} messageIds
 * @returns {Record<number, Array<{ attachment_id: string, name: string }>>}
 */
function fetchAttachments(db, messageIds) {
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

// --- File indexing ---

/**
 * Build emlx and attachment indexes with a single find traversal.
 * @returns {{ emlxIndex: Map<number, string>, attachmentIndex: Map<string, string> }}
 */
function buildFileIndexes() {
  const mailDir = join(HOME, "Library/Mail");
  const emlxIndex = new Map();
  const attachmentIndex = new Map();

  try {
    const output = execFileSync(
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

    for (const path of output.trim().split("\n")) {
      if (!path) continue;
      if (path.includes("/Attachments/")) {
        const parts = path.split("/Attachments/", 2);
        if (parts.length === 2) {
          const segments = parts[1].split("/");
          if (segments.length >= 3 && /^\d+$/.test(segments[0])) {
            const msgRowid = parseInt(segments[0], 10);
            const attId = segments[1];
            attachmentIndex.set(`${msgRowid}:${attId}`, path);
          }
        }
      } else if (path.endsWith(".emlx")) {
        const name = basename(path);
        const msgId = name.split(".")[0];
        if (/^\d+$/.test(msgId)) {
          const mid = parseInt(msgId, 10);
          // Prefer .emlx over .partial.emlx (shorter name = full message)
          const existing = emlxIndex.get(mid);
          if (!existing || name.length < basename(existing).length) {
            emlxIndex.set(mid, path);
          }
        }
      }
    }
  } catch {
    // Timeout or no results
  }

  return { emlxIndex, attachmentIndex };
}

/**
 * Parse .emlx file for a message using pre-built index.
 * @param {number} messageId
 * @param {Map<number, string>} emlxIndex
 * @returns {string | null}
 */
function parseEmlxBody(messageId, emlxIndex) {
  const path = emlxIndex.get(messageId);
  if (!path) return null;
  try {
    return parseEmlx(path);
  } catch {
    return null;
  }
}

// --- Formatting ---

/**
 * Format a recipient as 'Name <email>' or just 'email'.
 * @param {Record<string, string>} r
 * @returns {string}
 */
function formatRecipient(r) {
  const name = (r.name ?? "").trim();
  const addr = (r.address ?? "").trim();
  if (name && addr) return `${name} <${addr}>`;
  return addr || name;
}

/**
 * Format sender as 'Name <email>' or just 'email'.
 * @param {Record<string, any>} msg
 * @returns {string}
 */
function formatSender(msg) {
  const name = (msg.sender_name ?? "").trim();
  const addr = (msg.sender ?? "").trim();
  if (name && addr) return `${name} <${addr}>`;
  return addr || name;
}

// --- Attachment copying ---

/**
 * Copy attachment files into the output attachments directory.
 * @param {number} threadId
 * @param {Array<Record<string, any>>} messages
 * @param {Record<number, Array<{ attachment_id: string, name: string }>>} attachmentsByMsg
 * @param {Map<string, string>} attachmentIndex
 * @returns {Record<number, Array<{ name: string, available: boolean, path: string | null }>>}
 */
function copyThreadAttachments(
  threadId,
  messages,
  attachmentsByMsg,
  attachmentIndex,
) {
  const results = {};
  const seenFilenames = new Set();

  for (const msg of messages) {
    const mid = msg.message_id;
    const msgAttachments = attachmentsByMsg[mid] ?? [];
    if (msgAttachments.length === 0) continue;

    const msgResults = [];
    for (const att of msgAttachments) {
      const name = att.name || "unnamed";
      const source = attachmentIndex.get(`${mid}:${att.attachment_id}`);

      if (!source || !existsSync(source)) {
        msgResults.push({ name, available: false, path: null });
        continue;
      }

      let destName = name;
      if (seenFilenames.has(destName)) destName = `${mid}_${name}`;
      seenFilenames.add(destName);

      const destDir = join(ATTACHMENTS_DIR, String(threadId));
      mkdirSync(destDir, { recursive: true });
      const destPath = join(destDir, destName);

      try {
        copyFileSync(source, destPath);
        msgResults.push({ name: destName, available: true, path: destPath });
      } catch {
        msgResults.push({ name, available: false, path: null });
      }
    }
    results[mid] = msgResults;
  }
  return results;
}

// --- Markdown output ---

/**
 * Write a thread as a markdown file.
 * @param {number} threadId
 * @param {Array<Record<string, any>>} messages
 * @param {Record<number, Record<number, Array<Record<string, any>>>>} recipientsByMsg
 * @param {Map<number, string>} emlxIndex
 * @param {Record<number, Array<{ name: string, available: boolean, path: string | null }>> | null} attachmentResults
 * @returns {boolean}
 */
function writeThreadMarkdown(
  threadId,
  messages,
  recipientsByMsg,
  emlxIndex,
  attachmentResults,
) {
  if (messages.length === 0) return false;

  const baseSubject = messages[0].subject ?? "(No Subject)";
  const isMailingList = messages.some((m) => (m.list_id_hash ?? 0) !== 0);
  const isAutomated = messages.some(
    (m) => (m.automated_conversation ?? 0) !== 0,
  );

  const flags = [];
  if (isMailingList) flags.push("mailing-list");
  if (isAutomated) flags.push("automated");

  const lines = [];
  lines.push(`# ${baseSubject}`);
  lines.push("");
  lines.push(`**Thread ID:** ${threadId}`);
  lines.push(`**Message Count:** ${messages.length}`);
  if (flags.length > 0) lines.push(`**Flags:** ${flags.join(", ")}`);
  lines.push("");

  for (const msg of messages) {
    lines.push("---");
    lines.push("");
    lines.push(`### From: ${formatSender(msg)}`);
    lines.push(`**Date:** ${unixToReadable(msg.date_received)}`);

    const mid = msg.message_id;
    const msgRecips = recipientsByMsg[mid] ?? {};
    const toList = msgRecips[0] ?? [];
    const ccList = msgRecips[1] ?? [];
    if (toList.length > 0)
      lines.push(`**To:** ${toList.map(formatRecipient).join(", ")}`);
    if (ccList.length > 0)
      lines.push(`**Cc:** ${ccList.map(formatRecipient).join(", ")}`);
    lines.push("");

    // Body: try .emlx first, fall back to summary
    let body = parseEmlxBody(mid, emlxIndex);
    if (!body) body = (msg.summary ?? "").trim();
    if (body) lines.push(body);
    lines.push("");

    // Attachments
    if (attachmentResults) {
      const msgAtts = attachmentResults[mid] ?? [];
      if (msgAtts.length > 0) {
        lines.push("**Attachments:**");
        for (const att of msgAtts) {
          if (att.available) {
            lines.push(`- [${att.name}](attachments/${threadId}/${att.name})`);
          } else {
            lines.push(`- ${att.name} *(not available)*`);
          }
        }
        lines.push("");
      }
    }
  }

  writeFileSync(join(OUTDIR, `${threadId}.md`), lines.join("\n"));
  return true;
}

// --- Main ---

function main() {
  // Parse --days argument
  let daysBack = 30;
  const daysIdx = process.argv.indexOf("--days");
  if (daysIdx !== -1 && process.argv[daysIdx + 1]) {
    daysBack = parseInt(process.argv[daysIdx + 1], 10);
  }

  const dbPath = findDb();
  mkdirSync(OUTDIR, { recursive: true });

  const sinceTs = loadLastSync(daysBack);
  const sinceReadable = unixToReadable(sinceTs);

  const db = openDb(dbPath);

  try {
    const threadCol = discoverThreadColumn(db);
    if (!threadCol) {
      console.error(
        "Error: Could not find conversation_id or thread_id column.",
      );
      process.exit(1);
    }

    const changed = findChangedThreads(db, threadCol, sinceTs);
    const threadIds = changed.map((r) => r.tid);

    if (threadIds.length === 0) {
      console.log("Apple Mail Sync Complete");
      console.log("Threads processed: 0 (no new messages)");
      console.log(`Time range: ${sinceReadable} to now`);
      console.log(`Output: ${OUTDIR}`);
      saveSyncState();
      return;
    }

    // Build .emlx and attachment file indexes (single find traversal)
    const { emlxIndex, attachmentIndex } = buildFileIndexes();

    let written = 0;
    for (const tid of threadIds) {
      const messages = fetchThreadMessages(db, threadCol, tid);
      if (messages.length === 0) continue;

      const msgIds = messages.map((m) => m.message_id);
      const recipients = fetchRecipients(db, msgIds);
      const attachmentsByMsg = fetchAttachments(db, msgIds);
      const attachmentResults = copyThreadAttachments(
        tid,
        messages,
        attachmentsByMsg,
        attachmentIndex,
      );

      if (
        writeThreadMarkdown(
          tid,
          messages,
          recipients,
          emlxIndex,
          attachmentResults,
        )
      ) {
        written++;
      }
    }

    saveSyncState();

    console.log("Apple Mail Sync Complete");
    console.log(`Threads processed: ${threadIds.length}`);
    console.log(`New/updated files: ${written}`);
    console.log(`Time range: ${sinceReadable} to now`);
    console.log(`Output: ${OUTDIR}`);
  } finally {
    db.close();
  }
}

main();
