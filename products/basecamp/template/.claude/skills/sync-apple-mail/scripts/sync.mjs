#!/usr/bin/env bun
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

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseEmlx } from "./parse-emlx.mjs";
import {
  OUTDIR,
  findDb,
  openDb,
  query,
  loadLastSync,
  saveSyncState,
  loadLastRowid,
  unixToReadable,
  discoverThreadColumn,
  findChangedThreads,
  fetchThreadMessages,
  fetchRecipients,
  fetchAttachments,
  buildFileIndexes,
  copyThreadAttachments,
} from "./sync-helpers.mjs";

function formatRecipient(r) {
  const name = (r.name ?? "").trim();
  const addr = (r.address ?? "").trim();
  if (name && addr) return `${name} <${addr}>`;
  return addr || name;
}

function formatSender(msg) {
  const name = (msg.sender_name ?? "").trim();
  const addr = (msg.sender ?? "").trim();
  if (name && addr) return `${name} <${addr}>`;
  return addr || name;
}

function parseEmlxBody(messageId, emlxIndex) {
  const path = emlxIndex.get(messageId);
  if (!path) return null;
  try {
    return parseEmlx(path);
  } catch {
    return null;
  }
}

function formatMessageHeader(msg, recipientsByMsg) {
  const lines = [];
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
  return lines;
}

function formatMessageAttachments(mid, threadId, attachmentResults) {
  if (!attachmentResults) return [];
  const msgAtts = attachmentResults[mid] ?? [];
  if (msgAtts.length === 0) return [];
  const lines = ["**Attachments:**"];
  for (const att of msgAtts) {
    if (att.available) {
      lines.push(`- [${att.name}](attachments/${threadId}/${att.name})`);
    } else {
      lines.push(`- ${att.name} *(not available)*`);
    }
  }
  return lines;
}

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
    lines.push(...formatMessageHeader(msg, recipientsByMsg));
    lines.push("");

    const mid = msg.message_id;
    let body = parseEmlxBody(mid, emlxIndex);
    if (!body) body = (msg.summary ?? "").trim();
    if (body) lines.push(body);
    lines.push("");

    const attLines = formatMessageAttachments(mid, threadId, attachmentResults);
    if (attLines.length > 0) {
      lines.push(...attLines);
      lines.push("");
    }
  }

  writeFileSync(join(OUTDIR, `${threadId}.md`), lines.join("\n"));
  return true;
}

function main() {
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

    const lastRowid = loadLastRowid();
    const changed = findChangedThreads(db, threadCol, sinceTs, lastRowid);
    const threadIds = changed.map((r) => r.tid);

    let maxRowid = lastRowid;
    const maxRowidResult = query(
      db,
      `SELECT MAX(ROWID) as max_rowid FROM messages`,
    );
    if (maxRowidResult.length > 0 && maxRowidResult[0].max_rowid != null) {
      maxRowid = maxRowidResult[0].max_rowid;
    }

    if (threadIds.length === 0) {
      console.log("Apple Mail Sync Complete");
      console.log("Threads processed: 0 (no new messages)");
      console.log(`Time range: ${sinceReadable} to now`);
      console.log(`Output: ${OUTDIR}`);
      saveSyncState(maxRowid);
      return;
    }

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

    saveSyncState(maxRowid);

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
