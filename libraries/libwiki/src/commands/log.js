import { existsSync, readFileSync } from "node:fs";
import fsAsync from "node:fs/promises";
import path from "node:path";
import { Finder } from "@forwardimpact/libutil";
import {
  weeklyLogPath,
  rotateIfOverBudget,
  appendEntry,
} from "../weekly-log.js";
import { DECISION_HEADING } from "../constants.js";
import { createDefaultIo } from "../io.js";

function projectRootForCommand(io) {
  const logger = { debug() {} };
  const finder = new Finder(fsAsync, logger, { cwd: io.cwd });
  return finder.findProjectRoot(io.cwd());
}

function commonContext(values, io) {
  const agent = values.agent || io.env.LIBEVAL_AGENT_PROFILE;
  if (!agent) {
    io.stderr("log requires --agent <name> or LIBEVAL_AGENT_PROFILE env var\n");
    io.exit(2);
    return null;
  }
  const projectRoot = projectRootForCommand(io);
  const wikiRoot = values["wiki-root"] || path.join(projectRoot, "wiki");
  const today = values.today || io.today();
  return { agent, wikiRoot, today };
}

function lastDateHeading(text) {
  // Match `## YYYY-MM-DD` at the start of a line, optionally followed by
  // suffix text (e.g. `## 2026-05-19 (third activation)`).
  const re = /^## (\d{4}-\d{2}-\d{2})/gm;
  let last = null;
  let match;
  while ((match = re.exec(text)) !== null) last = match[1];
  return last;
}

function runDecision(values, io) {
  const ctx = commonContext(values, io);
  if (!ctx) return;
  const { agent, wikiRoot, today } = ctx;
  const surveyed = values.surveyed || "—";
  const chosen = values.chosen || "—";
  const rationale = values.rationale || "—";
  const alternatives = values.alternatives || "—";
  const body = [
    `## ${today}`,
    "",
    DECISION_HEADING,
    "",
    `**Surveyed:** ${surveyed}`,
    "",
    `**Alternatives:** ${alternatives}`,
    "",
    `**Chosen:** ${chosen}`,
    "",
    `**Rationale:** ${rationale}`,
    "",
  ].join("\n");
  const lineCount = body.split("\n").length;
  rotateIfOverBudget(wikiRoot, agent, today, lineCount);
  const target = weeklyLogPath(wikiRoot, agent, today);
  appendEntry(target, body, agent, today);
  io.stdout(`logged decision to ${target}\n`);
}

function runNote(values, io) {
  const ctx = commonContext(values, io);
  if (!ctx) return;
  const { agent, wikiRoot, today } = ctx;
  if (!values.field || !values.body) {
    io.stderr("log note requires --field and --body\n");
    io.exit(2);
    return;
  }
  const fieldBlock = `### ${values.field}\n\n${values.body}\n`;
  // Conservative line budget: assume we'll prepend a date heading.
  const withHeading = `## ${today}\n\n${fieldBlock}`;
  rotateIfOverBudget(wikiRoot, agent, today, withHeading.split("\n").length);
  const target = weeklyLogPath(wikiRoot, agent, today);
  // Append under the open entry if the file's last `## YYYY-MM-DD` is today;
  // otherwise open a new entry by prepending a date heading.
  const existing = existsSync(target) ? readFileSync(target, "utf-8") : "";
  const body = lastDateHeading(existing) === today ? fieldBlock : withHeading;
  appendEntry(target, body, agent, today);
  io.stdout(`logged note to ${target}\n`);
}

function runDone(values, io) {
  const ctx = commonContext(values, io);
  if (!ctx) return;
  const { agent, wikiRoot, today } = ctx;
  const body = `### Closed\n\nRun closed ${today}.\n`;
  const lineCount = body.split("\n").length;
  rotateIfOverBudget(wikiRoot, agent, today, lineCount);
  const target = weeklyLogPath(wikiRoot, agent, today);
  appendEntry(target, body, agent, today);
  io.stdout(`closed entry in ${target}\n`);
}

const SUBS = { decision: runDecision, note: runNote, done: runDone };

/** Dispatch `log {decision|note|done}` to the matching sub-handler. */
export function runLogCommand(values, args, cli, io = createDefaultIo()) {
  const sub = args[0];
  const handler = SUBS[sub];
  if (!handler) {
    cli.usageError("log requires subcommand: decision | note | done");
    return io.exit(2);
  }
  handler(values, io);
}
