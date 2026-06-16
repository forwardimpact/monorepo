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
import {
  rotateIfOverBudget,
  rebisectOverBudgetPart,
  weeklyLogPath,
} from "../weekly-log.js";
import { currentDayIso } from "../util/clock.js";
import { resolveProjectRoot } from "../util/wiki-dir.js";
import { FAST_MODEL } from "@forwardimpact/libutil/models";
import { createLogger } from "@forwardimpact/libtelemetry";

// Pipeline: audit → deterministic rotation (the one fix needing a file seal the
// agent can't do) → re-audit → Haiku agent on the prose-judgment residual →
// flag what neither should touch. MAX_ROUNDS still caps the agent loop so an
// unresolvable agent-class finding fails loudly rather than spinning forever.
const MAX_ROUNDS = 3;

/**
 * A finding's remediation class, from the declarative rule. Rules without a
 * `remediation` field default to `"agent"`: the Haiku agent handles all
 * prose-judgment fixes (summary trims, section order, MEMORY.md prose).
 */
function classOf(finding) {
  return RULES.find((r) => r.id === finding.id)?.remediation ?? "agent";
}

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
 * The opening task: the findings, the invariant contract, and the things the
 * rule hints don't cover — where trimmed history goes (only existing
 * weekly-log files; rotation owns minting new ones), and to prefer a single
 * Write.
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
    `Move history out of an over-budget summary into the agent's existing`,
    `weekly-log file or its current part (wiki/<agent>-YYYY-Www[-partN].md) —`,
    `never a new summary section, and never a new file: rotation tooling owns`,
    `when part files are created, so do not mint filenames yourself. If the`,
    `trimmed narrative already exists in the weekly log, replace it in the`,
    `summary with a pointer to that file instead of copying it anywhere.`,
    `Prefer a single Write over many Edits.`,
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
 * Deterministic pre-pass: seal every over-budget current-week weekly-log main
 * file via `rotateIfOverBudget`. The agent name comes from the audit's own
 * subjects (keyed by path) — no filename parsing. `force: true` rotates even a
 * word-over/line-under file.
 *
 * `rotateIfOverBudget` always seals the agent's *current-week* log, so we only
 * call it when the finding IS that file. A prior-week over-budget main is left
 * untouched (rotating it would force-seal a healthy current-week log instead);
 * it survives the re-audit and is flagged for a human.
 */
/**
 * Seal one over-budget current-week main log. A failed seal leaves the source
 * intact (the writer rolled back), so the re-audit re-flags it for a human.
 */
function sealMainLog(agent, { wikiRoot, today, projectRoot, fs, out, err }) {
  try {
    const res = rotateIfOverBudget(
      wikiRoot,
      agent,
      today,
      0,
      { force: true },
      fs,
    );
    if (res.status !== "sealed" && res.status !== "incomplete") return;
    for (const part of res.parts) {
      out(
        `rotated ${path.relative(projectRoot, res.fromPath)} -> ` +
          `${path.relative(projectRoot, part)}\n`,
      );
    }
  } catch (e) {
    err(`fit-wiki fix: rotate failed for ${agent}: ${e.message}\n`);
  }
}

function rotateOverBudgetMainLogs(findings, deps) {
  const { wikiRoot, today, fs } = deps;
  const subjects = buildContext({ wikiRoot, today, fs }).subjects[
    "weekly-log-main"
  ];
  const agentByPath = new Map(subjects.map((s) => [s.path, s.agentPrefix]));
  // A log over BOTH budgets yields two `rotate` findings with the same path
  // (different rule ids); seal each path once, or the second force call would
  // bisect the freshly-written fresh-main into a spurious near-empty part.
  const sealed = new Set();
  for (const f of findings) {
    if (classOf(f) !== "rotate") continue;
    const agent = agentByPath.get(f.path);
    if (!agent || weeklyLogPath(wikiRoot, agent, today) !== f.path) continue;
    if (sealed.has(f.path)) continue;
    sealed.add(f.path);
    sealMainLog(agent, deps);
  }
}

/**
 * Re-bisect one over-budget sealed part, logging each new sibling slot it
 * produces (the reused source slot is not a new file). A failed reseal leaves
 * the source intact (the writer rolled back), so the re-audit re-flags it.
 */
function resealPart(partPath, { fs, projectRoot, out, err }) {
  try {
    const res = rebisectOverBudgetPart(partPath, fs);
    if (res.status !== "resealed" && res.status !== "incomplete") return;
    for (const part of res.parts) {
      if (part === res.fromPath) continue; // the reused source slot
      out(
        `rotated ${path.relative(projectRoot, res.fromPath)} -> ` +
          `${path.relative(projectRoot, part)}\n`,
      );
    }
  } catch (e) {
    err(
      `fit-wiki fix: rebisect failed for ` +
        `${path.relative(projectRoot, partPath)}: ${e.message}\n`,
    );
  }
}

/**
 * Deterministic pass for over-budget sealed parts: re-bisect each at its
 * day-section seams. A part with no splittable seam is left byte-identical (the
 * re-audit re-flags it for a human). Agent and week come from the part filename,
 * so no subject lookup is needed. Part findings are disjoint from the main-log
 * findings `rotateOverBudgetMainLogs` handles.
 */
function rebisectOverBudgetParts(findings, deps) {
  // A part over both budgets yields two findings with the same path; re-bisect
  // each path once.
  const done = new Set();
  for (const f of findings) {
    if (classOf(f) !== "rotate") continue;
    if (!f.id.startsWith("weekly-log-part.")) continue;
    if (done.has(f.path)) continue;
    done.add(f.path);
    resealPart(f.path, deps);
  }
}

/** Report findings that need human judgment — never auto-fixed. */
function reportFlags(err, flagFindings, projectRoot) {
  err(
    `fit-wiki fix: ${flagFindings.length} finding(s) need human judgment ` +
      `(not auto-fixable):\n` +
      emitFindingsText(flagFindings, { cwd: projectRoot }),
  );
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

/** Build the Haiku technical-writer runner for prose-judgment fixes. */
async function buildFixRunner(ctx, projectRoot, runtime) {
  const query =
    ctx.deps.query ?? (await import("@anthropic-ai/claude-agent-sdk")).query;
  return createAgentRunner({
    cwd: projectRoot,
    query,
    output: new Writable({ write: (_c, _e, cb) => cb() }),
    model: FAST_MODEL,
    maxTurns: 30,
    allowedTools: ["Read", "Glob", "Write", "Edit"],
    settingSources: ["project"],
    systemPrompt: composeProfilePrompt("technical-writer", {
      profilesDir: path.resolve(projectRoot, ".claude/agents"),
      runtime,
    }),
    redactor: createRedactor({ runtime }),
  });
}

/**
 * Run the agent on the prose-judgment findings, re-auditing each round until
 * clean, flag-only, or MAX_ROUNDS is exhausted. The audit is the verdict, not
 * the agent's self-report; resuming extends the turn budget for a trim too
 * large for one round.
 */
async function runAgentRounds(runner, agentFindings, deps) {
  const { wikiRoot, projectRoot, audit, partition, out, err } = deps;
  let task = composeTask(agentFindings, wikiRoot, projectRoot);
  let flagFindings = [];
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const result =
      round === 0 ? await runner.run(task) : await runner.resume(task);
    if (result.text) out(result.text + "\n");
    if (isFatalError(result, round, err)) return { ok: false, code: 1 };

    ({ agentFindings, flagFindings } = partition(audit()));
    if (agentFindings.length === 0) {
      if (flagFindings.length === 0) {
        out("fixed: wiki audit is clean\n");
        return { ok: true, code: 0 };
      }
      reportFlags(err, flagFindings, projectRoot);
      return { ok: false, code: 2 };
    }
    task = composeFollowup(agentFindings, projectRoot);
  }

  err(
    `fit-wiki fix: ${agentFindings.length} finding(s) remain after ` +
      `${MAX_ROUNDS} round(s):\n` +
      emitFindingsText(agentFindings, { cwd: projectRoot }),
  );
  if (flagFindings.length > 0) reportFlags(err, flagFindings, projectRoot);
  return { ok: false, code: 1 };
}

/** Run the wiki audit and auto-fix findings: rotate, then agent, then flag. */
export async function runFixCommand(ctx) {
  const { runtime } = ctx.deps;
  const fs = runtime.fsSync;
  const projectRoot = resolveProjectRoot(runtime);
  const wikiRoot = ctx.options["wiki-root"] || path.join(projectRoot, "wiki");
  const today = ctx.options.today || currentDayIso(runtime);
  const out = (s) => runtime.proc.stdout.write(s);
  const logger = createLogger("wiki", runtime);
  const err = (s) => logger.warn("fix", String(s).replace(/\n+$/, ""));

  // The agent's edits change the result, so re-read and re-audit each round.
  const audit = () =>
    runRules(RULES, buildContext({ wikiRoot, today, fs }), { resolveScope });
  // The agent only ever gets prose-judgment (`agent`-class) findings. A
  // `rotate` finding that survived the pre-pass (e.g. a prior-week log) is
  // unfixable by the agent — and trimming append-only history to satisfy a
  // budget would corrupt it — so it joins the flag set for a human.
  const partition = (found) => ({
    agentFindings: found.filter((f) => classOf(f) === "agent"),
    flagFindings: found.filter((f) => classOf(f) !== "agent"),
  });

  let findings = audit();
  if (findings.length === 0) {
    out("nothing to fix\n");
    return { ok: true };
  }

  // Deterministic layer: seal over-budget main logs, then re-bisect over-budget
  // sealed parts. Both are content-preserving — no agent, no history rewrite.
  if (findings.some((f) => classOf(f) === "rotate")) {
    const rotateDeps = { wikiRoot, today, projectRoot, fs, out, err };
    rotateOverBudgetMainLogs(findings, rotateDeps);
    rebisectOverBudgetParts(findings, rotateDeps);
    findings = audit();
    if (findings.length === 0) {
      out("fixed: wiki audit is clean\n");
      return { ok: true, code: 0 };
    }
  }

  // Residual: agent-class goes to the writer; everything else (flag, plus any
  // rotate finding the deterministic pass could not handle) needs a human.
  const { agentFindings, flagFindings } = partition(findings);
  if (agentFindings.length === 0) {
    reportFlags(err, flagFindings, projectRoot);
    return { ok: false, code: 2 };
  }

  // Constructed only now, so a rotation-only or flag-only run never spawns it.
  const runner = await buildFixRunner(ctx, projectRoot, runtime);
  return runAgentRounds(runner, agentFindings, {
    wikiRoot,
    projectRoot,
    audit,
    partition,
    out,
    err,
  });
}
