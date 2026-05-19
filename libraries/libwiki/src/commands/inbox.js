import { readFileSync, writeFileSync, existsSync } from "node:fs";
import fsAsync from "node:fs/promises";
import path from "node:path";
import { Finder } from "@forwardimpact/libutil";
import {
  MEMO_INBOX_MARKER,
  PRIORITY_INDEX_HEADING,
  PRIORITY_INDEX_TABLE_HEADER,
} from "../constants.js";

function projectRoot() {
  const logger = { debug() {} };
  const finder = new Finder(fsAsync, logger, process);
  return finder.findProjectRoot(process.cwd());
}

function paths(values) {
  const root = projectRoot();
  const wikiRoot = values["wiki-root"] || path.join(root, "wiki");
  const agent = values.agent || process.env.LIBEVAL_AGENT_PROFILE;
  if (!agent) {
    process.stderr.write("inbox requires --agent or LIBEVAL_AGENT_PROFILE\n");
    process.exit(2);
  }
  return {
    summaryPath: path.join(wikiRoot, `${agent}.md`),
    memoryPath: path.join(wikiRoot, "MEMORY.md"),
    agent,
  };
}

function readInboxBullets(text) {
  const lines = text.split("\n");
  const markerIdx = lines.findIndex((l) => l.trim() === MEMO_INBOX_MARKER);
  if (markerIdx === -1)
    return { lines, markerIdx, bullets: [], bulletIdxs: [] };
  const bullets = [];
  const bulletIdxs = [];
  for (let i = markerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") continue;
    if (/^##\s/.test(line)) break;
    if (!line.startsWith("-")) break;
    if (/\*No new messages\.\*/.test(line)) continue;
    bullets.push(line);
    bulletIdxs.push(i);
  }
  return { lines, markerIdx, bullets, bulletIdxs };
}

function removeBulletAt(lines, idx) {
  lines.splice(idx, 1);
  return lines;
}

function listCmd(values) {
  const { summaryPath } = paths(values);
  if (!existsSync(summaryPath)) {
    process.stdout.write(JSON.stringify({ bullets: [] }) + "\n");
    return;
  }
  const text = readFileSync(summaryPath, "utf-8");
  const { bullets } = readInboxBullets(text);
  process.stdout.write(JSON.stringify({ bullets }, null, 2) + "\n");
}

function ackOrDropCmd(values, _kind) {
  const { summaryPath } = paths(values);
  const idx = Number.parseInt(values.index ?? "", 10);
  if (!Number.isInteger(idx) || idx < 0) {
    process.stderr.write("inbox requires --index <n>\n");
    process.exit(2);
  }
  const text = readFileSync(summaryPath, "utf-8");
  const { lines, bulletIdxs } = readInboxBullets(text);
  if (idx >= bulletIdxs.length) {
    process.stderr.write(`no bullet at index ${idx}\n`);
    process.exit(2);
  }
  removeBulletAt(lines, bulletIdxs[idx]);
  writeFileSync(summaryPath, lines.join("\n"));
  process.stdout.write(`removed inbox bullet ${idx}\n`);
}

function appendPriorityRow(memoryText, { item, agents, owner, status, added }) {
  const lines = memoryText.split("\n");
  let headingIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === PRIORITY_INDEX_HEADING) {
      headingIdx = i;
      break;
    }
  }
  if (headingIdx === -1) {
    const block = [
      "",
      PRIORITY_INDEX_HEADING,
      "",
      PRIORITY_INDEX_TABLE_HEADER,
      "| --- | --- | --- | --- | --- |",
      `| ${item} | ${agents} | ${owner} | ${status} | ${added} |`,
      "",
    ];
    return memoryText.replace(/\n*$/, "") + "\n" + block.join("\n");
  }
  // Find last data row.
  let sepIdx = -1;
  for (let i = headingIdx + 1; i < lines.length; i++) {
    if (/^\|\s*---/.test(lines[i])) {
      sepIdx = i;
      break;
    }
    if (/^## /.test(lines[i])) break;
  }
  if (sepIdx === -1) {
    return memoryText;
  }
  let lastRowIdx = sepIdx;
  for (let i = sepIdx + 1; i < lines.length; i++) {
    if (!lines[i].startsWith("|")) break;
    lastRowIdx = i;
  }
  lines.splice(
    lastRowIdx + 1,
    0,
    `| ${item} | ${agents} | ${owner} | ${status} | ${added} |`,
  );
  return lines.join("\n");
}

function promoteCmd(values) {
  const { summaryPath, memoryPath, agent } = paths(values);
  const idx = Number.parseInt(values.index ?? "", 10);
  if (!Number.isInteger(idx) || idx < 0) {
    process.stderr.write("inbox promote requires --index <n>\n");
    process.exit(2);
  }
  const text = readFileSync(summaryPath, "utf-8");
  const { lines, bullets, bulletIdxs } = readInboxBullets(text);
  if (idx >= bullets.length) {
    process.stderr.write(`no bullet at index ${idx}\n`);
    process.exit(2);
  }
  const bulletText = bullets[idx].replace(/^[-*]\s+/, "");
  removeBulletAt(lines, bulletIdxs[idx]);
  writeFileSync(summaryPath, lines.join("\n"));

  const memText = existsSync(memoryPath)
    ? readFileSync(memoryPath, "utf-8")
    : "";
  const today = values.today || new Date().toISOString().slice(0, 10);
  const owner = values.owner || agent;
  const promoted = appendPriorityRow(memText, {
    item: bulletText,
    agents: agent,
    owner,
    status: "active",
    added: today,
  });
  writeFileSync(memoryPath, promoted);
  process.stdout.write(`promoted inbox bullet ${idx} to priorities\n`);
}

const SUBS = {
  list: listCmd,
  ack: (v) => ackOrDropCmd(v, "ack"),
  drop: (v) => ackOrDropCmd(v, "drop"),
  promote: promoteCmd,
};

/** Dispatch `inbox {list|ack|promote|drop}` to the matching sub-handler. */
export function runInboxCommand(values, args, cli) {
  const sub = args[0];
  const handler = SUBS[sub];
  if (!handler) {
    cli.usageError("inbox requires subcommand: list | ack | promote | drop");
    process.exit(2);
  }
  handler(values);
}
