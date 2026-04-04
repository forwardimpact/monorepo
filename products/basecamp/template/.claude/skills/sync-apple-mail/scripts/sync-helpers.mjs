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

const HOME = homedir();
export const OUTDIR = join(HOME, ".cache/fit/basecamp/apple_mail");
export const ATTACHMENTS_DIR = join(OUTDIR, "attachments");
const STATE_DIR = join(HOME, ".cache/fit/basecamp/state");
const STATE_FILE = join(STATE_DIR, "apple_mail_last_sync");
const ROWID_STATE_FILE = join(STATE_DIR, "apple_mail_last_rowid");
export const MAX_THREADS = 500;

export function findDb() {
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

export function openDb(dbPath) {
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

export function query(db, sql) {
  try {
    return db.prepare(sql).all();
  } catch (err) {
    console.error(`SQLite error: ${err.message}`);
    return [];
  }
}

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

export function saveSyncState(lastRowid = null) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(STATE_FILE, new Date().toISOString());
  if (lastRowid != null) {
    writeFileSync(ROWID_STATE_FILE, String(lastRowid));
  }
}

export function loadLastRowid() {
  try {
    const val = readFileSync(ROWID_STATE_FILE, "utf-8").trim();
    if (val && /^\d+$/.test(val)) return parseInt(val, 10);
  } catch {
    // First sync
  }
  return 0;
}

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

export function discoverThreadColumn(db) {
  const rows = query(db, "PRAGMA table_info(messages);");
  const columns = new Set(rows.map((r) => r.name));
  if (columns.has("conversation_id")) return "conversation_id";
  if (columns.has("thread_id")) return "thread_id";
  return null;
}

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

export function buildFileIndexes() {
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

export function copyThreadAttachments(
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
