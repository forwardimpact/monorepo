import fsAsync from "node:fs/promises";
import path from "node:path";
import { Finder } from "@forwardimpact/libutil";
import {
  weeklyLogPath,
  rotateIfOverBudget,
  appendEntry,
} from "../weekly-log.js";
import { DECISION_HEADING } from "../constants.js";

function projectRootForCommand() {
  const logger = { debug() {} };
  const finder = new Finder(fsAsync, logger, process);
  return finder.findProjectRoot(process.cwd());
}

function commonContext(values) {
  const agent = values.agent || process.env.LIBEVAL_AGENT_PROFILE;
  if (!agent) {
    process.stderr.write(
      "log requires --agent <name> or LIBEVAL_AGENT_PROFILE env var\n",
    );
    process.exit(2);
  }
  const projectRoot = projectRootForCommand();
  const wikiRoot = values["wiki-root"] || path.join(projectRoot, "wiki");
  const today = values.today || new Date().toISOString().slice(0, 10);
  return { agent, wikiRoot, today };
}

function ensureDateHeading(body, today) {
  const heading = `## ${today}`;
  if (body.startsWith(heading) || body.startsWith("## ")) return body;
  return `${heading}\n\n${body}`;
}

function runDecision(values) {
  const { agent, wikiRoot, today } = commonContext(values);
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
  process.stdout.write(`logged decision to ${target}\n`);
}

function runNote(values) {
  const { agent, wikiRoot, today } = commonContext(values);
  if (!values.field || !values.body) {
    process.stderr.write("log note requires --field and --body\n");
    process.exit(2);
  }
  const body = ensureDateHeading(
    `### ${values.field}\n\n${values.body}\n`,
    today,
  );
  const lineCount = body.split("\n").length;
  rotateIfOverBudget(wikiRoot, agent, today, lineCount);
  const target = weeklyLogPath(wikiRoot, agent, today);
  appendEntry(target, body, agent, today);
  process.stdout.write(`logged note to ${target}\n`);
}

function runDone(values) {
  const { agent, wikiRoot, today } = commonContext(values);
  const body = `### Closed\n\nRun closed ${today}.\n`;
  const lineCount = body.split("\n").length;
  rotateIfOverBudget(wikiRoot, agent, today, lineCount);
  const target = weeklyLogPath(wikiRoot, agent, today);
  appendEntry(target, body, agent, today);
  process.stdout.write(`closed entry in ${target}\n`);
}

const SUBS = { decision: runDecision, note: runNote, done: runDone };

/** Dispatch `log {decision|note|done}` to the matching sub-handler. */
export function runLogCommand(values, args, cli) {
  const sub = args[0];
  const handler = SUBS[sub];
  if (!handler) {
    cli.usageError("log requires subcommand: decision | note | done");
    process.exit(2);
  }
  handler(values);
}
