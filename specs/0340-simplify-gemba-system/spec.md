# Simplify the Gemba System

## Problem

Gemba has grown to **15 skills** and **9 workflows** across five agents
(GEMBA.md:111-140). Trace analysis and direct reading of the skill tree reveal
three places where this breadth is structural cost without structural benefit:

### 1. Trace-study work is fragmented across three skills

The improvement coach's job on every cycle is "study one trace". That one job is
split across three skills that always run together:

- `gemba-walk` (99 lines, `.claude/skills/gemba-walk/SKILL.md`) — the entry
  point. Step 3 hands off to grounded theory; Step 3's "Invariant audit"
  sub-step hands off to trace audit; Step 5 produces "the full grounded theory
  analysis report as defined in the `gemba-grounded-theory-analysis` skill".
- `gemba-grounded-theory-analysis` (137 lines) — the analytical methodology.
  Called only from `gemba-walk` Step 3; its report template is the output of
  `gemba-walk` Step 5.
- `gemba-trace-audit` (153 lines) — per-agent invariant verification against the
  same trace. Called only from `gemba-walk` Step 3's sub-step; its
  accountability invariants are the canonical cross-agent accountability list
  referenced from GEMBA.md § Accountability.

The improvement-coach agent profile (`.claude/agents/improvement-coach.md:9-13`)
lists all three skills and its workflow section (lines 29-35) describes the same
three-step handoff (walk → audit → act). No other agent uses any of the three.
The result is three SKILL.md files that together form one procedure: pick a run,
read the trace, apply grounded theory, check invariants, act on findings. 389
lines (plus two `references/` files and two `scripts/` directories) to say "walk
the trace and act on what you find."

Concrete costs observed from this fragmentation:

- **Token overhead per run.** The improvement coach loads three SKILL.md files
  on every cycle to execute one procedure. Much of the content is navigational
  glue ("use skill X"), not decision logic.
- **Instruction-layering violations.** `gemba-walk` Step 5 says "Produce the
  full grounded theory analysis report as defined in the
  `gemba-grounded-theory-analysis` skill" — the output format of one skill is
  defined in another. `gemba-walk` Step 3 inlines a paragraph explaining what
  trace-audit does, which duplicates the trace-audit skill's own "When to Use"
  section. Both patterns are flagged as "Common violations" in GEMBA.md §
  Authoring Best Practices (lines 338-344).
- **Maintenance drag.** Updating any trace-analysis behaviour (e.g. a new
  invariant, a new phase of coding, a change to the report template) means
  touching two or three files and hoping the references between them stay
  consistent.

### 2. Product-backlog work is fragmented across two skills

The product-manager agent's "PR triage" workflow is similarly split:

- `gemba-product-classify` (157 lines) — decides which PRs are mergeable.
  Produces a classification report listing mergeable PRs.
- `gemba-product-merge` (71 lines) — reads the report and performs the merges.
  Its first sentence: _"This is the Do half of the product backlog workflow —
  `gemba-product-classify` decides which PRs qualify, this skill performs the
  action."_

The merge skill has exactly one caller (`gemba-product-classify`'s output), is
used by exactly one agent (`product-manager`), runs in exactly one workflow
(`product-backlog`), and its entire procedure is: read the report, post the
comment template (which lives in `gemba-product-classify/references/`), run
`gh pr merge`, verify state. 71 lines of SKILL.md and a two-file agent workflow
to execute a four-line loop whose inputs and templates already live in the
sibling skill.

The phase boundary argument ("trust verification cannot be skipped") is real but
enforced by the classification report being the input — not by the skill being a
separate file. Any skill that reads the classification report is already bound
to that boundary. The separation pays in file count without paying in safety.

### 3. The product manager runs two identical workflows

`product-backlog.yml` (53 lines) and `product-feedback.yml` (53 lines) differ
only in:

- The cron schedule (daily 08:13 UTC vs. Mon/Wed/Fri 05:17 UTC)
- The concurrency group name
- The `task-text` input (`"Triage the product backlog."` vs.
  `"Triage product feedback."`)

Every other line — the permissions block, the token generation step, the
checkout, the bootstrap, the agent profile (`product-manager`), the model, the
max-turns budget, the task-amend plumbing — is byte-for-byte identical. The
`product-manager` agent profile (lines 29-49) already routes between PR triage,
issue triage, and product evaluation based on the task prompt: one entry point,
three branches. The workflows are doing no routing of their own; they are two
copies of the same harness pinned to two different trigger schedules.

The Study→Act flow is identical in both cases (triage → fix PR or spec) and both
feed into the same memory file and the same weekly log. Maintaining them as two
files means every workflow-level change (permission tweak, action SHA pin, token
strategy, timeout) has to be applied in both places, and inconsistencies between
them are silent.

## Why this matters

Gemba is a self-maintenance system; complexity in Gemba taxes every run of every
other Gemba agent. The PDSA loop is the _point_, but the loop's value comes from
its discipline, not from the number of skills and workflows implementing it.
Each extra skill adds load-time tokens, handoff friction, and a place for the
agent to get lost between files. Each extra workflow duplicates the harness,
doubles the blast radius of a change, and splits memory continuity across two
scheduled runs that are doing the same job.

The improvement coach has repeatedly observed in traces that agents skip steps
buried deep in long skill documents and lose track of which skill owns which
sub-step when procedures span multiple files. GEMBA.md § Authoring Best
Practices (lines 304-387) was written in response to those findings and
explicitly calls out "task references skills unavailable to agent", "profile
copies skill checklists", and the ~200-line SKILL.md guideline. The three
fragmentations above are structural contradictions of that guidance that predate
the guidance and have not been retrofitted.

Shrinking the surface area also lowers the bar for future contributors — human
or agent — reading the system for the first time. The table at GEMBA.md:152-168
is a load-bearing piece of documentation; every row on it is a row a reader has
to hold in their head before they can reason about the loop.

## Goal

Reduce the Gemba skill count by ~20% and the Gemba workflow count by at least
one, without losing any PDSA phase coverage or accountability invariant, and
without changing the Plan-phase separation between planning and implementation
(see § Out of scope).

Specifically:

- **15 skills → 12 skills** (−3, a 20% reduction)
- **9 workflows → 8 workflows** (−1, an ~11% reduction)

Every merge must preserve the full behaviour of the skills and workflows it
replaces, quoted against the current SKILL.md contents and workflow files.

## Scope

### In scope

The changes below are the full set. Anything not listed here is out of scope.

**Skill merges:**

1. **Absorb `gemba-grounded-theory-analysis` into `gemba-walk`.** The walk skill
   owns the full trace-study procedure end to end — selection, download, coding,
   reporting. Grounded theory becomes the methodology section of the walk skill.
   The two `references/` files (`examples.md`, `report-template.md`) and the
   `scripts/trace-queries.sh` helper become co-located under `gemba-walk/` and
   are invoked by the walk skill directly. The `gemba-grounded-theory-analysis`
   skill directory is removed.

2. **Absorb `gemba-trace-audit` into `gemba-walk`.** The per-agent invariant
   checklist becomes a section of the walk skill (or a co-located
   `references/invariants.md` that the walk skill names by path). The walk skill
   owns both open-ended observation and named-invariant verification on the same
   trace. The `gemba-trace-audit` skill directory is removed. GEMBA.md §
   Accountability currently points at the trace-audit SKILL.md as the canonical
   invariant list; the pointer must be redirected to the new location in one
   edit.

3. **Absorb `gemba-product-merge` into `gemba-product-classify`.** The classify
   skill owns both the decision ("is this PR mergeable?") and the action ("merge
   the PRs marked mergeable"). The merge comment template already lives in
   `gemba-product-classify/references/templates.md` — no relocation needed. The
   `gemba-product-merge` skill directory is removed. The product-manager agent
   profile's PR-triage branch (lines 33-37) is simplified to name one skill
   instead of two.

**Workflow merges:**

4. **Merge `product-backlog.yml` and `product-feedback.yml` into a single
   `product-manager.yml` workflow.** The product-manager agent profile already
   routes between PR triage, issue triage, and product evaluation based on the
   task prompt. The combined workflow uses the union of the two existing cron
   schedules (so the system keeps the same coverage cadence) and dispatches to
   the agent with a task prompt that names the full product-manager
   responsibility ("Triage the product backlog: PRs and open issues."). One
   concurrency group; one permissions block; one place to update the action SHA.

**Follow-on documentation updates (must ship in the same spec):**

- GEMBA.md tables at lines 111-117 (agents × skills), 130-140 (workflows),
  152-168 (skills), 227-239 (merge points).
- GEMBA.md § Accountability (lines 292-301) — redirect the invariant list
  pointer.
- `.claude/agents/improvement-coach.md` frontmatter skills list (lines 9-13) and
  workflow section (lines 29-35).
- `.claude/agents/product-manager.md` frontmatter skills list (lines 9-16) and
  PR-triage workflow step (lines 33-37).
- `.claude/skills/gemba-gh-cli/SKILL.md` (references `gemba-trace-audit` by
  name) and `.claude/skills/gemba-gh-cli/references/commands.md` (one more
  reference) — both must be updated to point at the merged walk skill.
- Any other file that references the three removed skill names or the two
  removed workflow file names. An audit grep must find zero stale references
  before the spec is marked done.

### Out of scope

- **Merging `plan-specs` and `implement-plans`.** Keeping the Plan-phase
  (plan-specs) and Do-phase (implement-plans) workflows separated is an explicit
  requirement of this spec. Any argument for collapsing them — even if
  attractive on token-cost grounds — must be filed as a separate spec and
  debated on its own.
- **Any change to `gemba-product-triage` or the split between issue triage and
  PR triage.** They are distinct skills with distinct decision trees (triage:
  fix/spec/skip on issues; classify: trust/type/CI/merge on PRs) and both
  remain.
- **Any change to the release-engineer pair** (`gemba-release-readiness` and
  `gemba-release-review`). Different cadences, different permission surfaces,
  different audiences; kept separate.
- **Any change to the security-engineer pair** (`gemba-security-update` and
  `gemba-security-audit`). Different permission surfaces (audit is
  `contents: read` only for least-privilege reasons); kept separate.
- **Any change to `gemba-gh-cli`.** It is the shared utility skill; keeping it
  is correct.
- **Any change to agents, agent voices, or PDSA phase assignments.** The
  five-agent, four-phase structure is preserved exactly.
- **Renaming the three surviving target skills.** `gemba-walk`,
  `gemba-product-classify`, and the product-manager workflow file keep their
  current names. Renaming can be filed as a separate cosmetic spec if desired,
  but it is not required by this spec and it would churn every reference in the
  codebase for zero behavioural benefit.
- **Changing the memory layout.** Per-agent summary and weekly log files stay as
  they are. The product-manager workflow merge must not fragment or duplicate
  memory entries — one run, one log entry, same weekly file.
- **Rewriting memory history.** Memory files (`.claude/memory/*.md`) are
  append-only history. References to removed skill names in past dated entries
  are preserved as historical record and not rewritten.

## Behavioural requirements

1. **No phase loses coverage.** After the changes, every PDSA phase (Plan, Do,
   Study, Act) must still have at least one skill that owns it. The improvement
   coach's Study and Act phases must still run through a single skill-driven
   procedure that produces findings and routes them to fix PRs or new specs.

2. **Accountability invariants are preserved verbatim.** Every invariant
   currently listed in `gemba-trace-audit/SKILL.md` (the six per-agent tables at
   lines 49-97) must appear in the merged skill with the same evidence
   description and the same severity. No invariant is dropped, weakened, or
   reworded in a way that changes its meaning. The high-severity product-backlog
   contributor-lookup invariant is the most critical and must survive the merge
   textually.

3. **Fix-or-spec discipline is preserved.** The walk skill after the merge must
   still route trivial findings to fix PRs and structural findings to specs, on
   their own branches, per the existing discipline.

4. **The product-manager workflow covers both previous cadences.** The combined
   cron schedule must trigger at least as often as the union of the two previous
   schedules, so no day that was previously covered by either loses coverage.
   The agent must still handle PR triage, issue triage, and product evaluation
   as routed by task prompt.

5. **Memory continuity.** The product manager's weekly memory file must not be
   fragmented by the workflow merge. A single scheduled run appends a single
   dated section. If a day had separate backlog and feedback runs previously,
   the merged workflow runs once and handles both in one dated section.

6. **No silent reference rot.** After the merge, a grep across the repository
   for the three removed skill names (`gemba-grounded-theory-analysis`,
   `gemba-trace-audit`, `gemba-product-merge`) and the two removed workflow
   filenames (`product-backlog.yml`, `product-feedback.yml`) must return zero
   hits except in historical memory/log files and in this spec.

7. **Skill length guideline.** Each surviving skill after absorption must stay
   within the ~200-line SKILL.md guideline from GEMBA.md § Skill length and
   progressive disclosure (line 349), _or_ the spec accepts an explicit,
   justified exception documented in the plan. Moving content to co-located
   `references/` and `scripts/` directories is the expected way to stay under
   the line.

8. **Published skill packs unaffected.** The three removed skills are all
   `gemba-*` (internal-only). Only `fit-*` skills are synced to
   `forwardimpact/skills` on push to main. No external skill pack changes are
   produced or expected as a result of this spec.

## Success criteria

- `ls .claude/skills/ | grep -c ^gemba-` returns **12** (down from 15).
- `ls .github/workflows/ | grep -E '^(product-|plan-specs|implement-plans|security-|release-|improvement-coach)'`
  returns **8** Gemba workflow files (down from 9).
- The three removed skill directories (`gemba-grounded-theory-analysis`,
  `gemba-trace-audit`, `gemba-product-merge`) no longer exist on disk.
- The two removed workflow files (`product-backlog.yml`, `product-feedback.yml`)
  no longer exist; a single `product-manager.yml` exists in their place.
- `grep -r "gemba-grounded-theory-analysis\|gemba-trace-audit\|gemba-product-merge" --exclude-dir=.claude/memory --exclude-dir=.git --exclude-dir=specs`
  returns zero hits in live system files.
- `grep -r "product-backlog.yml\|product-feedback.yml" --exclude-dir=.claude/memory --exclude-dir=.git --exclude-dir=specs`
  returns zero hits in live system files. Historical spec plans (`specs/0200…`,
  `210…`, `220…`, `280…`) reference the old filenames as history and are not
  rewritten.
- Every invariant in the current `gemba-trace-audit/SKILL.md` per-agent tables
  appears in the merged walk skill (or its `references/invariants.md`) with the
  same evidence description and severity.
- GEMBA.md § Accountability no longer points at
  `.claude/skills/gemba-trace-audit/SKILL.md`; its pointer resolves to the new
  canonical location.
- GEMBA.md tables at lines 111-117, 130-140, and 152-168 match the post-merge
  reality, with skill counts and workflow counts updated in the prose.
- `bun run check` passes on the final branch.
- A manual read of the improvement-coach agent profile and the walk skill
  SKILL.md, end-to-end, describes one coherent procedure (select → download →
  code → audit invariants → act) with no unresolved "use skill X" handoffs
  between files.
- A manual read of the product-manager agent profile's PR-triage branch names
  one skill, not two, and that skill's SKILL.md covers both the decision and the
  action in one readable procedure.

## Open questions

- **Invariant list location.** Should the per-agent invariant tables live inline
  in `gemba-walk/SKILL.md`, or in `gemba-walk/references/invariants.md` that the
  SKILL.md names by path? Inline is simpler but risks pushing the walk skill
  past the 200-line guideline; a reference file is progressive disclosure but
  adds one more file to load. The plan should pick one and justify it against
  the line budget.
- **Merged product-manager workflow schedule.** The two current schedules
  overlap on Mon/Wed/Fri (once backlog at 08:13, once feedback at 05:17). Should
  the merged workflow run daily at a single time, or keep both cadences (daily +
  an extra Mon/Wed/Fri slot) so the Mon/Wed/Fri coverage is not silently
  reduced? The plan should choose and justify against both agent load and API
  rate budget.
- **Name of the merged product-manager workflow file.** `product-manager.yml`
  follows the "one-file-per-agent" pattern already used by
  `improvement-coach.yml`, but it diverges from the current "one-file-per- job"
  pattern used by `release-readiness.yml` and `release-review.yml`. The plan
  should pick one and be consistent, or explicitly accept the inconsistency as a
  pre-existing pattern.
- **Grounded theory content that exists only as references.** The current
  `gemba-grounded-theory-analysis/references/examples.md` and
  `report-template.md` are substantial. The plan should confirm they move under
  `gemba-walk/references/` intact, or spell out any content the plan proposes to
  trim.
- **Concurrency group name.** The merged product-manager workflow can keep the
  `product-backlog` concurrency group name (preserving in-flight run-history
  continuity) or take a new name (`product-manager`). Concurrency-group renames
  can cause in-flight runs to behave unexpectedly. The plan should pick one and
  note any in-flight-run risk.
