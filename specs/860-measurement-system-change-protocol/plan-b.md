# Plan 860-b — Measurement-system change protocol (design-b)

Spec: [spec.md](spec.md) · Design: [design-b.md](design-b.md)

## Rationale

This plan pairs with `design-b.md` (the alternative architecture: protocol
co-located in `coordination-protocol.md`, redefinitions as `wiki/redefinitions/`
file artifacts, `approvals_recorded_per_run` as a count metric, redefinition
hook baked into `storyboard-template.md`). A sibling `plan-a.md` would pair
with `design-a.md` (new `measurement-protocol.md` sibling reference; YAML
blocks embedded in issue/PR bodies; `time_to_first_approval_hours` duration
metric; storyboard hook as `<do_confirm_checklist>` items in
`team-storyboard.md`). The letter pairing keeps the chain readable: design-b
→ plan-b. The approver selects the design variant to implement; this plan
becomes live only if design-b is chosen.

## Approach

Land the protocol inside `.claude/agents/references/coordination-protocol.md`
as one new § Measurement-system changes section (eight repair moves, the
redefinition file shape, the no-silent-redefinition rule, the
`git diff`-native detection recipe), add a one-paragraph link from
`KATA.md` § Metrics, register `approvals_recorded_per_run` in
`kata-release-merge` (one row in `references/metrics.md`, recording
instructions in `SKILL.md`), and bake the redefinition-link slot plus the
bulleted canonical-12 enumeration into `kata-session/references/storyboard-template.md`.
The implementation run also writes the wiki-side companions through the
separate wiki checkout: the May storyboard's "11 canonical metrics" prose is
replaced with the bulleted enumeration (denominator 11→12 in the same diff)
and one founding worked-example redefinition file lands at
`wiki/redefinitions/2026-05-12-se-exp-33-sidecar-pre-flight.md` (illustrative;
the implementation PR itself is grandfathered per design § Migration
boundary). The first row of `approvals_recorded_per_run` is appended to the
existing long-format CSV by the implementation run.

Libraries used: none.

## Plan-level decisions (design left open)

| # | Decision | Rejected | Why |
|---|---|---|---|
| P1 | Cohort window for `approvals_recorded_per_run` is `(prev_started_at, current_started_at]`, where `current_started_at` is captured at SKILL.md Step 0 as `date -u +%FT%TZ`, and `prev_started_at` is parsed from the previous row's `note` field (encoded as `started_at=<ISO>;...`). First-ever row falls back to `current_started_at - 8h` (the median schedule gap of 03:00 / 12:00 / 20:00 UTC). | Sidecar state file under `wiki/metrics/kata-release-merge/`; or `gh api` query for `event > previous_run_finished_at` using GitHub Actions run timestamps. | A state file fragments the metric's home; Actions timestamps require cross-workflow API reads that the skill does not otherwise need. The CSV `note` already carries free-form annotations — encoding `started_at` there keeps the producer self-contained. |
| P2 | Window-source query is `gh api repos/{owner}/{repo}/issues/{number}/timeline --paginate --jq '.[] | select(.event=="labeled" and (.label.name|test("^(spec\|design\|plan):approved$")))'` over each open phase PR surveyed in SKILL.md Step 1, plus `gh api repos/{owner}/{repo}/pulls/{number}/reviews --paginate --jq '.[] | select(.state=="APPROVED")'` for review-shaped approvals. `plan:implemented` is excluded by the regex (design § Approval-throughput metric). | `gh pr view --json timelineItems`. | `gh pr view` does not expose label-add timestamps; the REST timeline API does. The skill already calls `gh api` (Step 2 contributor lookup), so no new dependency. |
| P3 | Filled-in worked example required by spec Success #2 lives **inline** in `coordination-protocol.md` § Measurement-system changes (the SE Exp 33 #787 sidecar-pre-flight case). The wiki-side founding redefinition file at `wiki/redefinitions/2026-05-12-se-exp-33-sidecar-pre-flight.md` is committed as the **on-disk** worked example referenced from the protocol section. Both point to the same case; reviewers can grep `producer-rehoming` or `sidecar-pre-flight` from either surface and reach the same content. | One example only (either inline or wiki-side). | Spec Success #2 requires "one filled-in example" in the reference (inline). Design § Detection requires a file at `wiki/redefinitions/` exists so the grep recipe matches at least one path. The two satisfy different success criteria; both ship. |
| P4 | Canonical-11 → canonical-12 enumeration replaces inline prose **only in the current month's storyboard** (`wiki/storyboard-2026-M05.md`). `storyboard-template.md` ships the enumeration as a `<!-- canonical-12 -->` marker block plus a `Redefinition:` link slot under § Current Condition § Headlines, so future months inherit the shape via `bunx fit-wiki refresh`. | Edit every historical `wiki/storyboard-*.md`. | Historical storyboards are append-only audit records (per `memory-protocol.md` § Weekly Log Contract analogue). The current-month file is the only live consumer; the template propagates the shape forward. |
| P5 | `approvals_recorded_per_run` value column is the **count** of distinct label-add events plus APPROVED-review events observed in the window. Same `<phase>:approved` label re-applied to the same PR within the window counts once (de-dupe on `(pr_number, label_name, event_timestamp_truncated_to_second)`). | Count every raw API event. | Re-application within one second is GitHub UI noise (button double-click), not a separate ratification. The de-dupe key is mechanical. |

## Step 1 — coordination-protocol.md § Measurement-system changes

Add a new H2 section between the existing `## Approval signal` (line 34) and
`## Decision questions` (line 62) — the sibling placement design-b § Components
specifies. **Modified:**
`.claude/agents/references/coordination-protocol.md`.

The section carries, in order:

1. **Lead paragraph** (≤4 lines) — names the typology, the redefinition file
   artifact, the no-silent-redefinition rule, and the detection grep as the
   four components.
2. **Eight repair moves** — a table with columns `Move | Definition | Falsifier-set kind | Existing precedent`, populated verbatim from design-b § Repair-move typology and the eight rows in design-a § Repair-move typology (both designs agree on content, only home differs). The list is closed at design time; "extensions land via the spec/design/plan/implement chain" is stated in one sentence after the table.
3. **Redefinition shape** — a fenced YAML code block exactly matching design-b § Redefinition shape (file artifact). One sentence below clarifies `verdict_horizon ≤ cohort_readout` and the `denominator_effect` enum semantics.
4. **No-silent-redefinition rule** — blockquote verbatim from design-b § No-silent-redefinition rule. The "KATA.md § Metrics links to it; no other file restates it" sentence follows.
5. **Worked example** (spec Success #2) — heading `### Worked example — SE Exp 33 (#787) sidecar pre-flight`. Inline YAML front-matter populated for the SE Exp 33 case (`move: sidecar-pre-flight`, `affected_metrics: [{skill: kata-trace, metric: findings_count}]`, falsifier `sidecar diverges from canonical at horizon`, `denominator_effect: sidecar`, links to #787 and the wiki file from P3). The corresponding on-disk file is named in the example body.
6. **Detection (Success #6)** — heading `### Detection`. The fenced `sh` block from design-b verbatim. One sentence above states the rule ("any commit touching a canonical-11 metric edge must, in the same commit, add or modify a `wiki/redefinitions/*.md` file"); one sentence below names the edges (`wiki/storyboard-*.md`, `.claude/skills/*/references/metrics.md`, `coordination-protocol.md` § Measurement-system changes).

Approximate net addition: 70 lines (matches design-b decision #1
size-impact estimate). Final file length ~235 lines; references do not
carry the 200-line design cap (no soft cap in CONTRIBUTING.md or
CLAUDE.md for `.claude/agents/references/`).

Verify: `wc -l .claude/agents/references/coordination-protocol.md` shows
≈235; `rg '^## Measurement-system changes$' .claude/agents/references/coordination-protocol.md` returns one hit; `rg 'producer-rehoming|mode-restriction|historical-phasing|sidecar-pre-flight|stock-vs-flow-recast|event-driven-recast|rule-semantics-rfc|habit-to-policy' .claude/agents/references/coordination-protocol.md | wc -l` returns ≥8 (one definition row per move).

## Step 2 — KATA.md § Metrics linking paragraph

Append one paragraph at the end of § Metrics (currently lines 257–274,
ending at the `fit-xmr` sentence on line 274). **Modified:** `KATA.md`.

Insert after line 274:

```markdown
Changes to the canonical-11 set — additions, removals, conditional or
unconditional redefinitions — follow the protocol in
[`coordination-protocol.md` § Measurement-system changes](.claude/agents/references/coordination-protocol.md#measurement-system-changes):
each change ships in the same PR as a `wiki/redefinitions/{YYYY-MM-DD}-{slug}.md`
file naming the repair move, the affected metric(s), the falsifier set, the
verdict horizon, and the cohort read-out date. The no-silent-redefinition rule
lives there; this section does not restate it.
```

The "count of units of work" sentence on line 261 is unchanged —
design-b preserves the constitutional rule (decision #4). No other
edits to § Metrics.

Verify: `rg -n 'Measurement-system changes' KATA.md` returns one match
in the § Metrics block; `git diff KATA.md` shows one inserted paragraph
and no other hunks.

## Step 3 — kata-release-merge `references/metrics.md` new row

Add the new metric beside `prs_merged`. **Modified:**
`.claude/skills/kata-release-merge/references/metrics.md`.

Replace the current single-row table with:

```markdown
| Metric                       | Unit  | Description                                                                                  | Data source                                                       |
| ---------------------------- | ----- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| prs_merged                   | count | PRs merged this run                                                                          | Run actions                                                       |
| approvals_recorded_per_run   | count | `<phase>:approved` label-add events + APPROVED review events observed on open phase PRs in the run window | `gh api repos/.../issues/{n}/timeline` + `.../pulls/{n}/reviews`  |
```

Append below the existing "Backlog … is queried, not recorded." line:

```markdown
The window is `(prev_started_at, current_started_at]`; `current_started_at`
is captured at SKILL.md Step 0; `prev_started_at` is parsed from the
previous CSV row's `note` field (`started_at=<ISO>;…`). First-ever row
falls back to `current_started_at - 8h`. De-dupe by
`(pr_number, label_name, second)`; `plan:implemented` is a state label,
excluded. See [`coordination-protocol.md` § Measurement-system changes](../../../agents/references/coordination-protocol.md#measurement-system-changes).
```

Verify: `rg -n 'approvals_recorded_per_run' .claude/skills/kata-release-merge/references/metrics.md` returns ≥1 hit; the table renders as two rows.

## Step 4 — kata-release-merge SKILL.md recording instructions

Two small edits to wire the metric. **Modified:**
`.claude/skills/kata-release-merge/SKILL.md`.

**Edit 4a** — extend Step 0 to capture `current_started_at`. Replace the
`### Step 0: Read Memory` body to add one sentence after the existing
memory-read instruction:

```markdown
Capture this run's start timestamp once at the top of the run:
`current_started_at=$(date -u +%FT%TZ)`. The approval-throughput metric (Step 9) uses it
as the window upper bound. Read the previous row's `started_at=<ISO>` from
`note` in `wiki/metrics/kata-release-merge/{YYYY}.csv` to set
`prev_started_at`; first-ever row uses `current_started_at - 8h`.
```

**Edit 4b** — extend Step 9 § Classification Report so the metric row is
produced alongside the existing record. Add a new sub-step:

```markdown
### Step 9.5: Record approval-throughput metric

For each open phase PR surveyed in Step 1, fetch label-add events:

\`\`\`sh
gh api repos/{owner}/{repo}/issues/<number>/timeline --paginate \
  --jq '.[] | select(.event=="labeled" and (.label.name|test("^(spec|design|plan):approved$"))) | {ts: .created_at, label: .label.name}'
\`\`\`

And APPROVED reviews:

\`\`\`sh
gh api repos/{owner}/{repo}/pulls/<number>/reviews --paginate \
  --jq '.[] | select(.state=="APPROVED") | {ts: .submitted_at}'
\`\`\`

Filter to events whose `ts` is in `(prev_started_at, current_started_at]`;
de-dupe label events by `(pr_number, label_name, second)` (P5). Sum to
`approvals_recorded_per_run`. Append one row to
`wiki/metrics/kata-release-merge/{YYYY}.csv` with
`metric=approvals_recorded_per_run`, `unit=count`,
`note="started_at=<current_started_at>;<phase>:approved=N1;APPROVED-review=N2"`
(the prefix `started_at=<ISO>;` is required for the next run to read its
own `prev_started_at`).
```

The existing `prs_merged` row continues to be appended per Step 9; both
rows share the date but carry distinct `metric` values (long-format CSV
discipline, design-b decision #6).

Verify: `rg -n 'approvals_recorded_per_run|started_at=' .claude/skills/kata-release-merge/SKILL.md` returns ≥4 hits across Step 0 and Step 9.5; the `### Step 9.5:` heading exists between `### Step 9:` and `## Memory: what to record`.

## Step 5 — storyboard-template.md structural slot

Bake the canonical-12 enumeration and the `Redefinition:` link slot into
the template so every regenerated storyboard inherits them. **Modified:**
`.claude/skills/kata-session/references/storyboard-template.md`.

**Edit 5a** — replace the `### Headlines` body (lines 27–35) to add the
canonical-12 marker block above the existing bullet template:

```markdown
### Headlines

_Tight list of metrics whose status changed since the last meeting (new signal,
threshold crossed, classification flip). Empty if nothing changed — write
"None." on a single line._

<!-- canonical-12 -->
The canonical-12 set (denominator for the Target Condition's "≥6 of 12"):
- `kata-product-issue` / `issues_triaged`
- `kata-spec` / `specs_drafted`
- `kata-design` / `designs_drafted`
- `kata-plan` / `plans_drafted`
- `kata-implement` / `implementations_landed`
- `kata-release-merge` / `prs_merged`
- `kata-release-merge` / `approvals_recorded_per_run`
- `kata-release-cut` / `releases_cut`
- `kata-security-update` / `prs_actioned`
- `kata-security-audit` / `findings_filed`
- `kata-documentation` / `errors_found`
- `kata-wiki-curate` / `entries_curated`
<!-- /canonical-12 -->

- `{agent}` / `{metric}` — {value} {trend/badge} — {one-line reason} — Redefinition: {`wiki/redefinitions/...md` or `—`}
```

The marker block is regenerated by `bunx fit-wiki refresh` from the
authoritative enumeration in `coordination-protocol.md` § Measurement-
system changes (forward-compatible — current `fit-wiki refresh` only
regenerates `xmr` markers; the `canonical-12` marker is a no-op today
and gets a regenerator in a follow-on spec). The `Redefinition:` slot is
the structural form spec Success #5 requires: every canonical-11 change
item on a headline line names its redefinition file or `—` when none
applies (e.g., an unrelated metric flip). Exactly **twelve** bullets in
the marker block — denominator change 11→12 is encoded in the template.

The 12-row enumeration in the template is the authoritative list; if a
future spec adds a thirteenth metric, that spec's redefinition file
adopts move `canonical-set-addition` (design-b § Migration boundary).
The reviewer should confirm the eleven existing metrics in the template
match the wiki's current canonical-11 set before merge (Risk 4); the
implementor reads `wiki/storyboard-2026-M05.md` in Step 7 and aligns.

**Edit 5b** — add a Redefinition line to the headlines block prose right
above the metric-block code-fence example (currently lines 47–60), so
authors and the `fit-wiki refresh` extension know the link slot exists.

Verify: `rg -n '<!-- canonical-12 -->|Redefinition:' .claude/skills/kata-session/references/storyboard-template.md` returns ≥2 hits;
`grep -c '^- \`' .claude/skills/kata-session/references/storyboard-template.md` shows ≥12 (the enumeration lines).

## Step 6 — team-storyboard.md worked-example refresh

The Q3-obstacle-routing worked example (lines 102–105) currently names
four canonical-11 metrics. Update the prose to reflect the canonical-12
denominator and reference the redefinition path. **Modified:**
`.claude/skills/kata-session/references/team-storyboard.md`.

Change "canonical-11 metric (`prs_actioned`, …)" → "canonical-12 metric
(`prs_actioned`, …)" on line 103; append one sentence after the
existing example: "Right route inferred from the linked redefinition file
when one is present on the canonical-12 change item." No other edits.

Verify: `rg -n 'canonical-12|canonical-11' .claude/skills/kata-session/references/team-storyboard.md` returns one `canonical-12` hit and zero `canonical-11` hits.

## Step 7 — Wiki: storyboard-2026-M05.md enumeration update

Wiki-side change committed through the separate `wiki/` checkout during
the implementation run (Stop hook pushes via `just wiki-push`).
**Modified:** `wiki/storyboard-2026-M05.md`.

Two edits to the May storyboard:

1. Replace the inline "11 canonical metrics" prose under § Target
   Condition with the bulleted enumeration (12 entries, same shape as
   the template marker block).
2. Replace the literal `≥6 of 11` denominator in the Target Condition
   line with `≥6 of 12`.
3. Add `Redefinition: —` to every existing headline bullet (the
   grandfathered implementation does not file one; design § Migration
   boundary). Future canonical-12 change items will carry a
   `wiki/redefinitions/...md` path.

The "canonical-11" string is retained historically only as a corpus
identifier in prose footnotes (design-b § Migration boundary).

Verify (in the wiki checkout): `rg -n 'canonical-12|≥6 of 12' wiki/storyboard-2026-M05.md` returns ≥2 hits; `rg -n '≥6 of 11' wiki/storyboard-2026-M05.md` returns 0 hits.

## Step 8 — Wiki: founding redefinition file + first metric row

Wiki-side companions to the main-repo protocol landing. **Created:**
`wiki/redefinitions/2026-05-12-se-exp-33-sidecar-pre-flight.md`.
**Modified:** `wiki/metrics/kata-release-merge/2026.csv`.

**File contents** (matches design-b § Redefinition shape):

```markdown
---
move: sidecar-pre-flight
affected_metrics:
  - {skill: kata-trace, metric: findings_count}
falsifier_set:
  - sidecar diverges from canonical at verdict horizon
verdict_horizon: 2026-05-19
cohort_readout: 2026-05-26
denominator_effect: sidecar
links:
  obstacle_issue: "#788"
  experiment_issue: "#787"
  pr: null
---

# Redefinition — SE Exp 33 #787 sidecar pre-flight (founding example)

This file is the on-disk worked example that satisfies the detection grep in
[`coordination-protocol.md` § Measurement-system changes](../.claude/agents/references/coordination-protocol.md#measurement-system-changes).
It mirrors the inline example in that section. Spec 860's implementation PR is
explicitly grandfathered (design-b § Migration boundary) and does not file its
own redefinition; the first follow-on spec adopts move `canonical-set-addition`
for net-new canonical metrics.
```

**CSV row** appended to `wiki/metrics/kata-release-merge/2026.csv`
(format `date,metric,value,unit,run,note`):

```
2026-05-12,approvals_recorded_per_run,0,count,1,"started_at=2026-05-12T20:00:00Z;<phase>:approved=0;APPROVED-review=0"
```

Value `0` is the empty first-row case (P1: structural-zero risk applies
only when the producer is missing, design-b § Approval-throughput
metric).

Verify (in the wiki checkout): `ls wiki/redefinitions/` lists the new
file; `rg -n 'approvals_recorded_per_run' wiki/metrics/kata-release-merge/2026.csv` returns ≥1 hit.

## Step 9 — Quality gates

Run from repo root: `bun run check`, `bun run format:fix`, `bun run
test`. The change set is documentation-only on the main-repo side; no
codegen or build steps are involved. Commit any incidental
formatter-driven hunks separately if they appear.

Verify locally before push: `bun run check` exits 0; the implementation
PR title carries the spec id (`feat(kata): measurement-system change
protocol (#860)`).

## Risks

1. **Wiki vs. main-repo PR boundary.** Design-b states "the redefinition
   file ships in the same PR" as the canonical-11 change, but `wiki/` is
   gitignored from the main repo and pushed via a separate checkout
   (`just wiki-push`). The plan resolves this by treating "same PR" as
   "same implementation run": main-repo doc changes ship in the
   spec-860 PR; wiki changes ship via the Stop hook in the same run.
   The grep recipe (design § Detection) runs from inside the wiki
   checkout (it looks for `wiki/redefinitions/` in commits that touch
   `wiki/storyboard-*.md`); for main-repo edges
   (`coordination-protocol.md`, `.claude/skills/*/references/metrics.md`),
   the grep would need to extend to "PRs that touch those paths must
   reference a `wiki/redefinitions/...md` path in the PR body or in a
   sibling wiki commit by SHA." CI mechanisation of the cross-repo
   variant is acknowledged out-of-scope (design § Detection).
2. **`note`-field parsing fragility.** P1 encodes `started_at=<ISO>;…`
   in the long-format CSV's free-form `note` field. A hand-edit that
   omits or reformats the prefix breaks `prev_started_at` discovery and
   silently falls back to "current_started_at − 8h", which can
   double-count events on the boundary. SKILL.md Step 0 documents the
   format; the implementor should add one note-format example to
   `references/metrics.md` to make the contract grep-discoverable.
3. **GitHub timeline API rate limits.** Step 9.5 fans out one
   `gh api .../timeline` call per surveyed open phase PR per run. If
   the open phase-PR set grows past ~30, the run hits secondary rate
   limits during the 03:00/12:00/20:00 windows. Mitigation: the
   producer can short-circuit on PRs whose `updated_at` is older than
   `prev_started_at` (the timeline cannot have window-relevant events
   on a PR that has not been updated since the previous run). The
   short-circuit is not in the plan — a follow-on optimisation when
   the backlog grows.
4. **Canonical-11 list drift.** The 12-bullet enumeration in
   `storyboard-template.md` (Step 5a) must match the wiki's current
   canonical-11 set plus the new metric. The implementor must read
   `wiki/storyboard-2026-M05.md` first and align the eleven inherited
   names; the template lands in the main repo and any subsequent
   correction to the canonical names becomes a doc fix, not a
   redefinition.
5. **Forward-compat marker without a regenerator.** Step 5a adds a
   `<!-- canonical-12 -->` marker block that `bunx fit-wiki refresh`
   does not yet regenerate (only `xmr` markers are wired). The block
   is hand-maintained until a follow-on spec extends the refresher;
   in the interim, drift between the template and a regenerated
   storyboard is possible. The follow-on spec is the natural carrier
   for the regenerator; this plan does not block on it.

## Execution recommendation

Single staff-engineer executor, sequential. Steps 1–6 (main-repo edits)
run in order because Step 2 cites Step 1's anchor, Step 4 cites Step 3's
metric definition, and Step 5 cites Step 1's enumeration source-of-
truth. Steps 7–8 (wiki) run after the main-repo edits because the wiki
diff cites paths the main-repo PR establishes (the
`coordination-protocol.md#measurement-system-changes` anchor). Step 9
closes. No parallelism; no decomposition into parts. Route entirely to
the engineering agent — every edit is a code/doc change with no prose
audience that warrants `technical-writer`.

— Staff Engineer 🛠️
