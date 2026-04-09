# Plan: Simplify the Gemba System

## Approach

Three skill merges and one workflow merge, executed as a single branch with one
commit per merge plus a final documentation sweep. Each commit leaves the tree
in a buildable, self-consistent state — the improvement coach and product
manager agent profiles must be updated in the same commit as the skill they
name, so no intermediate state references a directory that no longer exists.

Order is dictated by reference direction:

1. **Grounded theory → walk** first. The walk skill already calls grounded
   theory; absorbing it removes the dangling reference before anything else
   changes.
2. **Trace audit → walk** next. Audit references trace-audit from GEMBA.md §
   Accountability and from the walk skill's Step 3 sub-step. Both pointers are
   rewritten in this commit.
3. **Product merge → product classify** third. Independent of the walk changes;
   placed after them so the walk-related GEMBA.md edits don't collide with the
   product-manager row rewrite.
4. **Workflow merge** last among the functional changes. It touches only
   `.github/workflows/` and the GEMBA.md workflow table; nothing in the skill
   tree depends on it.
5. **Final doc sweep and grep verification** as a single tidying commit for any
   remaining stale references (sha-inventory, gh-cli references, etc.).

Every commit must leave `bun run check` passing. The branch opens as one PR
titled `spec(gemba): simplify gemba system (spec 340)` — the spec bundles these
four changes intentionally and splitting the PR would hide the shared goal
(surface-area reduction) behind a trail of unrelated-looking commits.

### Decisions on the spec's open questions

1. **Invariant list location: `gemba-walk/references/invariants.md`.** Inlining
   the six per-agent tables (~60 rows of table markdown plus the evidence
   paragraph) into `gemba-walk/SKILL.md` would push it well past the ~200-line
   guideline (current walk: 99 lines + absorbed grounded-theory process ≈ 160
   lines + inline invariants ≈ 240+). Keeping the tables in `references/` is
   progressive disclosure: the walk SKILL.md names the path in Step 4 and the
   agent loads the reference on demand. This is the same pattern the
   `gemba-product-classify` skill uses for its templates file.

2. **Merged product-manager workflow schedule: keep both crons.** The spec's
   behavioural requirement 4 says the merged schedule must trigger "at least as
   often as the union of the two previous schedules". The literal union is daily
   08:13 + Mon/Wed/Fri 05:17 = 10 runs/week. Collapsing to daily only is 7
   runs/week and silently removes the early-morning Mon/Wed/Fri slot that the
   feedback workflow was pinned to (comment: "creates work before preparers and
   mergers"). Three extra 30-minute runs per week are negligible on free GHA
   minutes and cheap compared to losing that early-morning coverage.

3. **Workflow filename: `product-manager.yml`.** Matches the one-file-per-agent
   pattern already used by `improvement-coach.yml`. The release-engineer pair
   (`release-readiness.yml`, `release-review.yml`) stays split for out-of-scope
   reasons, so the inconsistency is pre-existing and explicitly left alone.

4. **Grounded theory references: move intact.** `examples.md` (81 lines) and
   `report-template.md` (86 lines) are both reference content with no
   duplication to trim — they move to `gemba-walk/references/` byte-for-byte.
   The `trace-queries.sh` helper moves to `gemba-walk/scripts/` alongside the
   existing `find-runs.sh`.

5. **Concurrency group: `product-manager`.** The new filename and concurrency
   group match. Renaming a concurrency group can cause an in-flight run from the
   old group to coexist with the first run of the new group. Mitigation: before
   merging the PR, run
   `gh run list --workflow=product-backlog.yml --workflow=product-feedback.yml --status=in_progress`
   and wait for any in-flight run to finish or cancel it. In-flight risk is low
   because the workflows have 30-minute timeouts and daily cadence.

## Changes

### Commit 1 — Absorb `gemba-grounded-theory-analysis` into `gemba-walk`

**Blast radius:**

- **Deleted:** `.claude/skills/gemba-grounded-theory-analysis/` (entire
  directory: `SKILL.md`, `references/examples.md`,
  `references/report-template.md`, `scripts/trace-queries.sh`)
- **Created:** `.claude/skills/gemba-walk/references/examples.md`,
  `.claude/skills/gemba-walk/references/report-template.md`,
  `.claude/skills/gemba-walk/scripts/trace-queries.sh`
- **Modified:** `.claude/skills/gemba-walk/SKILL.md`,
  `.claude/agents/improvement-coach.md`, `GEMBA.md`

**File moves (byte-for-byte, git mv where possible):**

```sh
git mv .claude/skills/gemba-grounded-theory-analysis/references/examples.md \
       .claude/skills/gemba-walk/references/examples.md
git mv .claude/skills/gemba-grounded-theory-analysis/references/report-template.md \
       .claude/skills/gemba-walk/references/report-template.md
git mv .claude/skills/gemba-grounded-theory-analysis/scripts/trace-queries.sh \
       .claude/skills/gemba-walk/scripts/trace-queries.sh
```

Then `rm -rf .claude/skills/gemba-grounded-theory-analysis/`.

**`gemba-walk/SKILL.md` rewrite.** Current structure is five steps: Select,
Download, Observe (delegates to GTA), Categorize, Report (delegates to GTA
template). New structure folds the grounded theory methodology into the walk
procedure directly:

1. **Select a Run** — unchanged (keeps the `scripts/find-runs.sh` block)
2. **Download and Process the Trace** — unchanged (keeps the artifact names and
   `fit-eval` invocation)
3. **Observe the Work (Open Coding + Memos)** — absorbs Phase 1 of the current
   grounded-theory SKILL. Keep in-vivo coding and memo guidance as a short
   paragraph. Point at `references/examples.md` for worked examples and at
   `scripts/trace-queries.sh` for the batch/tail/errors/tools helpers on large
   traces.
4. **Build Categories and Core Category (Axial + Selective Coding)** — absorbs
   Phase 2 and Phase 3 as a single section. Keep the paradigm model diagram (one
   fenced block) and the core-category definition. Point at
   `references/examples.md` for the axial/selective coding examples.
5. **Categorize Findings** — unchanged (the trivial fix / improvement /
   observation table stays)
6. **Report** — names `references/report-template.md` as the output format.
   Delete the current "Produce the full grounded theory analysis report as
   defined in the `gemba-grounded-theory-analysis` skill" line — it is the exact
   instruction-layering violation the spec flags.

The "Analysis Principles" bullet list from the current grounded-theory skill
(lines 121–137) moves inline at the end of the walk SKILL.md as a short
reference list — it is decision-shaping content the agent needs on every run,
not supporting material. Trim "Recognize saturation" and "Compare to intent"
only if the line budget forces it; otherwise keep all ten.

**Target size:** `gemba-walk/SKILL.md` ≈ 160 lines after absorption. The Phase 4
cross-trace section from the current GTA skill (lines 109–114) is dropped from
the SKILL.md and preserved as a short paragraph in `references/examples.md` —
gemba walks are single-trace by design, so cross-trace comparison is an
occasional advanced case, not every-run content.

**`improvement-coach.md` edits:**

- Frontmatter skills list (lines 8–13): remove
  `- gemba-grounded-theory-analysis`
- Workflow section (lines 29–35): Step 1 already says "use the `gemba-walk`
  skill to observe a single trace and produce findings via grounded theory" — no
  edit needed; the phrase still reads correctly once grounded theory lives
  inside the walk skill.

**`GEMBA.md` edits:**

- Line 18 intro prose: "fifteen skills" → "fourteen skills" (after this commit;
  will drop further in later commits)
- Line 117 (improvement-coach row): remove `gemba-grounded-theory-analysis` from
  the skills list
- Line 165: delete the `gemba-grounded-theory-analysis` row

### Commit 2 — Absorb `gemba-trace-audit` into `gemba-walk`

**Blast radius:**

- **Deleted:** `.claude/skills/gemba-trace-audit/` (just `SKILL.md`)
- **Created:** `.claude/skills/gemba-walk/references/invariants.md`
- **Modified:** `.claude/skills/gemba-walk/SKILL.md`,
  `.claude/agents/improvement-coach.md`,
  `.claude/skills/gemba-product-classify/SKILL.md`,
  `.claude/skills/gemba-gh-cli/SKILL.md`,
  `.claude/skills/gemba-gh-cli/references/commands.md`, `GEMBA.md`

**New `gemba-walk/references/invariants.md`.** Verbatim move of lines 49–97 of
the current `gemba-trace-audit/SKILL.md` (the six per-agent invariant tables:
product-backlog, release-readiness, release-review, security-update, plan-specs,
implement-plans). The file has a short preamble pulled from the current audit
SKILL.md lines 37–47, and closes with the "A merge that proceeded without…"
high-severity note from line 58–60.

Behavioural requirement 2 requires this file be literally identical to the
current tables in content, severity, and wording. The commit message must state
"invariants preserved verbatim from gemba-trace-audit/SKILL.md lines 49–97" and
the review should diff the two to confirm.

**`gemba-walk/SKILL.md` edits:** Replace the current Step 3 sub-step "Invariant
audit" with a new numbered step (after "Categorize Findings", before "Report"):

```markdown
### N. Audit Named Invariants

In addition to open-ended observation, verify the trace against the named
per-agent invariants listed in `references/invariants.md`. For each invariant
that applies to the trace's owner, search the trace for the evidence listed
and record PASS (with a quoted tool call) or FAIL (with what was searched for
and not found). Group findings by severity.

High-severity invariant failures — especially the contributor-lookup
invariant on product-backlog traces — must result in a fix PR or spec just
like any other gemba finding. Silent acceptance of a high-severity failure is
itself a process failure.
```

Also absorb the "Step 4: Act on Findings" block (current trace-audit lines
124–135) into the walk skill's "Report" step, since the fix-or-spec routing is
the same for audit findings and gemba findings. This eliminates the duplication
the spec flags.

**`improvement-coach.md` edits:**

- Frontmatter skills list: remove `- gemba-trace-audit`
- Workflow section Step 2 ("Audit invariants — Use the `gemba-trace-audit`
  skill"): delete entirely. Step 1 already says "observe a single trace and
  produce findings via grounded theory"; add "and audit named invariants" so the
  full sentence is: "Use the `gemba-walk` skill to observe a single trace, audit
  named invariants, and produce findings via grounded theory."
- Renumber remaining step
- Constraints section (line 53): "Trust the gemba-trace-audit results" → "Trust
  the invariant audit results"

**`gemba-product-classify/SKILL.md` edits:**

- Line 16 (the `gemba-product-merge` link — handled in Commit 3)
- Lines 22–23: "The improvement coach audits classification traces via the
  [`gemba-trace-audit`](../gemba-trace-audit/SKILL.md) skill to confirm trust
  checks happened" → "The improvement coach audits classification traces via the
  [`gemba-walk`](../gemba-walk/SKILL.md) skill's invariant audit to confirm
  trust checks happened"
- Line 35: "which `gemba-trace-audit` verifies against" → "which the
  `gemba-walk` invariant audit verifies against"
- Line 95: "the gemba-trace-audit skill checks" → "the `gemba-walk` invariant
  audit checks"
- Line 156: same substitution

**`gemba-gh-cli/SKILL.md` edits (3 occurrences):**

- Line 17: "`gemba-trace-audit` verifies" → "the `gemba-walk` invariant audit
  verifies"
- Line 49: same
- Line 70: same

**`gemba-gh-cli/references/commands.md`:**

- Line 6: same substitution

**`GEMBA.md` edits:**

- Line 18 prose: "fourteen skills" → "thirteen skills"
- Line 117 (improvement-coach row): remove `gemba-trace-audit` from skills list;
  the row now reads `gemba-walk, gemba-spec, gemba-gh-cli`
- Line 166: delete the `gemba-trace-audit` row
- § Accountability (lines 292–301): rewrite the paragraph. The new canonical
  invariant list path is `.claude/skills/gemba-walk/references/invariants.md`.
  Wording: "Cross-agent accountability runs through the `gemba-walk` skill's
  invariant audit. The improvement coach runs the audit on every gemba walk… The
  canonical invariant list lives in
  [.claude/skills/gemba-walk/references/invariants.md](.claude/skills/gemba-walk/references/invariants.md);
  new accountability rules are added there…"

**Verification after this commit:** the walk SKILL.md is still under 200 lines
(target: ~170), the invariants file contains every invariant from the current
trace-audit tables (diff-verified), and a grep for `gemba-trace-audit` returns
zero hits outside `.claude/memory/`, `wiki/`, `.git/`, and `specs/`.

### Commit 3 — Absorb `gemba-product-merge` into `gemba-product-classify`

**Blast radius:**

- **Deleted:** `.claude/skills/gemba-product-merge/` (just `SKILL.md`)
- **Modified:** `.claude/skills/gemba-product-classify/SKILL.md`,
  `.claude/agents/product-manager.md`, `GEMBA.md`

No files move — the merge comment template and report format already live in
`gemba-product-classify/references/templates.md`. This is the simplest of the
three skill merges.

**`gemba-product-classify/SKILL.md` edits:**

- Delete line 7–9 description fragment: "Does not perform the merge itself —
  that belongs to the `gemba-product-merge` skill."
- Rewrite the skill description (frontmatter) to: "Classify open pull requests
  for mergeability — verify contributor trust, parse PR type, check CI status,
  review spec quality on spec PRs, and merge PRs that pass all gates."
- Delete lines 14–16 (the "merge action itself belongs to…" sentence)
- Rewrite line 54–55 ("A PR that passes all four gates is marked **mergeable**…
  `gemba-product-merge` then performs the merge in the Do phase.") to: "A PR
  that passes all four gates is merged in Step 7."
- After the current "Step 6: Produce the Classification Report", add a new
  **Step 7: Merge Mergeable PRs** absorbed verbatim from
  `gemba-product-merge/SKILL.md` lines 37–60 (the "Step 2: Merge Each Mergeable
  PR" content). The merge comment is already pulled from
  `references/templates.md` § Merge Comment, and templates.md already contains
  both the comment and the `gh pr merge` + verify-state commands — no template
  edits needed.
- Delete line 146–147 ("The report is consumed by the `gemba-product-merge`
  skill…")
- Append "PRs merged this run — number, title, and final state" and "Merge
  failures — number and reason" bullets to the "Memory: What to Record" section
  (absorbed from the deleted merge skill lines 68–72)

**Target size:** `gemba-product-classify/SKILL.md` ≈ 180 lines after absorption
(157 current + ~25 added for Step 7 + memory bullets − ~10 deleted for
cross-references). Within the guideline.

**`product-manager.md` edits:**

- Frontmatter skills list (lines 9–16): remove `- gemba-product-merge`
- Workflow section Step 1 (lines 33–37): rewrite to name one skill: "**PR
  triage** — Follow the `gemba-product-classify` skill to classify open PRs and
  merge those that pass all gates. For `spec` PRs, also apply the `gemba-spec`
  skill's review process; for PRs that include a plan, apply the `gemba-plan`
  skill's review process."

**`GEMBA.md` edits:**

- Line 18 prose: "thirteen skills" → "twelve skills"
- Line 116 (product-manager row): remove `gemba-product-merge` from the skills
  list
- Line 157: delete the `gemba-product-merge` row

### Commit 4 — Merge `product-backlog.yml` and `product-feedback.yml`

**Blast radius:**

- **Deleted:** `.github/workflows/product-backlog.yml`,
  `.github/workflows/product-feedback.yml`
- **Created:** `.github/workflows/product-manager.yml`
- **Modified:** `GEMBA.md`,
  `.claude/skills/gemba-security-update/references/sha-inventory.md`

**New `product-manager.yml` (full contents):**

```yaml
name: "Gemba: Product Manager"

on:
  schedule:
    # Daily at 08:13 UTC — classify and merge open PRs after overnight CI
    - cron: "13 8 * * *"
    # Mon, Wed, Fri at 05:17 UTC — early triage of feedback before preparers
    - cron: "17 5 * * 1,3,5"
  workflow_dispatch:
    inputs:
      task-amend:
        description: "Additional text appended to the task prompt for steering"
        required: false
        type: string

concurrency:
  group: product-manager
  cancel-in-progress: true

permissions:
  contents: write

jobs:
  triage:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - name: Generate installation token
        id: ci-app
        uses: actions/create-github-app-token@f8d387b68d61c58ab83c6c016672934102569859 # v3
        with:
          app-id: ${{ secrets.CI_APP_ID }}
          private-key: ${{ secrets.CI_APP_PRIVATE_KEY }}

      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6
        with:
          fetch-depth: 0
          token: ${{ steps.ci-app.outputs.token }}
          submodules: true

      - uses: ./.github/actions/bootstrap

      - name: Triage product backlog and feedback
        uses: ./.github/actions/gemba-action
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GH_TOKEN: ${{ steps.ci-app.outputs.token }}
          CLAUDE_CODE_USE_BEDROCK: "0"
        with:
          app-id: ${{ secrets.CI_APP_ID }}
          task-text: "Triage the product backlog: PRs and open issues."
          agent-profile: "product-manager"
          model: "opus"
          max-turns: "200"
          task-amend: ${{ inputs.task-amend }}
```

The task-text names the full product-manager responsibility so the agent
profile's Workflow section routes to both PR triage and issue triage in one run.
Memory continuity is preserved because a single run writes a single dated
section to the weekly log (behavioural requirement 5) — the routing happens
inside one session, not across two scheduled invocations.

**`GEMBA.md` edits:**

- Line 15 intro prose: "Nine scheduled workflows" → "Eight scheduled workflows"
- Line 18 prose: "fifteen skills" is already corrected in commits 1–3; "nine
  scheduled workflows" becomes "eight"
- Workflows table (lines 130–140): delete the `product-backlog` and
  `product-feedback` rows; insert a single `product-manager` row:
  `| **product-manager**   | Do, Study, Act | Daily 08:13 UTC + Mon/Wed/Fri 05:17 UTC | product-manager   | Classify and merge open PRs, then triage open issues into fixes and specs |`
- § Trust Boundary merge-point table (lines 227–239): rewrite the three
  `product-backlog` rows and the one `product-feedback` row as:

  ```
  | **product-manager**   | External fix/bug PRs      | Top-20 contributor gate + CI                    |
  | **product-manager**   | External spec PRs         | Top-20 gate + CI + spec review                  |
  | **product-manager**   | CI app PRs                | Trusted app identity (`forward-impact-ci`) + CI |
  | **product-manager**   | Agent-authored fix/spec   | Agent-only, issues as input                     |
  ```

- Prose at lines 68, 83, 92: replace `product-backlog` with `product-manager` in
  the surrounding sentences; update line 83's list of study streams to mention a
  single workflow ("in `product-manager`").

**`gemba-security-update/references/sha-inventory.md` edits (lines 10–11):**
replace `product-backlog.yml, product-feedback.yml` with `product-manager.yml`
in both the `actions/checkout` and `actions/create-github-app-token` rows.

**Concurrency-group migration note.** Before merging the PR, the reviewer runs:

```sh
gh run list --workflow=product-backlog.yml --status=in_progress
gh run list --workflow=product-feedback.yml --status=in_progress
```

If any run is in progress, wait or cancel before merging. Post-merge, the old
concurrency groups (`product-backlog`, `product-feedback`) are abandoned; any
future dispatch lands in the new `product-manager` group. This is safe because
the workflows are scheduled daily at most — the window of concurrent old/new
state is bounded.

### Commit 5 — Reference sweep and verification

**Blast radius:** any file still mentioning the removed skill names or workflow
filenames, excluding `.claude/memory/`, `wiki/`, `.git/`, and `specs/` (per spec
success criteria).

**Verification commands (must all return zero live hits):**

```sh
grep -r "gemba-grounded-theory-analysis\|gemba-trace-audit\|gemba-product-merge" \
  --exclude-dir=.git --exclude-dir=specs --exclude-dir=wiki --exclude-dir=.claude/memory
grep -r "product-backlog\.yml\|product-feedback\.yml" \
  --exclude-dir=.git --exclude-dir=specs --exclude-dir=wiki --exclude-dir=.claude/memory
ls .claude/skills/ | grep -c ^gemba-   # must print 12
ls .github/workflows/product-manager.yml  # must exist
ls .github/workflows/product-backlog.yml .github/workflows/product-feedback.yml 2>&1 \
  | grep -c "No such file"  # must print 2
```

If any live hit remains, this commit fixes it. Anticipated touch-ups:

- `.claude/skills/gemba-security-update/` may reference the workflow files
  outside `sha-inventory.md` — grep confirms.
- The `gemba-gh-cli` skill's commands.md references `gemba-product-feedback`
  (line 107 of gh-cli SKILL.md: "Used by `gemba-product-triage` and
  `gemba-product-feedback`") — this is referencing a **skill** name that does
  not exist, so it is a stale reference even today. Fix to name only
  `gemba-product-triage`.
- The walk-skill scripts path (`scripts/trace-queries.sh`) — verify the SKILL.md
  uses the new path, not the old.

**Final checks:**

```sh
bun run check
bun run test
```

Both must pass on the final branch.

**`specs/STATUS` update:** advance `340` from `review` (or `planned`, depending
on when this plan is approved) to `active` at commit-1 start and `done` after
the final push, per the standard implementation flow. The `gemba-implement`
skill owns those transitions; this plan does not.

## Risks

1. **Walk SKILL.md line budget.** The absorption may land between 160 and 200
   lines depending on how tightly the Analysis Principles list and the
   Observe/Build Categories sections are written. If the final SKILL.md exceeds
   200 lines, move the Analysis Principles block to `references/principles.md`
   as an escape valve. Target is firm at ≤200.

2. **Invariant preservation review.** Behavioural requirement 2 is the most
   critical correctness constraint. Mitigation: Commit 2's PR description must
   include the exact diff between the old trace-audit SKILL.md lines 49–97 and
   the new `references/invariants.md` content, and the reviewer must confirm "no
   invariant dropped, no severity changed, no evidence description reworded."

3. **Concurrency-group rename in-flight collision.** Low probability but
   non-zero. Mitigation documented in Commit 4. If a collision does occur, the
   worst case is two product-manager runs executing simultaneously, one under
   the old group and one under the new, against the same PR list — the classify
   skill is idempotent (it merges a PR at most once because the second run sees
   `MERGED` state), so even the worst case is safe.

4. **Grounded-theory cross-trace section lost visibility.** Dropping the Phase 4
   section from the walk SKILL.md risks the cross-trace comparison practice
   being forgotten. Mitigation: preserve the paragraph in
   `references/examples.md` under a "Cross-trace patterns" heading so it is
   still discoverable when the agent loads the examples file during coding.

5. **Agent profile wording drift.** Commit 1 and Commit 2 both touch
   `improvement-coach.md`; Commit 3 touches `product-manager.md`. These are
   small edits but have no tests. Mitigation: after Commit 3, read both agent
   profiles end-to-end and verify the workflow sections describe the post-merge
   state coherently — this is an explicit success criterion in the spec.

6. **Double coverage on Mon/Wed/Fri.** Keeping both crons means MWF has two
   runs. The 05:17 run may merge a PR; the 08:13 run arrives with an empty
   queue. Acceptable — the classify skill handles an empty queue cleanly (it
   produces a report with zero mergeable PRs and exits). No rate-budget or
   memory-fragmentation concern observed in a scan of the classify SKILL.md.

## Out of scope (reiterated from the spec)

- Merging `plan-specs` and `implement-plans`
- Any change to `gemba-product-triage`, the release-engineer pair, or the
  security-engineer pair
- Any change to `gemba-gh-cli` beyond the reference-path substitutions
- Renaming the surviving skills or the workflow file beyond what is specified
- Rewriting memory history
