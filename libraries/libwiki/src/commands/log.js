import {
  weeklyLogPath,
  rotateIfOverBudget,
  appendEntry,
} from "../weekly-log.js";
import { DECISION_HEADING } from "../constants.js";
import { currentDayIso } from "../util/clock.js";
import { requireAgentFlag } from "../util/agent-flag.js";
import { resolveWikiRoot } from "../util/wiki-dir.js";

function commonContext(runtime, options) {
  const resolved = requireAgentFlag(options, {
    command: "log",
    example:
      'fit-wiki log decision --agent staff-engineer --chosen "..." --rationale "..."',
  });
  if (!resolved.ok) return { error: resolved };
  const wikiRoot = resolveWikiRoot(runtime, options);
  const today = options.today || currentDayIso(runtime);
  return { agent: resolved.agent, wikiRoot, today };
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

/**
 * Rotate before an append, never blocking it. A bisecting seal may now produce
 * multiple parts; the append still proceeds against the fresh current file. An
 * `incomplete` residue (a lone over-cap day-section sealed as its own part —
 * never the live file) is surfaced to stderr but does not block the append. A
 * thrown fs error is reported and swallowed: the writer rolled back, so the
 * (intact) current file still receives the new entry.
 */
function rotateBeforeAppend(wikiRoot, agent, today, appendLines, runtime) {
  try {
    const res = rotateIfOverBudget(
      wikiRoot,
      agent,
      today,
      appendLines,
      {},
      runtime.fsSync,
    );
    if (res.status === "incomplete") {
      runtime.proc.stderr.write(
        `note: day-section ${res.residue.section} alone exceeds the budget ` +
          `(${res.residue.lines} lines, ${res.residue.words} words); ` +
          `sealed as ${res.residue.path} for manual recovery\n`,
      );
    }
  } catch (e) {
    runtime.proc.stderr.write(`note: rotation failed: ${e.message}\n`);
  }
}

function runDecision(runtime, options) {
  const ctx = commonContext(runtime, options);
  if (ctx.error) return ctx.error;
  const { agent, wikiRoot, today } = ctx;
  const surveyed = options.surveyed || "—";
  const chosen = options.chosen || "—";
  const rationale = options.rationale || "—";
  const alternatives = options.alternatives || "—";
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
  rotateBeforeAppend(wikiRoot, agent, today, lineCount, runtime);
  const target = weeklyLogPath(wikiRoot, agent, today);
  appendEntry(target, body, agent, today, runtime.fsSync);
  runtime.proc.stdout.write(`logged decision to ${target}\n`);
  return { ok: true };
}

function runNote(runtime, options) {
  const ctx = commonContext(runtime, options);
  if (ctx.error) return ctx.error;
  const { agent, wikiRoot, today } = ctx;
  if (!options.field || !options.body) {
    runtime.proc.stderr.write("log note requires --field and --body\n");
    return { ok: false, code: 2 };
  }
  const fieldBlock = `### ${options.field}\n\n${options.body}\n`;
  // Conservative line budget: assume we'll prepend a date heading.
  const withHeading = `## ${today}\n\n${fieldBlock}`;
  rotateBeforeAppend(
    wikiRoot,
    agent,
    today,
    withHeading.split("\n").length,
    runtime,
  );
  const target = weeklyLogPath(wikiRoot, agent, today);
  // Append under the open entry if the file's last `## YYYY-MM-DD` is today;
  // otherwise open a new entry by prepending a date heading.
  const existing = runtime.fsSync.existsSync(target)
    ? runtime.fsSync.readFileSync(target, "utf-8")
    : "";
  const body = lastDateHeading(existing) === today ? fieldBlock : withHeading;
  appendEntry(target, body, agent, today, runtime.fsSync);
  runtime.proc.stdout.write(`logged note to ${target}\n`);
  return { ok: true };
}

function runDone(runtime, options) {
  const ctx = commonContext(runtime, options);
  if (ctx.error) return ctx.error;
  const { agent, wikiRoot, today } = ctx;
  const body = `### Closed\n\nRun closed ${today}.\n`;
  const lineCount = body.split("\n").length;
  rotateBeforeAppend(wikiRoot, agent, today, lineCount, runtime);
  const target = weeklyLogPath(wikiRoot, agent, today);
  appendEntry(target, body, agent, today, runtime.fsSync);
  runtime.proc.stdout.write(`closed entry in ${target}\n`);
  return { ok: true };
}

const SUBS = { decision: runDecision, note: runNote, done: runDone };

/** Dispatch `log {decision|note|done}` to the matching sub-handler. */
export function runLogCommand(ctx) {
  const { runtime } = ctx.deps;
  const sub = ctx.args.subcommand;
  const handler = SUBS[sub];
  if (!handler) {
    return {
      ok: false,
      code: 2,
      error: "log requires subcommand: decision | note | done",
    };
  }
  return handler(runtime, ctx.options);
}
