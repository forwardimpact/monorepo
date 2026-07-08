---
name: kata-review
description: >
  Grade a single artifact (spec, design, plan, or implementation diff) against
  quality criteria and return findings by severity. Use when another skill
  spawns a fresh sub-agent for an independent review of its work. This skill
  never spawns sub-agents — it produces findings only — which structurally
  prevents the spec/design/plan/implement review loop from recursing.
---

# Review

Independent grading skill for artifacts produced by `kata-spec`, `kata-design`,
`kata-plan`, and `kata-implement`. Returns severity-graded findings; takes no
action. Never spawns sub-agents.

## When to Use

- A `kata-spec`, `kata-design`, `kata-plan`, or `kata-implement` workflow has
  reached its clean sub-agent review step and you have been spawned with no
  prior context to grade the artifact.
- Any time another agent needs an independent quality grade on a spec, design,
  plan, or diff without changing it.

## Invariant: never spawn

This skill's Process has **no step that launches a sub-agent**. That is the
property that prevents the spec / design / plan / implement review loop from
recursing —
if you find yourself wanting to make an `Agent` tool call from inside this
skill, stop and return findings instead.

## Severity Vocabulary

This is the canonical definition of review severity for the spec → design →
plan → implement arc. Grade every finding using exactly one level:

- **Blocker** — The work is broken, dangerous, or materially wrong. Must fix
  before advancing (approving the spec, advancing status, merging code).
- **High** — A correctness or clarity problem that will cause rework, confusion,
  or bugs downstream if shipped. Fix before advancing.
- **Medium** — A real quality or consistency issue worth fixing now while the
  context is fresh. Fix before advancing.
- **Low** — Nit or preference. Optional; document if dismissed.

The caller is required to **verify** every finding against the actual artifact
before acting on it — sub-agent reviewers operate without prior conversation
context and can misread intent, miss surrounding code, or flag false positives.
After verification, the caller must address every confirmed **blocker**,
**high**, and **medium** finding before advancing. **Low** findings are
optional.

## Process

1. **Identify the artifact type.** The caller tells you whether the input is a
   `spec.md`, a `design-a.md`, a `plan-a.md` (plus any decomposed parts), or a
   code diff (`git diff origin/main...HEAD`). You are spawned cold with no
   back-channel to the caller — if the artifact type or path is genuinely
   ambiguous, return a single **Blocker** finding asking for clarification and
   stop. Do not guess.

2. **Build context before grading.** Read in this order:

   a. **The artifact itself.** Read fully before anything else.

   b. **Upstream documents.** For a design, read the spec. For a plan, read the
   spec and design. For a diff, read the spec, design, plan, and
   CONTRIBUTING.md § Core Rules.

   c. **Codebase files the artifact references or modifies.** When the artifact
   names files, functions, classes, or APIs, read those source files. When a
   plan lists files to create or change, read the current versions. Verify
   that the artifact's assumptions about existing code are accurate.

3. **Grade against criteria.** Apply the artifact-specific criteria in the
   section below and any domain-specific review criteria defined by your agent
   profile. For each gap or risk, write one finding with:
   - File path and line number (or commit hash)
   - The criterion violated, in one short phrase
   - Severity per the vocabulary above
   - One-sentence explanation

4. **Return findings only.** Do not modify the artifact, do not open PRs, do not
   invoke other skills, do not spawn sub-agents. Group findings by severity and
   report.

## Artifact Criteria

Grade each artifact against its skill's DO-CONFIRM checklist. The deltas below
are review-specific additions on top of the checklist.

For every artifact except `spec.md`, grade whether the artifact faithfully
represents the constraints and decisions established in the prior phase(s). A
design that satisfies its own checklist but contradicts a spec constraint, a
plan that ignores a design decision, or a diff that silently departs from the
plan are each at minimum a **High** finding. Process Step 2 has you read the
upstream artifacts — use them.

### spec.md

Skill: [`kata-spec`](../kata-spec/SKILL.md). No review-specific deltas.

### design-a.md

Skill: [`kata-design`](../kata-design/SKILL.md). Delta: **over 200 lines is a
Blocker.**

### plan-a.md (and parts)

Skill: [`kata-plan`](../kata-plan/SKILL.md). No review-specific deltas.

### Implementation diff

Match
[`kata-implement` § Final verification](../kata-implement/SKILL.md#step-6-final-verification)
and CONTRIBUTING.md § Core Rules. Look for:

- Diff implements every spec success criterion
- No scope creep (refactors, features, cleanup beyond the plan)
- Atomic, conventional-style commits on the branch
- Plan deviations noted in commit messages where present
- No security regressions (input validation at boundaries, secrets, dangerous
  shell)

You may run the repository's check and test commands yourself to verify the head
commit, or trust the caller's assertion that they pass — the caller's Step 7
already requires green checks before delegating to you. Treat any test or lint
failure you observe as at minimum a **High** finding.

## Output Format

Return findings grouped by severity exactly in this shape:

```text
### Blocker
- <file:line> — <criterion> — <one-sentence reason>
- ...
(or "none")

### High
- ...

### Medium
- ...

### Low
- ...
```

Each finding is one line: `file:line — criterion — one-sentence reason`. No
preamble, no summary, no conclusion. The severity headers are the only prose. Be
honest and specific. Do not invent findings to look thorough. Do not
rubber-stamp.

## What NOT to Do

- **Do not spawn sub-agents.** This skill must remain a leaf in the call graph;
  spawning would re-introduce the recursion this skill exists to prevent.
- **Do not modify the artifact.** Reviewers grade; they do not edit.
- **Do not open PRs, comments, or commits.** Findings are returned to the
  caller, who decides what to act on.
- **Do not invoke `kata-spec`, `kata-design`, `kata-plan`, or
  `kata-implement`.** Their Process steps would spawn another reviewer and loop.
