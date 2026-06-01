import path from "node:path";
import { Writable } from "node:stream";
import { emitFindingsText, runRules } from "@forwardimpact/libutil";
import {
  createAgentRunner,
  composeProfilePrompt,
  createRedactor,
} from "@forwardimpact/libeval";
import { RULES } from "../audit/rules.js";
import { buildContext, resolveScope } from "../audit/scopes.js";
import { currentDayIso } from "../util/clock.js";
import { resolveProjectRoot } from "../util/wiki-dir.js";

// The agent edits, we re-audit, and resume on whatever still fails. Cap the
// rounds so a finding the agent cannot resolve (e.g. a budget needing
// `fit-wiki rotate`, which it has no Bash to run) fails loudly, not forever.
const MAX_ROUNDS = 3;

/**
 * Every rule governing a scope with an open finding, as `id — hint` lines.
 * Handing the agent the full contract for the files it edits — not just the
 * failing rules — stops it fixing one finding by breaking another (dropping
 * the `**Last run**:` line, appending a section after `## Open Blockers`, …).
 */
function invariantContract(findings) {
  const scopes = new Set(
    findings.map((f) => RULES.find((r) => r.id === f.id)?.scope),
  );
  return RULES.filter((r) => scopes.has(r.scope) && r.hint).map(
    (r) => `- ${r.id} — ${r.hint}`,
  );
}

/**
 * The opening task: the findings, the invariant contract, and the two things
 * the rule hints don't cover — where trimmed history goes, and to prefer a
 * single Write.
 */
function composeTask(findings, wikiRoot, projectRoot) {
  return [
    `Fix these wiki audit findings by editing files under ${wikiRoot}.`,
    ``,
    emitFindingsText(findings, { cwd: projectRoot }),
    ``,
    `All of these invariants must hold when you finish — never fix one finding`,
    `by breaking another:`,
    ...invariantContract(findings),
    ``,
    `Move history out of an over-budget summary into the agent's weekly-log`,
    `file (wiki/<agent>-YYYY-Www.md), never a new summary section. Prefer a`,
    `single Write over many Edits.`,
  ].join("\n");
}

/** The resume task: the findings that survived the last edit. */
function composeFollowup(findings, projectRoot) {
  return [
    `The wiki still fails the audit. Remaining findings:`,
    ``,
    emitFindingsText(findings, { cwd: projectRoot }),
    ``,
    `Fix every one without breaking any invariant listed earlier.`,
  ].join("\n");
}

/**
 * Surface a round's agent error, if any. Returns true when it is fatal: a
 * missing sessionId means the process never started (e.g. the SDK refused
 * bypass-permissions as root), so there is nothing to resume. A turn-limit or
 * transient error keeps its session and may have made partial progress, so it
 * is noted but not fatal — the re-audit decides.
 */
function isFatalError(result, round, err) {
  if (!result.error) return false;
  if (!result.sessionId) {
    err(`fit-wiki fix: agent run failed: ${result.error.message}\n`);
    return true;
  }
  err(`fit-wiki fix: round ${round} agent error: ${result.error.message}\n`);
  return false;
}

/** Run the wiki audit and auto-fix findings via a Haiku-powered AgentRunner. */
export async function runFixCommand(ctx) {
  const { runtime } = ctx.deps;
  const projectRoot = resolveProjectRoot(runtime);
  const wikiRoot = ctx.options["wiki-root"] || path.join(projectRoot, "wiki");
  const today = ctx.options.today || currentDayIso(runtime);
  const out = (s) => runtime.proc.stdout.write(s);
  const err = (s) => runtime.proc.stderr.write(s);

  // The agent's edits change the result, so re-read and re-audit each round.
  const audit = () =>
    runRules(RULES, buildContext({ wikiRoot, today, fs: runtime.fsSync }), {
      resolveScope,
    });

  let findings = audit();
  if (findings.length === 0) {
    out("nothing to fix\n");
    return { ok: true };
  }

  const query =
    ctx.deps.query ?? (await import("@anthropic-ai/claude-agent-sdk")).query;
  const runner = createAgentRunner({
    cwd: projectRoot,
    query,
    output: new Writable({ write: (_c, _e, cb) => cb() }),
    model: "claude-haiku-4-5-20251001",
    maxTurns: 30,
    allowedTools: ["Read", "Write", "Edit"],
    settingSources: ["project"],
    systemPrompt: composeProfilePrompt("technical-writer", {
      profilesDir: path.resolve(projectRoot, ".claude/agents"),
      runtime,
    }),
    redactor: createRedactor({ runtime }),
  });

  // The audit is the verdict, not the agent's self-report: run, re-audit, and
  // resume the session on whatever still fails until clean or out of rounds.
  // Resuming also extends the turn budget for a trim too large for one round.
  let task = composeTask(findings, wikiRoot, projectRoot);
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const result =
      round === 0 ? await runner.run(task) : await runner.resume(task);
    if (result.text) out(result.text + "\n");
    if (isFatalError(result, round, err)) return { ok: false, code: 1 };

    findings = audit();
    if (findings.length === 0) {
      out("fixed: wiki audit is clean\n");
      return { ok: true, code: 0 };
    }
    task = composeFollowup(findings, projectRoot);
  }

  err(
    `fit-wiki fix: ${findings.length} finding(s) remain after ${MAX_ROUNDS} round(s):\n` +
      emitFindingsText(findings, { cwd: projectRoot }),
  );
  return { ok: false, code: 1 };
}
