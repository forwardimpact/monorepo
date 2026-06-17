import path from "node:path";
import { createLogger } from "@forwardimpact/libtelemetry";
import {
  MEMO_INBOX_MARKER,
  PRIORITY_INDEX_HEADING,
  PRIORITY_INDEX_TABLE_HEADER,
} from "../constants.js";
import { currentDayIso } from "../util/clock.js";
import { requireAgentFlag } from "../util/agent-flag.js";
import { resolveWikiRoot } from "../util/wiki-dir.js";

function paths(runtime, options) {
  const wikiRoot = resolveWikiRoot(runtime, options);
  const resolved = requireAgentFlag(options, {
    command: "inbox",
    example: "fit-wiki inbox list --agent staff-engineer",
  });
  if (!resolved.ok) return { error: resolved };
  const agent = resolved.agent;
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

function listCmd(runtime, options) {
  const p = paths(runtime, options);
  if (p.error) return p.error;
  const { summaryPath } = p;
  if (!runtime.fsSync.existsSync(summaryPath)) {
    runtime.proc.stdout.write(JSON.stringify({ bullets: [] }) + "\n");
    return { ok: true };
  }
  const text = runtime.fsSync.readFileSync(summaryPath, "utf-8");
  const { bullets } = readInboxBullets(text);
  runtime.proc.stdout.write(JSON.stringify({ bullets }, null, 2) + "\n");
  return { ok: true };
}

function ackOrDropCmd(runtime, options) {
  const p = paths(runtime, options);
  if (p.error) return p.error;
  const { summaryPath } = p;
  const idx = Number.parseInt(options.index ?? "", 10);
  if (!Number.isInteger(idx) || idx < 0) {
    createLogger("wiki", runtime).warn("inbox", "inbox requires --index <n>");
    return { ok: false, code: 2 };
  }
  const text = runtime.fsSync.readFileSync(summaryPath, "utf-8");
  const { lines, bulletIdxs } = readInboxBullets(text);
  if (idx >= bulletIdxs.length) {
    createLogger("wiki", runtime).warn("inbox", `no bullet at index ${idx}`);
    return { ok: false, code: 2 };
  }
  removeBulletAt(lines, bulletIdxs[idx]);
  runtime.fsSync.writeFileSync(summaryPath, lines.join("\n"));
  runtime.proc.stdout.write(`removed inbox bullet ${idx}\n`);
  return { ok: true };
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

function promoteCmd(runtime, options) {
  const p = paths(runtime, options);
  if (p.error) return p.error;
  const { summaryPath, memoryPath, agent } = p;
  const idx = Number.parseInt(options.index ?? "", 10);
  if (!Number.isInteger(idx) || idx < 0) {
    createLogger("wiki", runtime).warn(
      "inbox",
      "inbox promote requires --index <n>",
    );
    return { ok: false, code: 2 };
  }
  const text = runtime.fsSync.readFileSync(summaryPath, "utf-8");
  const { lines, bullets, bulletIdxs } = readInboxBullets(text);
  if (idx >= bullets.length) {
    createLogger("wiki", runtime).warn("inbox", `no bullet at index ${idx}`);
    return { ok: false, code: 2 };
  }
  const bulletText = bullets[idx].replace(/^[-*]\s+/, "");
  removeBulletAt(lines, bulletIdxs[idx]);
  runtime.fsSync.writeFileSync(summaryPath, lines.join("\n"));

  const memText = runtime.fsSync.existsSync(memoryPath)
    ? runtime.fsSync.readFileSync(memoryPath, "utf-8")
    : "";
  const today = options.today || currentDayIso(runtime);
  const owner = options.owner || agent;
  const promoted = appendPriorityRow(memText, {
    item: bulletText,
    agents: agent,
    owner,
    status: "active",
    added: today,
  });
  runtime.fsSync.writeFileSync(memoryPath, promoted);
  runtime.proc.stdout.write(`promoted inbox bullet ${idx} to priorities\n`);
  return { ok: true };
}

const SUBS = {
  list: listCmd,
  ack: ackOrDropCmd,
  drop: ackOrDropCmd,
  promote: promoteCmd,
};

/** Dispatch `inbox {list|ack|promote|drop}` to the matching sub-handler. */
export function runInboxCommand(ctx) {
  const { runtime } = ctx.deps;
  const sub = ctx.args.subcommand;
  const handler = SUBS[sub];
  if (!handler) {
    return {
      ok: false,
      code: 2,
      error: "inbox requires subcommand: list | ack | promote | drop",
    };
  }
  return handler(runtime, ctx.options);
}
