# Plan 1810 — Interim Coverage Evidence for Post-Panel Amendments

Implements [design-a.md](design-a.md) of [spec.md](spec.md).

## Approach

Two coordinated prose edits ship in one implementation PR: a writer-side
convention in `kata-plan` (§ Approval + Step 7) and a fail-closed consumption
clause in `kata-release-merge` Step 6, with a generic interim marker in each.
The gate trigger is disclosure-triggered (design D1); the annotation surface is
a plan-PR comment (D2). All text is generic — no monorepo issue/PR links, no
incident references — so the published-skill genericity invariant holds. The
two-state walkthrough and a genericity/length self-check are recorded on the
implementing PR to satisfy success criteria 3 and 6.

Libraries used: none.

## Step 1: Writer-side convention in `kata-plan`

Intent: require coverage evidence before any STATUS write that follows a
post-panel amendment.

Files modified: `.claude/skills/kata-plan/SKILL.md`.

Add a paragraph at the end of § Approval (after the
`coordination-protocol.md` reference line) and a guard sentence in Step 7
before the existing STATUS-write instruction. Generic prose, no issue links:

> **Coverage when the head moved after the panel.** If any commit lands
> between panel execution and the STATUS write, the row must not silently
> claim head coverage. Before writing the row, do one of: (a) a scoped panel
> re-read of the amendment delta, recorded on the PR; or (b) a dual-SHA
> coverage annotation in a PR comment naming the two states — panel-clean at
> `<sha>` and not-panel-read amendment at `<sha>`. This convention is interim;
> it retires when approval rows carry a commit pin.

In Step 7, prepend one sentence immediately before the current first
sentence ("When the panel passes and the DO-CONFIRM checks are met, edit
`wiki/STATUS.md` …"): "If a commit landed after the panel and before this
write, first satisfy § Approval's coverage rule — (a) a recorded delta re-read
or (b) a dual-SHA PR-comment annotation — then write the row."

Verification: `kata-plan` SKILL.md diff shows (i) the § Approval convention
with both options (a)/(b) and the generic interim marker, and (ii) the Step 7
guard sentence preceding the STATUS-write instruction (criteria 1, 4).

## Step 2: Gate-side fail-closed clause in `kata-release-merge` Step 6

Intent: the gate blocks on disclosed post-panel head movement absent coverage
evidence, and carries the two-state record verbatim when it passes on (b).

Files modified: `.claude/skills/kata-release-merge/SKILL.md`.

Append to Step 6, immediately after the existing prohibitive sentence
(verbatim in the current file: "Timestamp ordering between a STATUS write and
head commits is not coverage evidence; never cite it as such in merge
rationale."):

> When gate-readable evidence on the PR (a panel-coverage annotation, a
> disclosure, or a panel record) shows the head moved beyond the panel-certified
> state, **block** (`awaiting coverage evidence`) unless the PR also carries
> positive coverage evidence: a scoped delta re-read record, or a dual-SHA
> annotation naming the panel-clean SHA and the not-panel-read amendment SHA.
> When passing on a dual-SHA annotation, the merge rationale reproduces both
> SHAs verbatim and never claims head coverage. Absent any such gate-readable
> evidence of post-panel movement, the bare-row pass stands. This rule is
> interim; it retires when approval rows carry a commit pin.

Verification: `kata-release-merge` SKILL.md Step 6 diff shows the positive
block clause keyed to disclosed movement, the verbatim-rationale requirement,
and the generic interim marker (criteria 2, 4); the explicit bare-row residual
sentence is present (criterion 2 zero-evidence default).

## Step 3: Two-state walkthrough + genericity/length self-check on the PR

Intent: satisfy success criteria 3, 5, and 6 with evidence recorded on the
implementing PR.

Files modified: none (PR-comment artifact, posted at PR open).

Record on the PR:

- A two-state walkthrough against the changed skill text for a timeline where
  an amendment lands between panel execution and the STATUS write and is
  disclosed on the PR: (i) gate **blocks** with no coverage evidence; (ii)
  gate **passes** with a delta re-read record; (iii) gate **passes** with a
  dual-SHA annotation, rationale carrying both SHAs (criterion 3).
- A criterion-5 confirmation backed by `git diff origin/main...HEAD`
  inspection: the diff changes no `wiki/STATUS.md` row schema and introduces no
  spec-1790 pinned-head vocabulary (e.g. "pinned head", "approval transfer").

Verification: the walkthrough plus the diff-inspection confirmation appear in
the PR body or a PR comment.

## Step 4: Run repository invariants

Intent: confirm skill-genericity and length caps pass (criterion 6).

Files modified: none.

Run `bun run check` (format, lint, jsdoc, invariants, context — `context`
includes `bunx coaligned instructions` for instruction-length caps). Then
manually confirm no monorepo issue/PR links or incident references remain in
the two changed skill files (`grep -nE '#[0-9]{3,}|forwardimpact/monorepo/(issues|pull)'`
over the two files).

Verification: `bun run check` passes green and the grep over the two changed
skill files returns no incident/issue references in the added lines.

## Risks

- **CI genericity gate is partial**: the audit action catches issue/PR-link
  leakage but not all narrative incident references, so a generic-looking
  phrase that names the realized incident can pass CI and still violate the
  invariant — the implementer cannot rely on green CI alone to confirm
  criterion 4.
- **Step 6 already carries a prohibitive sentence** from an earlier change;
  the new clause is an *append* after it, not a rewrite — an implementer who
  does not read the current Step 6 first may duplicate or contradict it.

## Execution

Single engineering agent, sequential. Steps 1–2 are the substantive prose
edits; Step 3 is PR-artifact authoring; Step 4 is the invariant gate. No
parallelism — all four touch one PR and two adjacent skill files.

— Staff Engineer 🛠️
