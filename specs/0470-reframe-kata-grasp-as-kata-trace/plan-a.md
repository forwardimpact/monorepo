# Plan 0470-a — Reframe kata-grasp as kata-trace

## Approach

Rename the skill directory, rewrite the skill identity (frontmatter, title,
opening), update the agent profile routing text, and sweep all cross-references.
The work is small and tightly coupled — every step touches the same rename — so
it executes as a single sequential plan with no decomposition.

Ordering matters only at the git level: the directory must be renamed (`git mv`)
before any file edits reference the new path. All edits after the rename are
independent and can proceed in any order.

## Step 1: Rename the skill directory

```sh
git mv .claude/skills/kata-grasp .claude/skills/kata-trace
```

This moves all contents (`SKILL.md`, `references/`, `scripts/`) to the new path.
No file content changes in this step.

**Files affected:**

| Old path                                                  | New path                                                  |
| --------------------------------------------------------- | --------------------------------------------------------- |
| `.claude/skills/kata-grasp/SKILL.md`                      | `.claude/skills/kata-trace/SKILL.md`                      |
| `.claude/skills/kata-grasp/references/examples.md`        | `.claude/skills/kata-trace/references/examples.md`        |
| `.claude/skills/kata-grasp/references/invariants.md`      | `.claude/skills/kata-trace/references/invariants.md`      |
| `.claude/skills/kata-grasp/references/report-template.md` | `.claude/skills/kata-trace/references/report-template.md` |
| `.claude/skills/kata-grasp/references/run-selection.md`   | `.claude/skills/kata-trace/references/run-selection.md`   |
| `.claude/skills/kata-grasp/scripts/find-runs.sh`          | `.claude/skills/kata-trace/scripts/find-runs.sh`          |
| `.claude/skills/kata-grasp/scripts/trace-queries.sh`      | `.claude/skills/kata-trace/scripts/trace-queries.sh`      |

## Step 2: Rewrite the skill identity

**File:** `.claude/skills/kata-trace/SKILL.md`

### 2a. Frontmatter (lines 1–7)

Replace the entire YAML frontmatter block:

```yaml
# Before
---
name: kata-grasp
description: >
  Grasp the current condition of an agent workflow run. Select a trace, download
  it, observe the work as it actually happened, apply grounded theory analysis,
  and produce a structured findings report — step 2 of the improvement kata.
---

# After
---
name: kata-trace
description: >
  Go and see the work agents did by analyzing their execution traces. Select a
  workflow run, download its trace artifact, observe every turn via grounded
  theory, and produce a structured findings report with instruction-layer
  attribution.
---
```

### 2b. Title (line 9)

```markdown
# Before
# Grasping the Current Condition

# After
# Agent Trace Analysis
```

### 2c. Opening paragraph (lines 11–17)

```markdown
# Before
Grasp the current condition by studying the execution trace of a CI agent
workflow run. Select one run, download its trace, study every turn via grounded
theory, categorize findings, and act on what you find. Depth over breadth. This
skill operates within the Kata system defined in [KATA.md](../../../KATA.md),
whose five-layer instruction model (§ Instruction layering) and checklist design
principles ([CHECKLISTS.md](../../../CHECKLISTS.md)) govern how findings
translate into system improvements.

# After
Go and see the work agents did by analyzing their execution traces. Select one
workflow run, download its trace, study every turn via grounded theory, categorize
findings, and act on what you find. Depth over breadth. This skill operates
within the Kata system defined in [KATA.md](../../../KATA.md), whose five-layer
instruction model (§ Instruction layering) and checklist design principles
([CHECKLISTS.md](../../../CHECKLISTS.md)) govern how findings translate into
system improvements.
```

## Step 3: Update internal self-references

Two files within the renamed skill directory reference `kata-grasp` by name.

### 3a. `references/invariants.md` (line 3)

**File:** `.claude/skills/kata-trace/references/invariants.md`

```markdown
# Before
Named invariants that `kata-grasp`'s invariant audit step checks against an

# After
Named invariants that `kata-trace`'s invariant audit step checks against an
```

### 3b. `references/run-selection.md` (line 9)

**File:** `.claude/skills/kata-trace/references/run-selection.md`

```markdown
# Before
   bash .claude/skills/kata-grasp/scripts/find-runs.sh [lookback]

# After
   bash .claude/skills/kata-trace/scripts/find-runs.sh [lookback]
```

## Step 4: Update improvement-coach agent profile

**File:** `.claude/agents/improvement-coach.md`

Four change sites, all deliberate rewrites (not mechanical find-replace):

### 4a. Skills frontmatter (line 9)

```yaml
# Before
  - kata-grasp

# After
  - kata-trace
```

### 4b. Opening directive (line 15)

```markdown
# Before
You are the improvement coach. Grasp the current condition of agent workflow
runs, identify process failures, and drive improvements into the codebase.

# After
You are the improvement coach. Go and see the work done by agent workflow runs,
identify process failures, and drive improvements into the codebase.
```

### 4c. Assess item 1 (lines 30–32)

```markdown
# Before
1. **Recent workflow traces not yet analyzed?** -- Grasp the current condition
   (`kata-grasp`; check: completed workflow runs since last analysis, using the
   run selection algorithm)

# After
1. **Recent workflow traces not yet analyzed?** -- Go and see the work agents did
   by analyzing their traces (`kata-trace`; check: completed workflow runs since
   last analysis, using the run selection algorithm)
```

### 4d. Assess item 2 (line 33)

```markdown
# Before
2. **Unaddressed findings from prior grasps?** -- Act on findings (check:

# After
2. **Unaddressed findings from prior trace analyses?** -- Act on findings (check:
```

## Step 5: Update KATA.md (deliberate rewrites)

**File:** `KATA.md`

Two sites require deliberate rewrites beyond simple find-replace:

### 5a. Skill table entry (lines 117–118)

```markdown
# Before
- `kata-grasp` — grasp the current condition via trace observation and grounded
  theory

# After
- `kata-trace` — go and see the work agents did via trace analysis and grounded
  theory
```

### 5b. Accountability section (lines 197–201)

```markdown
# Before
Cross-agent accountability runs through the `kata-grasp` skill's invariant
audit. The improvement coach verifies named per-agent invariants against the
actual trace on every grasp cycle — e.g., that the product manager ran a
contributor lookup before marking any non-CI-app PR mergeable. The canonical
invariant list lives in `.claude/skills/kata-grasp/references/invariants.md`.

# After
Cross-agent accountability runs through the `kata-trace` skill's invariant
audit. The improvement coach verifies named per-agent invariants against the
actual trace on every trace analysis cycle — e.g., that the product manager ran
a contributor lookup before marking any non-CI-app PR mergeable. The canonical
invariant list lives in `.claude/skills/kata-trace/references/invariants.md`.
```

## Step 6: Update cross-references (mechanical rename)

All remaining files use `kata-grasp` in contexts where a straight string
replacement to `kata-trace` is correct. Apply `kata-grasp` → `kata-trace`
(including `kata-grasp/` → `kata-trace/` for paths) across each file.

### 6a. `kata-product-classify/SKILL.md` — 4 references

**File:** `.claude/skills/kata-product-classify/SKILL.md`

| Line | Before                                              | After                                               |
| ---- | --------------------------------------------------- | --------------------------------------------------- |
| 19   | `[`kata-grasp`](../kata-grasp/SKILL.md)`            | `[`kata-trace`](../kata-trace/SKILL.md)`            |
| 32   | `the `kata-grasp` invariant audit verifies against` | `the `kata-trace` invariant audit verifies against` |
| 89   | `the `kata-grasp` invariant audit checks that`      | `the `kata-trace` invariant audit checks that`      |
| 165  | `the `kata-grasp` invariant audit checks)`          | `the `kata-trace` invariant audit checks)`          |

### 6b. `kata-gh-cli/SKILL.md` — 4 references

**File:** `.claude/skills/kata-gh-cli/SKILL.md`

| Line | Before                                           | After                                            |
| ---- | ------------------------------------------------ | ------------------------------------------------ |
| 17   | `the `kata-grasp` invariant audit verifies`      | `the `kata-trace` invariant audit verifies`      |
| 49 | `kata-grasp` invariant audit can verify`         | `kata-trace` invariant audit can verify` |  |
| 70 | `kata-grasp` invariant audit verifies this call` | `kata-trace` invariant audit verifies this call` |  |
| 117  | `Used by `kata-grasp` to download traces`        | `Used by `kata-trace` to download traces`        |

### 6c. `kata-gh-cli/references/commands.md` — 1 reference

**File:** `.claude/skills/kata-gh-cli/references/commands.md`

| Line | Before                                    | After                                     |
| ---- | ----------------------------------------- | ----------------------------------------- |
| 6    | `the `kata-grasp` invariant audit verify` | `the `kata-trace` invariant audit verify` |

### 6d. `specs/0450-agent-centered-workflows/spec.md` — 1 reference

**File:** `specs/0450-agent-centered-workflows/spec.md`

| Line | Before                                               | After                                                |
| ---- | ---------------------------------------------------- | ---------------------------------------------------- |
| 169  | `.claude/skills/kata-grasp/references/invariants.md` | `.claude/skills/kata-trace/references/invariants.md` |

### 6e. `specs/0450-agent-centered-workflows/plan-a.md` — 3 references

**File:** `specs/0450-agent-centered-workflows/plan-a.md`

| Line | Before                                               | After                                                |
| ---- | ---------------------------------------------------- | ---------------------------------------------------- |
| 207  | `(`kata-grasp`; check:`                              | `(`kata-trace`; check:`                              |
| 401  | `.claude/skills/kata-grasp/references/invariants.md` | `.claude/skills/kata-trace/references/invariants.md` |
| 456  | `.claude/skills/kata-grasp/references/invariants.md` | `.claude/skills/kata-trace/references/invariants.md` |

### 6f. `wiki/staff-engineer.md` — 1 reference

**File:** `wiki/staff-engineer.md`

| Line | Before                                       | After                                        |
| ---- | -------------------------------------------- | -------------------------------------------- |
| 46   | `` `kata-grasp` trace analysis should see `` | `` `kata-trace` trace analysis should see `` |

## Step 7: Verify

1. `rg kata-grasp` — should return matches **only** in
   `specs/0470-reframe-kata-grasp-as-kata-trace/` (the spec, design, and this
   plan — all three document the rename itself). Zero matches elsewhere.
2. `bun run check` — passes.
3. `bun run test` — passes.
4. Confirm `.claude/skills/kata-trace/` contains all 7 files (SKILL.md, 4
   references, 2 scripts).

## Risks

- **Wiki submodule**: `wiki/staff-engineer.md` lives in a git submodule. The
  implementer must `cd wiki && git add staff-engineer.md && git commit` and then
  update the submodule reference in the parent repo. Forgetting this leaves the
  wiki change uncommitted.
- **Spec 0450 references**: `specs/0450-agent-centered-workflows/plan-a.md`
  quotes the improvement-coach profile text verbatim (line 207). After this
  rename, the quoted text in 450's plan will say `kata-trace` — which is correct
  for the future state but diverges from what 450 originally described. This is
  acceptable because 450 is at `review` status and its plan should reflect the
  current skill name at implementation time.

## Libraries used

No shared libraries are used. This spec is a pure rename and rewrite of
documentation, skill files, and agent profile text.

## Execution

Single `staff-engineer` agent, sequential execution. The change is small (14
files touched, all text edits plus one `git mv`) and tightly coupled — every
step references the same rename. No decomposition or parallelism needed.
