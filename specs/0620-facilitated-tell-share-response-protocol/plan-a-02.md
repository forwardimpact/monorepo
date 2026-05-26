# Plan 620a, Part 02 — Skill rename `kata-storyboard` → `kata-session`

Spec: [`spec.md`](./spec.md). Design: [`design-a.md`](./design-a.md). Overview:
[`plan-a.md`](./plan-a.md).

## Scope

Directory rename, content redistribution into mode overlays, and mechanical
update of every repository reference to the old name. No code changes — markdown
and YAML only.

## Approach

Rename in place with `git mv` so history follows. Split the existing `SKILL.md`
into a mode-agnostic core and two mode overlays: team storyboard (retains the
artifact + XmR content) and 1-on-1 (adopts the participant-trace adaptation
currently buried in `coaching-protocol.md`). `references/coaching-protocol.md`
is redistributed; the two surviving references (`metrics.md`,
`storyboard-template.md`) stay under `references/` unchanged.

Every skill-name reference outside the skill that names `kata-storyboard`
becomes `kata-session`. Agent-profile `skills:` lists, KATA.md Skills table row,
KATA.md memory prose reference, memory-protocol's named-reader list — all
mechanical substitutions verified by a final `grep -rn kata-storyboard`.

### SC 6 reconciliation

SC 6 reads: "No file under `.claude/`, `.github/`, `KATA.md`, or `website/docs/`
contains the string `kata-storyboard` except in historical spec/design artifacts
under `specs/`." Two identifiers survive the rename because they name **the
workflow file**, not the skill:

- `.github/workflows/kata-storyboard.yml` — filename. Spec § Included says the
  workflow file is edited for "any skill-name references updated; workflow
  behaviour otherwise unchanged." Renaming the workflow file is a behavioural
  change (GitHub Actions keys runs by file path) and is therefore outside spec
  scope. The concurrency group literal `kata-storyboard` (line 15) names the
  workflow, not the skill, and stays.
- `KATA.md` Workflows table row (line 97) — the left column header is "Workflow"
  and the value **kata-storyboard** refers to the `kata-storyboard.yml` workflow
  file. Same reasoning.

The reconciliation is **the spec's own words** — SC 6 targets skill-name
references; these two identifiers are workflow-name identifiers. The final grep
at Step 10 enumerates the expected survivors by file and line so a reviewer can
confirm the exemption at a glance rather than relying on prose inference.

If a reviewer disagrees with this interpretation, the fallback is to rename the
workflow file (`git mv` `.github/workflows/kata-storyboard.yml` →
`kata-session-team.yml`), update the concurrency group, and update KATA.md's
Workflows row. That expansion is out of this plan's scope and would require spec
revision — Part 02 does not execute it.

## Libraries used

None. This part touches only markdown and YAML.

## Blast radius

**Renamed** (1 directory):

- `.claude/skills/kata-storyboard/` → `.claude/skills/kata-session/` (`git mv`,
  preserves history on every file inside)

**Modified** (inside the renamed skill, 3 files):

- `kata-session/SKILL.md` — mode-agnostic core; adopts the new Ask/Answer
  vocabulary; adds a Facilitator Process step about `systemPromptAmend`.
- `kata-session/references/coaching-protocol.md` — deleted after its content is
  redistributed (see Created below).
- `kata-session/references/metrics.md` — unchanged content; moves by virtue of
  the directory rename.
- `kata-session/references/storyboard-template.md` — unchanged content; moves by
  virtue of the directory rename.

**Created** (2 files):

- `kata-session/references/team-storyboard.md` — storyboard artifact
  description, XmR guidance, CSV recording, planning vs. review mode (content
  migrated from today's SKILL.md "Storyboard Artifact" + "Meeting Modes"
  planning/review + coaching-protocol.md team-scoped content).
- `kata-session/references/one-on-one.md` — participant-trace overlay (content
  migrated from today's coaching-protocol.md § 1-on-1 Coaching Adaptation +
  SKILL.md "Meeting Modes" 1-on-1 sub-section).

**Deleted** (1 file):

- `kata-session/references/coaching-protocol.md` — content redistributed into
  `team-storyboard.md` and `one-on-one.md`.

**Modified** (outside the skill, 10 files):

- `.claude/agents/improvement-coach.md` — `skills:` list entry.
- `.claude/agents/product-manager.md` — `skills:` list entry.
- `.claude/agents/release-engineer.md` — `skills:` list entry.
- `.claude/agents/security-engineer.md` — `skills:` list entry.
- `.claude/agents/staff-engineer.md` — `skills:` list entry.
- `.claude/agents/technical-writer.md` — `skills:` list entry.
- `.claude/agents/references/memory-protocol.md` — two references to
  `kata-storyboard` in the Tier 2 named-readers list.
- `KATA.md` — Workflow row (`kata-storyboard` workflow keeps its workflow name
  but the skill reference in the last paragraph of § Metrics updates), Skills
  table row (`kata-storyboard` → `kata-session` with purpose-line rewording to
  reflect mode-agnostic scope), any prose reference.
- `.github/workflows/kata-storyboard.yml` — `concurrency.group: kata-storyboard`
  stays (workflow filename keeps its semantic scope; the rename is
  skill-internal, not workflow-internal). The workflow file is touched only if
  prose references the skill name directly, which a `grep` verifies. Expected:
  zero edits; verified, not assumed.
- `.github/workflows/kata-coaching.yml` — same consideration; the workflow-level
  skill reference (if any) is updated. Content-level rewrite of this workflow's
  `task-text` is Part 03's scope, not Part 02.

**Untouched** (explicit non-scope):

- Historical spec artifacts under `specs/` that mention `kata-storyboard` (spec
  460, etc.) — SC 6 explicitly exempts `specs/`.
- Wiki files under `wiki/` — agent memory is append-only audit record;
  historical mentions stay.

## Step-by-step

### Step 1 — Rename the directory

```bash
git mv .claude/skills/kata-storyboard .claude/skills/kata-session
```

This single move migrates `SKILL.md`, `references/coaching-protocol.md`,
`references/metrics.md`, and `references/storyboard-template.md` in one commit
with preserved history.

**Verify:** `ls .claude/skills/kata-session/` lists the four files;
`.claude/skills/kata-storyboard/` is gone;
`git log --follow .claude/skills/kata-session/SKILL.md` shows the original
history.

### Step 2 — Rewrite `kata-session/SKILL.md`

Transform the renamed SKILL.md from storyboard-centric to mode-agnostic.

**Front-matter** — change `name: kata-storyboard` to `name: kata-session`.
Description rewrite:

```yaml
name: kata-session
description: >
  Toyota Kata coaching protocol for facilitated sessions. Used by the
  improvement coach (facilitator) and by domain agents who participate
  via libeval's Ask/Answer/Announce tools. Same five coaching kata
  questions across team storyboard meetings and 1-on-1 coaching
  sessions; mode-specific guidance lives in references/team-storyboard.md
  and references/one-on-one.md.
```

Note: the skill is not "auto-loaded" on every participant. Libeval stays
domain-agnostic (SC 4). The facilitator reads this skill from its own agent
profile's `skills:` list; participants that need the five-question structure in
context receive it via the participant-side summary passed through
`systemPromptAmend` (see Facilitator Process below).

**Body structure** (target ~150 lines, well under the 192-line L6 budget):

1. `# Kata Session` heading.
2. Short preamble explaining the skill is loaded by both facilitator and
   participants across two modes, with a pointer to mode overlays.
3. `## When to Use` — two bullets: facilitator use (team storyboard or 1-on-1),
   participant use (auto-loaded when coach calls `Ask`).
4. `## Checklists` — the existing `<read_do_checklist>` and two
   `<do_confirm_checklist>` blocks, updated to reference `Ask` / `Answer`
   instead of `Tell` / `Share`. The facilitator's do-confirm loses the "every
   coaching question reached participants via Tell or Share" line and gains
   "every Ask received an Answer or surfaced a `protocol_violation` trace event"
   — the runtime, not the coach, enforces the relay; the coach confirms it
   happened.
5. `## The Five Kata Questions` — concise listing (preserved from
   `coaching-protocol.md`), framed as mode-agnostic prose. Each question gets
   one paragraph. Mode-specific wording (e.g., Q2 wording for 1-on-1 vs. team)
   moves to the overlays.
6. `## Meeting Modes` — one short section with two pointers:
   > For team storyboard meetings, see
   > [`references/team-storyboard.md`](references/team-storyboard.md). For
   > 1-on-1 coaching sessions, see
   > [`references/one-on-one.md`](references/one-on-one.md).
7. `## Facilitator Process` — the existing steps (Detect mode, Read the
   storyboard/select participant overlay, Run XmR, Ask the five questions,
   Update artifacts, Record metrics, Evaluate coaching need, Commit, Conclude)
   reworded around Ask/Answer and made mode-agnostic. **New step** between "Read
   the storyboard/overlay" and "Run XmR":

   > **Propagate participant framing.** Derive a short participant-side summary
   > from the mode overlay (team-storyboard.md or one-on-one.md) — one paragraph
   > that names the mode and the Ask/Answer contract. Pass it as
   > `systemPromptAmend` on each participant's libeval config. libeval treats
   > the string as opaque and appends it to each participant's system prompt
   > before the first `Ask`.

   This step is what SC 7 (c) checks for. The implementer writes the step such
   that a grep for `systemPromptAmend` finds it.

8. `## Participant Protocol` — five steps, generic Ask/Answer wording. Q2
   recording, CSV append, Announce vs. Answer discrimination (participants
   Answer the coach; they Announce if they have team-wide context to share
   unsolicited).
9. `## Memory: what to record` — unchanged in substance; rewrite to reference
   "session" rather than "meeting" where the phrasing was team-scoped.

**Remove** from SKILL.md: the ## Storyboard Artifact section (moves to
team-storyboard.md), the expanded Meeting Modes prose (moves to overlays), any
direct mention of `wiki/storyboard-YYYY-MNN.md` (overlay owns it).

**Verify:** `wc -l .claude/skills/kata-session/SKILL.md` ≤ 192. Content mentions
`Ask` / `Answer` / `Announce`; does not mention `Tell` / `Share`. Front-matter
`name: kata-session`.

### Step 3 — Create `references/team-storyboard.md`

Write the storyboard overlay. Content is migrated from today's `SKILL.md`
(Storyboard Artifact section + Meeting Modes planning/review sub-sections) and
`coaching-protocol.md` (team-scoped wording of Q1–Q5, XmR sparkline direction,
storyboard CSV conventions).

**Target shape** (≤ 128 lines per L7 budget):

1. `# Team Storyboard Overlay` — one-paragraph preamble: when this overlay
   applies (facilitator running `kata-storyboard.yml`; participants joining a
   team meeting).
2. `## Artifact` — `wiki/storyboard-YYYY-MNN.md` structure, the five sections
   (Challenge, Target, Current, Obstacles, Experiments), pointer to
   `storyboard-template.md`. Use the same-directory relative link
   `[storyboard-template.md](storyboard-template.md)` — both files live under
   `kata-session/references/`, so no `../` traversal is needed. Update any
   cross-reference from SKILL.md that previously linked to
   `references/storyboard-template.md` to point at this overlay instead
   (SKILL.md's rewrite in Step 2 already removes the direct link; the overlay
   inherits the obligation).
3. `## Planning vs. Review` — two short paragraphs: first meeting of the month
   creates the storyboard; subsequent meetings update Current Condition, record
   experiment outcomes, and plan the next experiment.
4. `## Question Wording (Team)` — the storyboard-flavoured wording for Q1–Q5,
   moved verbatim from `coaching-protocol.md` (team paragraphs only; the 1-on-1
   adaptation moves to `one-on-one.md`).
5. `## Metrics` — reference to `wiki/metrics/{agent}/{domain}/{YYYY}.csv`
   - pointer to `metrics.md` for suggested coaching-side metrics; authoritative
     XmR protocol reference to `../../kata-metrics/references/xmr.md`.
6. `## Participant-side summary` — a one-paragraph template the facilitator uses
   verbatim when populating `systemPromptAmend`:

   > "You are joining a team storyboard meeting. The coach will Ask you five
   > questions via the orchestration `Ask` tool. Reply to each with `Answer`.
   > Before answering Q2, record your domain metrics to
   > `wiki/metrics/{agent}/{domain}/{YYYY}.csv`; your Answer references the CSV
   > row."

**Verify:** `wc -l .claude/skills/kata-session/references/team-storyboard.md`
≤ 128. Mentions `Ask` / `Answer`; does not mention `Tell` / `Share`.

### Step 4 — Create `references/one-on-one.md`

Write the 1-on-1 coaching overlay. Content migrated from
`coaching-protocol.md § 1-on-1 Coaching Adaptation` plus the 1-on-1 paragraph in
today's Meeting Modes.

**Target shape** (≤ 128 lines):

1. `# 1-on-1 Coaching Overlay` — preamble: applies to `kata-coaching.yml` runs;
   one facilitator, one participant.
2. `## Session Shape` — participant analyzes its own most recent trace via
   `kata-trace`; the five questions scope to that trace.
3. `## Question Wording (1-on-1)` — the five reworded questions from
   `coaching-protocol.md`:
   - Q1: What were you trying to achieve in this run?
   - Q2: What actually happened? (participant runs `kata-trace`)
   - Q3: What obstacles prevented better outcomes?
   - Q4: What will you do differently next run?
   - Q5: When will you see the effect?

4. `## Participant-side summary` — template the facilitator passes as
   `systemPromptAmend`:

   > "You are in a 1-on-1 coaching session. The coach will Ask you five
   > questions via the orchestration `Ask` tool. Reply to each with `Answer`.
   > Under Q2, run `kata-trace` on your most recent workflow trace and include
   > the numeric findings in your Answer."

5. `## Trace access` — a short note that the participant uses `kata-trace`
   against its own agent's trace artifact; the facilitator does not pre-load the
   trace content into the participant's context.

**Verify:** `wc -l .claude/skills/kata-session/references/one-on-one.md` ≤ 128.

### Step 5 — Delete `references/coaching-protocol.md`

With its content redistributed into `team-storyboard.md` and `one-on-one.md`:

```bash
git rm .claude/skills/kata-session/references/coaching-protocol.md
```

**Verify:** `ls .claude/skills/kata-session/references/` lists exactly:
`metrics.md`, `one-on-one.md`, `storyboard-template.md`, `team-storyboard.md`.
Four files.

### Step 6 — Update agent profiles

Six agent profiles reference `kata-storyboard` in their `skills:` lists. Line
numbers drift; anchor the replacement on the exact string instead:

```bash
grep -l "  - kata-storyboard" .claude/agents/*.md
```

The six expected files are `improvement-coach.md`, `product-manager.md`,
`release-engineer.md`, `security-engineer.md`, `staff-engineer.md`,
`technical-writer.md`. For each, replace the single line `  - kata-storyboard`
with `  - kata-session`. No other edits to these profiles.

**Verify:** `grep -rn "kata-storyboard" .claude/agents/` returns zero matches.
`grep -rn "kata-session" .claude/agents/` returns six matches (one per profile).

### Step 7 — Update `memory-protocol.md`

`.claude/agents/references/memory-protocol.md` names `kata-storyboard` in two
places:

- Line 24: Tier 2 trigger condition
- Line 85: Named-readers list

Replace both with `kata-session`. No other edits.

**Verify:**
`grep -n "kata-storyboard" .claude/agents/references/memory-protocol.md` returns
zero matches.
`grep -n "kata-session" .claude/agents/references/memory-protocol.md` returns
two matches.

### Step 8 — Update `KATA.md`

Three references:

- Line 97 (Workflows table): the row reads
  `| **kata-storyboard** | Daily 08:00 | improvement-coach (facilitates 5 agents) |`.
  This row names the **workflow** `kata-storyboard.yml`, not the skill, and
  stays as-is — the workflow file is not renamed. Verify by reading the row
  header: the left column is "Workflow". No edit.
- Line 129 (Skills table):
  `| kata-storyboard | Utility | Toyota Kata coaching protocol for meetings |`
  becomes
  `| kata-session | Utility | Toyota Kata coaching protocol for facilitated sessions |`.
- Line 204 (Shared Memory prose):
  `All agents — both facilitator and participants — load kata-storyboard and kata-metrics.`
  becomes `... load kata-session and kata-metrics.`

**Verify:** `grep -n "kata-storyboard" KATA.md` returns only the Workflows table
row (line 97), which names the workflow file correctly.
`grep -n "kata-session" KATA.md` returns two new matches.
`scripts/check-instructions.mjs` still passes CLAUDE.md ≤ 192-line budget —
KATA.md has no line-count gate, but net change is zero lines.

### Step 9 — Verify workflow files untouched

Run
`grep -n "kata-storyboard" .github/workflows/kata-storyboard.yml .github/workflows/kata-coaching.yml`.
Expected: the only match is the `concurrency.group: kata-storyboard` literal in
`kata-storyboard.yml` (a runtime-level concurrency key that names the workflow
file, not the skill). The coaching workflow's prose-level framing is Part 03's
scope. No edits in Part 02.

**Verify:** `grep -n "kata-storyboard" .github/workflows/kata-storyboard.yml`
returns one match (concurrency group).
`grep -n "kata-storyboard" .github/workflows/kata-coaching.yml` returns zero
matches.

### Step 10 — Final repo-wide grep

The catchall SC 6 check:

```bash
grep -rn "kata-storyboard" \
  .claude/ .github/ KATA.md CLAUDE.md CONTRIBUTING.md website/docs/
```

Expected: exactly one match — `concurrency.group: kata-storyboard` in
`.github/workflows/kata-storyboard.yml` (Step 9). Everything else is
`kata-session`.

If the grep surfaces any other match, fix it before pushing.

**Verify:** match count equals 1 and the single match points at the
workflow-file concurrency group.

## Risks

- **Skill-name drift in wiki.** The wiki has accumulated weekly-log entries that
  mention `kata-storyboard` as a past event. These are audit history, not active
  references, but a future agent reading old logs may copy the name forward.
  Acceptable — the memory-protocol named-reader list (Step 7) is what triggers
  fresh reads; no agent rediscovers the skill from historical log text.
- **Concurrency-group rename risk.** Changing
  `concurrency.group: kata-storyboard` to `kata-session` in
  `kata-storyboard.yml` would break the workflow's own concurrency semantics for
  any currently-running instance. Plan does **not** rename the concurrency group
  — Step 9 makes this explicit and Step 10's single allowed grep match defends
  it.
- **Review panel on split content.** The participant-side summary templates in
  `team-storyboard.md` and `one-on-one.md` are consumed opaquely by libeval. A
  reviewer may suggest domain-specific tuning of the summary text; keep the
  templates short and declarative so `kata-coaching.yml`'s task-text (Part 03)
  can reference the team-storyboard or one-on-one summary by file path without
  tight coupling to line content.

## Verification

- SC 5: `ls .claude/skills/kata-session/` shows `SKILL.md` and
  `references/{team-storyboard,one-on-one}.md` (plus `metrics.md`,
  `storyboard-template.md`); `.claude/skills/kata-storyboard/` does not exist;
  `SKILL.md` front-matter names `kata-session`.
- SC 6: Step 10 grep match count is exactly 1 (the workflow's own
  concurrency-group literal).
- SC 7 (c): Step 2 adds the `systemPromptAmend`-propagation step to SKILL.md's
  Facilitator Process; Steps 3 + 4 provide the summary templates.

## Agent routing

`staff-engineer`. Skill procedure is agent-behavior content, not website
documentation. The rename + content redistribution is mechanical enough that a
single staff-engineer pass covers it; TW is not required.
