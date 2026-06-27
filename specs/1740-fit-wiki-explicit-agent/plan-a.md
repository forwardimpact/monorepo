# Plan 1740-a — fit-wiki explicit `--agent`

Execution plan for [design 1740-a](design-a.md) over [spec 1740](spec.md).

## Approach

Land the resolver and core-budget seams first (steps 1–2), migrate every
handler onto the resolver and delete the env reads and `staff-engineer`
last-resort (steps 3–4), then add the rotate under-budget guard and the
function-valued audit hints (steps 5–7), then regenerate goldens and add the
fail-closed test corpus (step 8), and finish with the docs/fixtures migration
and the no-bare-call-site sweep (steps 9–10). Each step is independently
verifiable; steps 1–2 are prerequisites for the rest.

Libraries used: libwiki (cli-definition, commands, weekly-log, audit/rules,
fix), libutil (rules).

## Step 1 — Add the resolver

Intent: one home for the missing-flag error contract.

- Created: `libraries/libwiki/src/util/agent-flag.js`

```js
/**
 * Resolve the required agent flag from frozen CLI options. Pure — no fs, no
 * env. Returns { ok: true, agent } or { ok: false, code: 2, error } where the
 * error names the missing flag and shows a corrected example. Never mentions
 * an environment variable.
 * @param {Record<string, unknown>} options
 * @param {{ command: string, flag?: string, example: string }} spec
 */
export function requireAgentFlag(options, { command, flag = "--agent", example }) {
  const key = flag === "--from" ? "from" : "agent";
  const agent = options[key];
  if (!agent) {
    return {
      ok: false,
      code: 2,
      error: `${command} requires ${flag} <name>; e.g. ${example}`,
    };
  }
  return { ok: true, agent };
}
```

Verify: `bunx vitest run libraries/libwiki/test/cli-agent-flag.test.js`
(added in step 8) — direct unit assertions on both arms.

## Step 2 — Widen "over budget" and name the rotate no-op reasons in core

Intent: word-or-line budget decided once in core; every `noop` return carries a
reason and measured size so the handler need not re-read the file.

- Modified: `libraries/libwiki/src/weekly-log.js` (`rotateIfOverBudget`)
- Replace the three bare `{ status: "noop", fromPath }` returns with reasoned
  forms. The missing-file return precedes the read, so it carries no size; the
  floor and under-budget returns measure `lines`/`words` from the read `text`
  (the floor's body is empty, so its `words` is the H1's word count — reported
  for symmetry, not used by the floor branch):
  - missing file → `{ status: "noop", reason: "missing", fromPath }`
  - header-only/empty body →
    `{ status: "noop", reason: "floor", lines, words, fromPath }`
  - under budget without force →
    `{ status: "noop", reason: "under-budget", lines, words, fromPath }`
- Widen the non-force gate from lines-only to either budget:

```js
const lines = countLines(text);
const words = countWords(text);
const overBudget =
  lines + appendLines > WEEKLY_LOG_LINE_BUDGET || words > WEEKLY_LOG_WORD_BUDGET;
if (!force && !overBudget) {
  return { status: "noop", reason: "under-budget", lines, words, fromPath: filePath };
}
```

  The header-only floor check stays *before* this gate and *before* the `force`
  branch — the floor is non-overridable. Update the JSDoc `@returns` union to
  add `reason` and the measured fields.

Verify: `bunx vitest run libraries/libwiki/test/weekly-log` and
`.../cli-fix-rotation.integration.test.js` — `fix`'s deterministic pre-pass
branches on `status` only, so its behaviour is unchanged; the
word-over/line-under seal it relied on `force: true` for now also seals without
force.

## Step 3 — Migrate handlers onto the resolver; delete env reads

Intent: replace each `options.agent || env…` (and boot's `|| "staff-engineer"`)
with one `requireAgentFlag` call as the handler's first agent-resolving
statement; the previously dead/divergent guards become this one live path.

- Modified: `commands/boot.js`, `commands/log.js`, `commands/claim.js`,
  `commands/inbox.js`, `commands/rotate.js`, `commands/memo.js`

Per file:

- `boot.js`: replace the `agent = options.agent || env… || "staff-engineer"`
  with
  `requireAgentFlag(options, { command: "boot", example: "fit-wiki boot --agent staff-engineer" })`;
  return its error object when `!ok`.
- `log.js`: in `commonContext`, return `{ error: res }` when `requireAgentFlag`
  fails (drop the `stderr.write` + bare `{ ok:false, code:2 }`).
- `claim.js`: `runClaimCommand` resolves first; `runReleaseCommand` resolves
  only on the targeted path — after the `--expired` branch's early return,
  replacing the existing `options.agent || env…` at the `release requires
  --agent or --expired` guard. `release --expired` keeps its agent-less sweep
  untouched.
- `inbox.js`: in `paths`, return `{ error: res }` from the resolver.
- `rotate.js`: resolver first; keep the existing `target → …` echo (now after a
  confirmed agent).
- `memo.js`:
  `requireAgentFlag(options, { command: "memo", flag: "--from", example: 'fit-wiki memo --from staff-engineer --to … --message …' })`;
  delete the `runtime.proc.env.LIBEVAL_AGENT_PROFILE` read.

Verify: `bunx vitest run libraries/libwiki/test` — fail-closed tests (step 8)
assert the new contract; explicit-flag tests pass unmodified.

## Step 4 — Drop the env parameter from the CLI definition

Intent: the parameter is the ambient-identity seam; with both env reads gone it
has no consumer.

- Modified: `libraries/libwiki/src/cli-definition.js`
- `createDefinition(env)` → `createDefinition()`. Update the JSDoc (remove the
  `@param env` and the ambient-dependency sentence).
- `agentOpt`: delete `default`; description →
  `"Agent name (required; no environment fallback)"`.
- memo's `from`: delete `default`; description →
  `"Sender agent name (required; no environment fallback)"`.
- Modified: `libraries/libwiki/bin/fit-wiki.js:19` → `createDefinition()`.
- Modified: `libraries/libwiki/test/golden.test.js:24` → `createDefinition()`.

Verify: `bunx vitest run libraries/libwiki/test/golden.test.js` (after step 8
regenerates goldens).

## Step 5 — Forward `--force` and reasoned no-ops in the rotate handler

Intent: rotate fails closed on an under-budget target unless `--force`; the
floor stays a zero-exit no-op; a missing/typo'd target exits 2.

- Modified: `libraries/libwiki/src/commands/rotate.js`
- Modified: `libraries/libwiki/src/cli-definition.js` (rotate `options`)
- Add a
  `force: { type: "boolean", description: "Seal even an under-budget log (the header-only floor still holds)" }`
  option to the rotate command.
- Stop hardwiring `force: true`; forward `{ force: options.force }`.
- Branch the `noop` arm on `result.reason`:
  - `"floor"` → existing zero-exit message (`no rotation needed for <agent>`),
    `{ ok: true }`.
  - `"under-budget"` →
    `{ ok: false, code: 2, error: "<target> is under budget (<lines> lines, <words> words); pass --force to seal it early" }`.
  - `"missing"` →
    `{ ok: false, code: 2, error: "no weekly log for <agent> at <fromPath>" }`.

Verify: `bunx vitest run libraries/libwiki/test/cli-rotate.integration.test.js`
— under-budget exits 2 + no seal; `--force` seals above floor; floor not
overridable by `--force`; over-budget seals without `--force`.

## Step 6 — Widen the rules-engine `hint` to accept a function

Intent: a rule's `hint` may be `string | (subject, item, ctx) => string`,
resolved once per finding. Additive — static-string rules render identically.

- Modified: `libraries/libutil/src/rules.js` (`applyRule`)

```js
hint: typeof rule.hint === "function" ? rule.hint(subject, item, ctx) : (rule.hint ?? null),
```

  Update the engine's header comment: `hint` is a static string or a
  `(subject, item, ctx) => string` resolved at finding time.

Verify: `bunx vitest run libraries/libutil/test/rules.test.js` (added in step 8)
— a function hint resolves per finding; a static hint is unchanged.

## Step 7 — Function-valued audit hints; filter function hints out of the fix contract

Intent: the weekly-log budget hints emit a fully resolved, correctly targeted
`rotate --agent <prefix>`; `fix`'s rule-level hint listing skips function hints
(they are per-finding remediation, not file invariants, and would leak source).

- Modified: `libraries/libwiki/src/audit/rules.js`
- Modified: `libraries/libwiki/src/commands/fix.js` (`invariantContract`)
- `weekly-log.line-budget` and `weekly-log.word-budget`: replace the
  static-string `hint` with `hint: (s) => \`run
  \\\`bunx fit-wiki rotate --agent ${s.agentPrefix}\\\` to seal this file as a
  sealed part and start a fresh weekly log\`` — the interpolated prefix replaces
  the old "(agent = this filename's prefix)" parenthetical, which is
  intentionally dropped now that the value is resolved. The over-budget hint
  never trips the new guard.
- `invariantContract`: filter to static-string hints —
  `RULES.filter((r) => scopes.has(r.scope) && typeof r.hint === "string")`.

Verify: `bunx vitest run libraries/libwiki/test/audit-rules.test.js` — the
over-budget weekly-log hint names the agent from `agentPrefix`, no placeholder;
`bunx vitest run .../cli-fix.integration.test.js` — no function source in the
agent prompt.

## Step 8 — Goldens and the fail-closed test corpus

Intent: regenerate help goldens; add fail-closed tests for both env states; add
the resolver unit test and the first libutil rules-engine test.

- Modified: `libraries/libwiki/test/golden/**` (regenerated help outputs)
- Created: `libraries/libwiki/test/cli-agent-flag.test.js`,
  `libraries/libwiki/test/cli-inbox.test.js`,
  `libraries/libwiki/test/cli-release.test.js`,
  `libraries/libutil/test/rules.test.js`
- Modified: existing `cli-boot`, `cli-log`, `cli-claim`, `cli-memo`,
  `cli-rotate` tests — replace assertions of the removed fallback / old guard
  wording with the new fail-closed contract; keep the explicit-flag subset.
- Each agent-scoped subcommand (`boot`, `log decision`, `claim`,
  `release --target`, `inbox {list,ack,promote,drop}`, `rotate`, `memo`):
  drive with no flag, once with `LIBEVAL_AGENT_PROFILE` set and once unset;
  assert exit 2, error names the flag, zero wiki mutations.
- `release --expired` agent-less: expired rows removed, exit 0.
- Regenerate goldens with the repo's golden-update path (run the golden test in
  update mode per its harness, then commit).

Verify: `bunx vitest run libraries/libwiki/test libraries/libutil/test`.

## Step 9 — Docs and fixtures migration

Intent: no surface instructs a bare agent-scoped invocation or describes the env
fallback.

- Modified (confirm exact set via the step-10 sweep before editing):
  `libraries/libwiki/README.md` (agent-resolution sentence);
  `.claude/skills/fit-wiki/SKILL.md` (fallback rows);
  `.claude/skills/kata-*/SKILL.md` Step 0 boot lines reading bare
  `fit-wiki boot`; `.claude/agents/references/memory-protocol.md` and
  `coordination-protocol.md`; the published `websites/**` wiki-operations guide;
  `benchmarks/fit-wiki` fixtures.
- Each bare `fit-wiki <agent-scoped>` → `--agent <name>` (or `--from`);
  `release --expired` left agent-less. Remove every sentence describing
  `LIBEVAL_AGENT_PROFILE` as a `fit-wiki` fallback.

Verify: targeted re-read of each edited file; `bunx fit-map validate` and the
docs build are unaffected (no schema/site-structure change).

## Step 10 — No-bare-call-site and no-fallback-description sweep

Intent: prove the migration is complete; record the sweep in the PR.

- Repo-wide search for bare agent-scoped invocations and surviving fallback
  descriptions:

```sh
rg -n 'fit-wiki (boot|log|claim|release --target|inbox|rotate)\b(?!.*--agent)' \
  --glob '!benchmarks/**' --glob '!**/node_modules/**'
rg -n 'fit-wiki memo\b(?!.*--from)'
rg -n 'LIBEVAL_AGENT_PROFILE' libraries/libwiki/src   # expect zero
rg -n 'LIBEVAL_AGENT_PROFILE.*fit-wiki|fit-wiki.*LIBEVAL_AGENT_PROFILE' \
  --glob '!libraries/libeval/**'
```

  `benchmarks/` is `.rgignore`-excluded — sweep it explicitly with
  `rg -n … benchmarks/fit-wiki`. The `libwiki` `LIBEVAL_AGENT_PROFILE` grep is
  the package *source* criterion: scope it to `libraries/libwiki/src` so the
  step-8 fail-closed tests (which set the env to prove it is ignored) are not
  counted as false positives. Confirm composite actions, workflows, scripts,
  and agent profiles invoke only non-agent-scoped commands (push/pull/audit/fix)
  or already pass the flag.

Verify: the `libwiki`-source `LIBEVAL_AGENT_PROFILE` search returns zero
(success criterion); other searches return only `release --expired` and
`libeval`'s own legitimate uses.

## Risks

- **Golden regeneration drift.** The help-output goldens change in step 4 (two
  description strings, no defaults shown). Regenerate via the harness's update
  path, not by hand — a hand-edit that misses a byte fails the golden test
  opaquely.
- **`fix` word-over reliance.** `fix` currently passes `force: true` partly to
  seal word-over/line-under logs; step 2's either-budget widening makes that
  redundant but `fix` still passes `force: true` — verify the
  `cli-fix-rotation` integration test still seals exactly once per path (the
  `sealed` set dedup in `rotateOverBudgetMainLogs` already guards double-seal).
- **Release is a breaking CLI change.** The version bump and changelog entry are
  `kata-release-cut`'s responsibility, routed via the breaking-change note; this
  plan does not cut the release.

## Execution

Single engineering agent, steps in order — 1 and 2 gate 3–7. Steps 9–10
(docs/sweep) may run after code is green; suitable for `technical-writer` if
split, but small enough to keep with the implementer.

— Staff Engineer 🛠️
