#!/usr/bin/env node
/**
 * Sync Microsoft Teams chat messages to ~/.cache/fit/outpost/teams_chat/ as
 * markdown files. Reads the Teams IndexedDB cache (LevelDB on disk) directly —
 * no browser automation, no API tokens, no network access needed.
 *
 * Requires macOS with the Microsoft Teams desktop app installed.
 * Requires snappyjs: npm install snappyjs
 */

if (process.argv.includes("-h") || process.argv.includes("--help")) {
  console.log(`sync-teams — sync Teams chat messages to markdown

Usage: node scripts/sync.mjs [--days N] [-h|--help]

Options:
  --days N     Only include messages from the last N days (default: 30)
  -h, --help   Show this help message and exit

Reads the Teams IndexedDB cache from disk. Requires macOS with Teams installed.`);
  process.exit(0);
}

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { readIndexedDb } from "./idb-reader.mjs";

const HOME = homedir();
const OUTDIR = join(HOME, ".cache/fit/outpost/teams_chat");
const STATE_DIR = join(HOME, ".cache/fit/outpost/state");
const SYNC_STATE_FILE = join(STATE_DIR, "teams_last_sync");
const INDEX_FILE = join(STATE_DIR, "teams_chat_index.tsv");

const TEAMS_IDB_DIR = join(
  HOME,
  "Library/Containers/com.microsoft.teams2/Data/Library/Application Support",
  "Microsoft/MSTeams/EBWebView/WV2Profile_tfw/IndexedDB",
  "https_teams.microsoft.com_0.indexeddb.leveldb",
);

function normalizeName(name) {
  if (!name) return "";
  const trimmed = name.trim();
  if (trimmed.includes(",")) {
    const [last, ...first] = trimmed.split(",").map((s) => s.trim());
    const firstPart = first.join(" ").trim();
    if (firstPart && last) return `${firstPart} ${last}`;
    return last || firstPart;
  }
  return trimmed;
}

function toSlug(name) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug.slice(0, 80);
}

function htmlToText(html) {
  if (!html) return "";
  let text = html;
  text = text.replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, "");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/p>/gi, "\n");
  text = text.replace(/<\/div>/gi, "\n");
  text = text.replace(/<\/li>/gi, "\n");
  text = text.replace(
    /<span[^>]*itemtype="http:\/\/schema\.skype\.com\/Mention"[^>]*>([^<]*)<\/span>/gi,
    "$1",
  );
  text = text.replace(/<[^>]+>/g, "");
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&nbsp;/g, " ");
  text = text.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

function formatTimestamp(ts) {
  if (!ts) return "Unknown";
  const ms = typeof ts === "string" ? parseInt(ts, 10) : ts;
  if (isNaN(ms)) return "Unknown";
  const dt = new Date(ms);
  if (isNaN(dt.getTime())) return "Unknown";
  return dt
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d+Z/, "");
}

function _formatDateOnly(ts) {
  if (!ts) return "Unknown";
  const ms = typeof ts === "string" ? parseInt(ts, 10) : ts;
  const dt = new Date(ms);
  if (isNaN(dt.getTime())) return "Unknown";
  return dt.toISOString().slice(0, 10);
}

function isSystemMessage(msg) {
  const type = msg.messageType ?? msg.messagetype ?? "";
  if (type === "Event/Call" || type === "ThreadActivity/AddMember") return true;
  if (type === "ThreadActivity/DeleteMember") return true;
  if (type === "ThreadActivity/TopicUpdate") return true;

  const content = msg.content ?? "";
  if (content.includes("has made the chat a meeting")) return true;
  if (content.includes("added") && content.includes("to the chat")) return true;

  return false;
}

function is1to1Chat(conv) {
  const id = conv.id ?? "";
  if (id.startsWith("48:")) return false;
  if (
    conv.threadProperties?.isGroup === "True" ||
    conv.threadProperties?.isGroup === "true"
  )
    return false;
  return true;
}

function isGroupChat(conv) {
  if (is1to1Chat(conv)) return false;
  const id = conv.id ?? "";
  if (id.includes("@thread.tacv2")) return true;
  return false;
}

function looksLikeOrgId(name) {
  return /^8:orgid:[0-9a-f-]+$/i.test(name.trim());
}

function getChatDisplayName(conv) {
  const topic = conv.threadProperties?.topic ?? conv.properties?.topic ?? null;
  if (topic) return topic;

  const members = conv.members ?? [];
  const otherMembers = members.filter((m) => {
    const isSelf = m.isSelf || m.isSelf === "true" || m.isSelf === true;
    return !isSelf;
  });

  if (otherMembers.length > 0) {
    const names = otherMembers
      .map((m) => {
        const raw = m.friendlyName ?? m.displayName ?? "";
        if (!raw || looksLikeOrgId(raw)) return null;
        return normalizeName(raw);
      })
      .filter(Boolean);
    if (names.length > 0) return names.join(", ");
  }

  return null;
}

function extractParticipantsFromMessages(chatMessages) {
  const senders = new Set();
  for (const msg of chatMessages) {
    if (msg.sender) senders.add(msg.sender);
  }
  return [...senders];
}

function getChatDisplayNameFromMessages(chatMessages, userIdentity) {
  const senders = new Set();
  for (const msg of chatMessages) {
    if (msg.sender && msg.sender !== userIdentity) {
      senders.add(msg.sender);
    }
  }
  if (senders.size === 1) return [...senders][0];
  if (senders.size > 1) return [...senders].join(", ");
  return null;
}

function messageFromRecord(msg, cutoffMs) {
  if (isSystemMessage(msg)) return null;

  const arrivalTime = msg.originalArrivalTime ?? msg.clientArrivalTime ?? null;
  const ts =
    typeof arrivalTime === "string" ? parseInt(arrivalTime, 10) : arrivalTime;

  if (ts && cutoffMs && ts < cutoffMs) return null;

  const content = htmlToText(msg.content ?? "");
  if (!content) return null;

  const senderName = normalizeName(
    msg.imDisplayName ??
      msg.fromDisplayNameInToken ??
      msg.prioritizeImDisplayName ??
      "",
  );

  return {
    timestamp: ts,
    sender: senderName,
    content,
    edited: !!msg.skypeeditedid,
  };
}

function extractMessagesFromReplychains(replychains, conversationId, cutoffMs) {
  const messages = [];
  for (const rc of replychains) {
    if (rc.conversationId !== conversationId) continue;
    if (!rc.messageMap) continue;

    for (const [, msg] of Object.entries(rc.messageMap)) {
      const record = messageFromRecord(msg, cutoffMs);
      if (record) messages.push(record);
    }
  }

  messages.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
  return messages;
}

function writeChatMarkdown(
  slug,
  displayName,
  chatType,
  participants,
  messages,
) {
  const lines = [];

  if (chatType === "group") {
    lines.push(`# Chat: ${displayName} (group)`);
    lines.push("");
    lines.push("**Platform:** Microsoft Teams");
    lines.push("**Type:** Group chat");
    if (participants.length > 0) {
      lines.push(`**Participants:** ${participants.join(", ")}`);
    }
  } else {
    lines.push(`# Chat with ${displayName}`);
    lines.push("");
    lines.push("**Platform:** Microsoft Teams");
  }

  lines.push(`**Last Synced:** ${new Date().toISOString().slice(0, 10)}`);
  lines.push("");

  for (const msg of messages) {
    lines.push("---");
    lines.push("");
    lines.push(`### ${msg.sender || "Unknown"}`);
    lines.push(`**Date:** ${formatTimestamp(msg.timestamp)}`);
    if (msg.edited) lines.push("**Edited**");
    lines.push("");
    lines.push(msg.content);
    lines.push("");
  }

  writeFileSync(join(OUTDIR, `${slug}.md`), lines.join("\n"));
}

function loadUserIdentity() {
  try {
    // Identity cache written by the identify-user skill (replaces USER.md).
    const identityMd = readFileSync(join(STATE_DIR, "identity.md"), "utf-8");
    const nameMatch = identityMd.match(/\*\*Name:\*\*\s*(.+)/);
    if (nameMatch) return nameMatch[1].trim();
  } catch {
    // identity cache not found or not readable — run the identify-user skill
  }
  return "";
}

function processConversation(conv, replychains, cutoffMs, userIdentity) {
  const convId = conv.id;
  if (!convId) return null;

  const chatType = is1to1Chat(conv)
    ? "1to1"
    : isGroupChat(conv)
      ? "group"
      : null;
  if (!chatType) return null;

  const chatMessages = extractMessagesFromReplychains(
    replychains,
    convId,
    cutoffMs,
  );
  if (chatMessages.length === 0) return null;

  let displayName = getChatDisplayName(conv);
  if (!displayName) {
    displayName = getChatDisplayNameFromMessages(chatMessages, userIdentity);
  }
  if (!displayName) return null;

  const slug = toSlug(displayName);
  if (!slug) return null;

  const participants =
    chatType === "group" ? extractParticipantsFromMessages(chatMessages) : [];

  writeChatMarkdown(slug, displayName, chatType, participants, chatMessages);

  const lastMsgTime = chatMessages[chatMessages.length - 1]?.timestamp;
  const lastMsgIso = lastMsgTime
    ? new Date(lastMsgTime).toISOString().slice(0, 19)
    : "";

  return `${slug}\t${displayName}\t${lastMsgIso}`;
}

function main() {
  let daysBack = 30;
  const daysIdx = process.argv.indexOf("--days");
  if (daysIdx !== -1 && process.argv[daysIdx + 1]) {
    daysBack = parseInt(process.argv[daysIdx + 1], 10);
  }

  if (!existsSync(TEAMS_IDB_DIR)) {
    console.error(
      "Error: Teams IndexedDB not found. Is the Teams desktop app installed?",
    );
    console.error(`Expected: ${TEAMS_IDB_DIR}`);
    process.exit(1);
  }

  mkdirSync(OUTDIR, { recursive: true });
  mkdirSync(STATE_DIR, { recursive: true });

  const cutoffMs = Date.now() - daysBack * 86400000;

  console.log(`Reading Teams IndexedDB from disk...`);
  const startTime = Date.now();
  const { conversations, messages: replychains } = readIndexedDb(TEAMS_IDB_DIR);
  const readTime = Date.now() - startTime;
  console.log(
    `Read ${conversations.length} conversations, ${replychains.length} message chains in ${readTime}ms`,
  );

  const userIdentity = loadUserIdentity();

  const indexLines = [];
  let written = 0;

  for (const conv of conversations) {
    const indexLine = processConversation(
      conv,
      replychains,
      cutoffMs,
      userIdentity,
    );
    if (indexLine) {
      indexLines.push(indexLine);
      written++;
    }
  }

  indexLines.sort((a, b) => {
    const tsA = a.split("\t")[2] ?? "";
    const tsB = b.split("\t")[2] ?? "";
    return tsB.localeCompare(tsA);
  });

  writeFileSync(INDEX_FILE, indexLines.join("\n") + "\n");
  writeFileSync(SYNC_STATE_FILE, new Date().toISOString());

  console.log("\nTeams Sync Complete");
  console.log(`Chats written: ${written}`);
  console.log(`Messages within last ${daysBack} days`);
  console.log(`Read time: ${readTime}ms`);
  console.log(`Output: ${OUTDIR}`);
}

main();
