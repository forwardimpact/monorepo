// Post-landing, pre-push budget re-validation on the size (word/line) axis.
//
// The wiki landing flow re-runs the audit's budget predicates over the
// outgoing tree between landing and push, and refuses a push that introduces
// or deepens a per-file budget breach this writer's push would publish. The
// gate reuses the audit's budget rules by reference: it resolves the rule
// objects named by `BUDGET_RULE_IDS` and calls each rule's own `check` (the
// over-cap predicate) plus the same `countWords` / `countLines` the audit
// builds its subjects from. It never re-defines a budget, never routes through
// the `runRules` engine (which drops the numeric value and emits nothing under
// cap), and never edits — it refuses, keeping commits local.

import path from "node:path";
import { BUDGET_RULE_IDS, RULES } from "./audit/rules.js";
import { buildContext, resolveScope } from "./audit/scopes.js";
import { countLines, countWords } from "./budget.js";

/**
 * Resolve `BUDGET_RULE_IDS` to their rule objects in `RULES`, tagging each with
 * the count axis its id implies. Throws if a named id is missing from `RULES`,
 * so a rule rename surfaces here rather than silently dropping a predicate.
 * @returns {Array<{id: string, scope: string, axis: 'words'|'lines', check: Function}>}
 */
export function budgetRules() {
  const byId = new Map(RULES.map((r) => [r.id, r]));
  return [...BUDGET_RULE_IDS].map((id) => {
    const rule = byId.get(id);
    if (!rule) throw new Error(`budget-gate: unknown budget rule id '${id}'`);
    return {
      id,
      scope: rule.scope,
      axis: id.endsWith("word-budget") ? "words" : "lines",
      check: rule.check,
    };
  });
}

/**
 * Enumerate which wiki files are budgeted, by reusing the audit's
 * classification. Subjects carry an absolute `path`, so each is reduced to the
 * `<file>` half of `git show <ref>:<file>` relative to `wikiRoot`. No count is
 * read off the working-dir subject — only the file identity and its scope.
 * @param {object} ctx - An audit context from `buildContext`.
 * @param {string} wikiRoot - The wiki clone directory the paths are relative to.
 * @returns {Array<{relPath: string, scope: string}>}
 */
export function budgetedFiles(ctx, wikiRoot) {
  const scopes = new Set(budgetRules().map((r) => r.scope));
  const files = [];
  for (const scope of scopes) {
    for (const subject of resolveScope(scope, ctx)) {
      files.push({ relPath: path.relative(wikiRoot, subject.path), scope });
    }
  }
  return files;
}

/**
 * Measure the budget predicates for the tree at `ref`. Reads each budgeted
 * file's blob via the cwd-bound `showFile`, counts it once with the audit's
 * counters, then for every budget rule on that file's scope records the axis
 * value and whether the rule's own `check` flags it over cap. An absent path
 * at the ref counts as 0 (matching the audit's "missing counts as empty"
 * posture); an unreadable ref makes `showFile` throw, which propagates.
 * @param {(ref: string, file: string) => Promise<string|null>} showFile
 * @param {string} ref - The tree-ish to measure (e.g. "HEAD", a SHA).
 * @param {Array<{relPath: string, scope: string}>} budgeted
 * @returns {Promise<Map<string, Map<string, {value: number, overCap: boolean}>>>}
 *   relPath → ruleId → { value, overCap }.
 */
export async function measureRef(showFile, ref, budgeted) {
  const rules = budgetRules();
  const result = new Map();
  for (const { relPath, scope } of budgeted) {
    const text = (await showFile(ref, relPath)) ?? "";
    const counts = { words: countWords(text), lines: countLines(text) };
    const perRule = new Map();
    for (const rule of rules) {
      if (rule.scope !== scope) continue;
      perRule.set(rule.id, {
        value: counts[rule.axis],
        overCap: rule.check(counts) != null,
      });
    }
    result.set(relPath, perRule);
  }
  return result;
}

/**
 * Compare the outgoing tree against the two push-input baselines and return the
 * per-file/per-predicate refusal delta. For each (file, rule) the baseline is
 * the worse (higher) of the session-base and origin-tip values, treating an
 * absent measurement as 0. A predicate refuses iff the outgoing value is over
 * cap AND strictly exceeds that baseline — so equal-or-better states pass, and
 * a foreign breach the writer did not worsen passes. A `summary.*` breach on a
 * file listed in `exemptSummaryFiles` is surfaced instead of refused — the
 * memo-delivery seam, where blocking a delivery into deficient headroom would
 * enforce a contradiction the memo-headroom measures exist to resolve.
 *
 * @param {object} args
 * @param {Map<string, Map<string, {value: number, overCap: boolean}>>} args.outgoing
 * @param {Map<string, Map<string, {value: number}>>|null} args.sessionBase - null when unborn.
 * @param {Map<string, Map<string, {value: number}>>|null} args.originTip
 * @param {string[]} [args.exemptSummaryFiles]
 * @returns {{refusals: Array<object>, surfaced: Array<object>}}
 *   Each entry: { file, ruleId, baseline, value }.
 */
export function revalidateBudgets({
  outgoing,
  sessionBase,
  originTip,
  exemptSummaryFiles = [],
}) {
  const exempt = new Set(exemptSummaryFiles);
  const refusals = [];
  const surfaced = [];
  const baselineValue = (ref, relPath, ruleId) =>
    ref?.get(relPath)?.get(ruleId)?.value ?? 0;
  for (const [relPath, perRule] of outgoing) {
    for (const [ruleId, { value, overCap }] of perRule) {
      if (!overCap) continue;
      const baseline = Math.max(
        baselineValue(sessionBase, relPath, ruleId),
        baselineValue(originTip, relPath, ruleId),
      );
      if (value <= baseline) continue;
      const entry = { file: relPath, ruleId, baseline, value };
      if (ruleId.startsWith("summary.") && exempt.has(relPath)) {
        surfaced.push(entry);
      } else {
        refusals.push(entry);
      }
    }
  }
  return { refusals, surfaced };
}

/**
 * Run the gate end to end over the outgoing tree. Builds the audit context,
 * enumerates the budgeted files, measures the committed `HEAD` (what publishes)
 * and the two push-input baselines through the one `measureRef` path, then
 * computes the per-file/per-predicate delta. An unreadable baseline ref makes
 * `showFile` throw, which aborts the gate WITHOUT refusing — the gate only
 * refuses a regression it can prove, so a read failure surfaces (the push
 * proceeds) rather than fabricating a value-0 baseline that would wrongly block
 * a foreign pre-existing breach.
 *
 * @param {object} args
 * @param {(ref: string, file: string) => Promise<string|null>} args.showFile
 * @param {string} args.wikiRoot - The wiki clone directory.
 * @param {string} args.today - ISO day for the audit context (weekly-log scope).
 * @param {object} args.fs - Sync fs the audit context reads with.
 * @param {string} args.headRef - The outgoing tree-ish (e.g. "HEAD").
 * @param {string} args.originRef - The landed origin tip ref.
 * @param {string} [args.sessionBaseSha] - Pre-fetch session base, or "" when unborn.
 * @param {string[]} [args.exemptSummaryFiles] - Memo-delivery seam set.
 * @returns {Promise<{refusals: Array<object>, surfaced: Array<object>}>}
 */
export async function runBudgetGate({
  showFile,
  wikiRoot,
  today,
  fs,
  headRef,
  originRef,
  sessionBaseSha,
  exemptSummaryFiles = [],
}) {
  const budgeted = budgetedFiles(
    buildContext({ wikiRoot, today, fs }),
    wikiRoot,
  );
  let outgoing;
  let sessionBase = null;
  let originTip = null;
  try {
    outgoing = await measureRef(showFile, headRef, budgeted);
    if (sessionBaseSha) {
      sessionBase = await measureRef(showFile, sessionBaseSha, budgeted);
    }
    originTip = await measureRef(showFile, originRef, budgeted);
  } catch {
    // Cannot prove a regression (unreadable ref) ⇒ do not refuse; fail-visible.
    return { refusals: [], surfaced: [] };
  }
  return revalidateBudgets({
    outgoing,
    sessionBase,
    originTip,
    exemptSummaryFiles,
  });
}
