# Plan 2070 — A product-vs-internal work axis that biases agent routing toward product

Executes [design-a.md](design-a.md) for [spec 2070](spec.md).

## Approach

Define the axis once in `work-definition.md`, wire its four consumers (routing,
spec authoring, issue triage, the merge gate), create the two carrier labels,
then add the deterministic `fit-wiki product-mix` emitter and the storyboard
block it feeds. The label is the single durable carrier of completed-work
classification and the merge gate keeps that population complete, so the metric
is computed from recorded labels rather than asserted. The work interlocks (the
gate depends on the labels, the emitter reads them, the storyboard reads the
emitter's CSV) and the spec requires the axis and its two applications to land
together, so this is one plan executed as a unit.

Libraries used: libwiki (new `product-mix` command), libxmr (reuse the
`fit-xmr record` write path for the CSV append; existing render path
unchanged), libmock (test stubs).

## Step 1 — Define the axis in the rubric

Add the canonical definition so every consumer cites one home.

- Modified: `.claude/agents/references/work-definition.md`

Add a `### Product-aligned vs internal` subsection under `## Classification
tests`, after the mechanical-vs-structural fork:

- **Product-aligned** — changes a product or service surface a JTBD persona
  hires (CLAUDE.md § Products, [JTBD.md](../../JTBD.md)).
- **Internal** — changes the agent team's own machinery, infrastructure, or
  process.
- **Decision test** — one question that sorts a finding into one value.
- A note: this axis is **independent** of the mechanical-vs-structural fork — a
  fix or a spec can be either value.
- A line: the agent opening any work PR (spec PR, issue-sourced fix, or direct
  fix) applies the matching `product` / `internal` label.

Update the existing `### Bug vs feature vs documentation` intake list so its
"Feature / product-aligned" line links to this new subsection instead of
carrying its own definition.

Verification: `work-definition.md` contains the subsection, the decision test,
the independence note, and the label requirement; the intake line links here.

## Step 2 — Add the routing tie-break

Bias work selection toward product when candidates tie within a level.

- Modified: `.claude/agents/references/memory-protocol.md`

In `## On-Boot Routing`, after the four numbered levels and the Skip-self rule,
add a **product-priority tie-break** paragraph:

- When two or more candidates tie within a single routing level (the levels stay
  strictly ordered; an owned priority still preempts everything below it),
  product-aligned work outranks internal work.
- **Exception** — internal work that lifts a constraint currently blocking
  product delivery keeps its place over a tied product candidate, because it
  buys product throughput.
- The bias is a default, not a quota: it does not override an owned priority, an
  active claim, or forbid internal work.

Extend the existing `The ### Decision block records which level produced the
chosen action.` sentence: when the selection tied between a product-aligned and
an internal candidate, the `### Decision` entry also names the chosen axis value
and, if internal was chosen, the constraint it lifts.

Verification: § On-Boot Routing names the tie-break, the constraint-lifting
exception, the not-a-quota clause, and the Decision-block recording rule.

## Step 3 — Require the classification in spec authoring

A new spec states its value and its PR carries the label.

- Modified: `.claude/skills/kata-spec/SKILL.md`

In § Writing a Spec, add a required bullet: the spec states a one-line
**product-vs-internal classification** per the shared rubric. kata-spec does
not cite `work-definition.md` today, so add a fresh fully-qualified link to
`work-definition.md` § Product-aligned vs internal, using the same GitHub
`blob/main` URL form the skill already uses for `coordination-protocol.md`. In
Process Step 6 (Open a spec PR), add: apply the matching `product` / `internal`
label when opening the PR.

Verification: kata-spec requires the stated classification and the PR label; a
spec authored after this lands states its value.

## Step 4 — Apply the axis in issue triage

Triage classifies on the shared axis, not a private definition.

- Modified: `.claude/skills/kata-product-issue/SKILL.md`

In § Classification, add a sentence: triage assigns each issue's
product-vs-internal value from the shared rubric (`work-definition.md` §
Product-aligned vs internal), and the resulting spec or fix carries the matching
label. Keep the existing product-vs-internal *alignment* judgement in § Product
Vision Alignment; the axis value comes from the rubric.

Verification: kata-product-issue assigns the axis value from the shared rubric
and the resulting work carries the label.

## Step 5 — Gate merges on the label

No PR enters `main` unlabeled, so the metric's denominator is complete.

- Modified: `.claude/skills/kata-release-merge/SKILL.md`

Add a DO-CONFIRM checklist item: "Classification label (`product` / `internal`)
is present on the PR." Add a new process step (a **Classification Label Gate**
placed before Step 10 Merge): read the PR's labels (already fetched in Step 1's
`gh pr list --json … labels`); if neither `product` nor `internal` is present,
mark **blocked** (`awaiting classification label`). The docs fast-path does not
bypass this gate: a `.md`/`.mdx` PR skips only the STATUS/approval gate (Step
6), not the label gate — docs PRs are completed work in the denominator and
must carry the label.

Verification: the gate blocks an unlabeled PR, including a docs fast-path PR;
an unlabeled PR cannot merge.

## Step 6 — Create the carrier labels

Create the two repository labels once.

- No files changed (one-time repository operation run during implementation).

Run, idempotently:

```sh
gh label create product  --color 0E8A16 --description "Changes a product or service surface a JTBD persona hires" 2>/dev/null || true
gh label create internal --color 5319E7 --description "Changes the agent team's own machinery, infrastructure, or process" 2>/dev/null || true
```

Verification: `gh label list` shows `product` and `internal`.

## Step 7 — Add the `fit-wiki product-mix` emitter

A deterministic command derives `product_share` from merged-PR labels.

- Created: `libraries/libwiki/src/commands/product-mix.js`
- Created: `libraries/libwiki/test/cli-product-mix.test.js`
- Modified: `libraries/libwiki/src/cli-definition.js`

`runProductMixCommand(ctx)` (mirror `runRefreshCommand` for the `gh` context and
`createScriptConfig("wiki").ghToken()`; mirror `issue-list-renderer.js` for the
`runtime.subprocess.run("gh", …)` call):

- Options: `--until` (ISO, default current day via `currentDayIso`), `--since`
  (ISO, default `until` − 7 days), `--run` (default `gh-live`), `--repo`,
  `--wiki-root`. Resolve the repo as `refresh.js` does — `FIT_GH_REPO` env, else
  the origin slug parsed via `gitClient` from `ctx.deps` (thread `gitClient`
  into the command the same way `runRefreshCommand` does; the slug helper in
  `refresh.js` is private, so extract it to a shared util or re-create it).
- Fetch: `gh pr list --repo <repo> --base main --json number,labels,mergedAt
  --search "merged:<since>..<until>" --limit 200`. The `merged:<since>..<until>`
  search qualifier is the authoritative window (it also implies merged state);
  do not also pass `--state merged`.
- Count merged PRs in the window by label: `P` (`product`), `I` (`internal`),
  `U` (neither). `total = P + I`.
- If `total === 0`: log a notice and emit no row (avoids a 0/0 ratio); return
  `{ ok: true }`.
- Else `product_share = Math.round((P / total) * 100)` (unit `pct`).
- Append the row by reusing the `fit-xmr record` write path (libwiki already
  depends on `@forwardimpact/libxmr`; its `record` command owns `HEADER`, CSV
  escaping, and directory/header creation, writing
  `wiki/metrics/<skill>/<YYYY>.csv`). Invoke via `runtime.subprocess.run`:
  `npx fit-xmr record --skill product-mix --metric product_share --value <pct>
  --unit pct --date <until> --run <run> --note "product=<P> internal=<I>
  unlabeled=<U> window=<since>..<until>" --event-type kata-shift`. `--skill
  product-mix` targets `wiki/metrics/product-mix/<YYYY>.csv` (`<YYYY>` from
  `--date`); pass `--wiki-root` through when set.

Register in `cli-definition.js`: import `runProductMixCommand`, add a
`product-mix` command object (description: "Emit the product-vs-internal mix of
merged PRs as a `product_share` metric row", options `until` / `since` / `run` /
`repo` / `wiki-root`), and add an `examples` entry `fit-wiki product-mix`.

Test (`createMockSubprocess({ responses: { gh: { stdout }, "fit-xmr": { stdout:
"" } } })` + `createMockFs`, per `test/issue-list-block.test.js` and
`test/cli-log.test.js`): given a stubbed `gh` payload of merged PRs, assert the
command invokes `fit-xmr record` with `--skill product-mix --metric
product_share` and the correct `--value`, that a `total === 0` payload makes no
`fit-xmr record` call, and that the `gh` args carry the `merged:` search window.

Verification: `bun test libraries/libwiki/test/cli-product-mix.test.js` passes;
`npx fit-wiki product-mix --help` lists the command.

## Step 8 — Add the storyboard block

The mix renders under the product-manager section.

- Modified: current month's `wiki/storyboard-YYYY-MNN.md`
- Modified: `.claude/skills/kata-session/references/team-storyboard.md`

In the current storyboard, under `### product-manager`, add:

```markdown
#### product_share
<!-- xmr:product_share:wiki/metrics/product-mix/2026.csv Do not edit. Auto-generated. -->
_Awaiting first emission._
<!-- /xmr -->
```

The `2026` literal tracks the storyboard's own year — a fresh storyboard each
year carries the matching `{YYYY}`, per the template's `{YYYY}` marker form.

In `team-storyboard.md` § Planning vs. Review (Planning meeting paragraph), add
a sentence: besides the per-skill blocks, instantiate a `#### product_share`
block under `### product-manager` from `wiki/metrics/product-mix/{YYYY}.csv`.

Verification: after a `product-mix` emission,
`npx fit-wiki refresh <storyboard>` splices an XmR chart into the block; the
planning rule names the product-mix block.

## Step 9 — Wire the emitter into the scheduled run

The product-manager run emits the metric each scheduled pass.

- Modified: `.claude/agents/product-manager.md`

In § Assess (which is skipped for handed tasks, so only scheduled runs emit),
prepend an unnumbered deterministic lead-in sentence at the top of the section,
before the `1. Survey` item (leave the numbered list intact): "Emit the product
mix first: `npx fit-wiki product-mix`." The existing `fit-wiki refresh` step in
the kata-agent action then renders the storyboard block from the fresh CSV.

Verification: the Assess section opens with the `product-mix` emission ahead of
the `1. Survey` item.

## Risks

- **Sparse early series.** Windows with no labeled merged PRs emit no row, so
  the series is empty until merges accumulate under the gate; `fit-xmr` reports
  `insufficient_data` below 15 points. The 7-day default window smooths this.
  The implementer cannot see this timing from the plan.
- **Overlapping-window autocorrelation.** A trailing 7-day window emitted once
  per scheduled run overlaps prior windows; treat `product_share` as a trend,
  not a per-run control reading. Emitting more than once per day inflates row
  count without new information.
- **Published-skill genericity gate.** kata-spec, kata-product-issue, and
  kata-release-merge are published; `bun run invariants` gates them. Keep label
  and rubric references in the generic form the existing skills already use (the
  fully-qualified `work-definition.md` URL); do not add monorepo-specific paths.
- **Missing-CSV refresh.** Before the first emission the storyboard block's CSV
  is absent; `refresh` logs a `BlockRenderError` and leaves the placeholder —
  this is the designed non-fatal path, not a failure.

## Execution

Single unit; route to `staff-engineer`. Steps 1–6, 8, 9 are documentation and
configuration edits; Step 7 is the only code unit (libwiki command + test). Run
sequentially: the labels (Step 6) must exist before the gate (Step 5) and
emitter (Step 7) are exercised, and the emitter (Step 7) must exist before the
storyboard block (Step 8) renders. A `technical-writer` could take the doc-only
steps, but the gate, emitter, and storyboard wiring interlock, so one
engineering agent executing the whole plan is simplest.
