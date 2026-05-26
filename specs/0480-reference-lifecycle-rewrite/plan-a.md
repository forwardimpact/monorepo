# Plan A — Rewrite Reference Lifecycle Page

## Approach

Three files, all documentation Markdown, executed sequentially. The lifecycle
page gets a full rewrite (largest change); the reference index and core model
pages get surgical edits to align language. No code, no schema, no runtime
changes.

**Routing:** `technical-writer` executes all three steps. This is pure
documentation work under `website/docs/` — the technical-writer skill owns this
surface. `staff-engineer` would be over-qualified overhead.

**Why sequential:** The lifecycle page rewrite defines the new vocabulary
("phases" not "stages," "workflow guidance" not "entity definitions"). The index
and model edits adopt that vocabulary — they must follow, not precede, the
rewrite.

## Libraries Used

No shared libraries are consumed. This is a documentation-only change.

## Step 1: Rewrite `website/docs/reference/lifecycle/index.md`

Full rewrite. The current file is 188 lines describing stages as YAML-backed
entities. The replacement describes lifecycle phases as conceptual workflow
guidance.

### Frontmatter

**Before (line 3):**

```yaml
description: Engineering lifecycle stages, handoffs, constraints, and transition checklists.
```

**After:**

```yaml
description: Engineering lifecycle phases — workflow guidance for handoffs, constraints, and checklists.
```

### Overview section (lines 6–10)

**Before:**

```markdown
## Overview

The lifecycle model defines six stages that engineering work moves through, from
specification to deployment. Each stage has defined constraints, handoff
conditions, and checklists that ensure quality transitions.
```

**After:**

```markdown
## Overview

The lifecycle model describes six phases that engineering work moves through,
from specification to deployment. Each phase has handoff triggers, constraints,
and checklists that guide quality transitions.

Phases are conceptual workflow vocabulary — they describe what kind of work is
happening and what discipline applies, not data entities backed by YAML files.
```

### Six Stages → Six Phases section (lines 14–33)

**Mermaid diagram (lines 16–23):** Keep as-is. The node labels (`Specify`,
`Plan`, `Scaffold`, `Code`, `Review`, `Deploy`) are already phase names, not
entity names. No change needed.

**Table (lines 25–33):** Rename column header from `Stage` to `Phase`. Keep all
six rows unchanged — the purpose descriptions are accurate for phases.

**Section heading (line 14):** Change from `## The Six Stages` to
`## The Six Phases`.

### Handoffs section (lines 36–82)

**Section intro (lines 38–39):** Replace:

```markdown
Handoffs are the transitions between stages. Each stage defines named handoffs
that specify where work can flow next.
```

With:

```markdown
Handoffs are the transitions between phases. Each phase defines triggers that
specify where work flows next.
```

**Sub-headings (lines 41, 48, 55, 63, 69, 77):** Rename from `### Specify Stage`
→ `### Specify Phase`, etc. for all six.

**Table contents:** Keep all handoff tables unchanged — the target columns and
trigger descriptions are accurate for phases.

### Constraints section (lines 85–99)

**Section intro (lines 87–89):** Replace:

```markdown
Each stage defines constraints that limit what actions are allowed. Constraints
are especially important for AI agents -- they prevent scope creep and ensure
agents stay within their authorized boundaries.
```

With:

```markdown
Each phase defines constraints that limit what actions are allowed. Constraints
are especially important for AI agents — they prevent scope creep and ensure
agents stay within their authorized boundaries.
```

**Table (lines 91–98):** Rename column header from `Stage` to `Phase`. Keep all
six rows unchanged.

### Checklists section (lines 102–143) — full replacement

**Remove entirely** (lines 102–143). Replace with:

```markdown
## Checklists

Checklists ensure quality at phase transitions. Each skill defines its own
checklist items as flat fields in the agent section of the skill's YAML
definition.

### Two Types

| Type                | When                 | Purpose                       |
| ------------------- | -------------------- | ----------------------------- |
| **Read-Then-Do**    | Before starting work | Prerequisites and preparation |
| **Do-Then-Confirm** | Before handing off   | Verification criteria         |

Read-then-do checklists are entry gates — read each item, then do it. Do-then-
confirm checklists are exit gates — do from memory, then confirm every item
before crossing a boundary.

### How Checklists Are Defined

Skills define checklists as flat fields in their agent section:

- `agent.readChecklist` — items for the read-then-do gate
- `agent.confirmChecklist` — items for the do-then-confirm gate

These fields live directly on each skill, not derived from a stage x skill
matrix. Capability authors write checklist items at each proficiency level; the
agent's derived proficiency determines which items apply.

### Example

Given a practitioner-level CI/CD skill:

**Read-Then-Do (before coding):**

- Review the deployment pipeline configuration
- Understand the test infrastructure
- Check branch protection rules

**Do-Then-Confirm (before requesting review):**

- All new code has test coverage
- Pipeline passes on the feature branch
- Documentation updated for changed interfaces
```

### Stages and Agents section (lines 146–181) — full replacement

**Remove entirely** (lines 146–181), including the multi-agent handoff Mermaid
diagram (lines 158–173) and the `--stage` CLI example (lines 175–181). Replace
with:

```markdown
## Phases and Agents

Agents are generated per discipline and track — one agent per combination, not
one per lifecycle phase. Phases guide an agent's workflow focus: what to
prioritize, what constraints apply, and which checklist items are relevant at
each point in the work.

Generate an agent profile for a discipline and track:

` ``sh
npx fit-pathway agent <discipline> --track=<track> --output=./agents
` ``

The generated profile includes the agent's full skill set, checklist items, and
behavioural expectations. Phases are not an input to agent generation — they
describe the workflow context in which the agent operates.

See [CLI Reference](/docs/reference/cli/) for the full `agent` command.
```

(Note: the backtick-space-backtick in the code fence above is a rendering
escape. The actual file uses standard triple backticks with no spaces.)

### Related Documentation section (lines 185–188)

**Before:**

```markdown
- [Core Model](/docs/reference/model/) -- Entity overview and derivation formula
- [Agent Teams](/docs/guides/agent-teams/) -- Building and using agent teams
```

**After:**

```markdown
- [Core Model](/docs/reference/model/) — Entity overview and derivation formula
- [Agent Teams](/docs/guides/agent-teams/) — Building and using agent teams
```

Change: `--` to `—` (em dash) for consistency with new content. Link targets
unchanged.

### Verification

- `grep -c "stage" website/docs/reference/lifecycle/index.md` returns 0
  (case-insensitive check for `stages.yaml`, `stages.schema.json`, `--stage`,
  "Stage" as column header — none should remain)
- `grep -ci "stage" website/docs/reference/lifecycle/index.md` returns 0
- The word "Scaffold" contains "scaffold" not "stage" — no false positives
- Page renders six phases, handoff tables, constraint table, checklist section,
  and agent section without Mermaid errors

## Step 2: Update `website/docs/reference/index.md`

Two edits: the page frontmatter and the Lifecycle card description.

### Edit 2a: Frontmatter description (line 3)

**Before:**

```yaml
description: Lookup material — CLI commands, entity model, lifecycle stages, and YAML schema format.
```

**After:**

```yaml
description: Lookup material — CLI commands, entity model, lifecycle phases, and YAML schema format.
```

### Edit 2b: Lifecycle card description (lines 32–34)

**Before (lines 32–34):**

```markdown
The engineering lifecycle — specify, plan, scaffold, code, review, deploy — with
handoffs, constraints, and checklists.
```

**After:**

```markdown
Workflow phases — specify, plan, scaffold, code, review, deploy — with handoff
triggers, constraints, and checklists.
```

### Verification

- `grep -ci "stage" website/docs/reference/index.md` returns 0
- Card text and frontmatter match the rewritten page's framing (phases, not
  stages)

## Step 3: Update `website/docs/reference/model/index.md`

Four edits in the same file. All remove stale "stage" references.

### Edit 3a: Capabilities checklist bullet (line 100)

**Before:**

```markdown
- **checklists** -- Stage handoff items per skill proficiency
```

**After:**

```markdown
- **checklists** — Phase transition items per skill proficiency
```

### Edit 3b: Key Capabilities agent row (line 289)

**Before:**

```markdown
| **Agent profiles** | Stage-specific agent instructions for AI assistants      |
```

**After:**

```markdown
| **Agent profiles** | Agent instructions derived from discipline and track     |
```

### Edit 3c: Key Capabilities checklist row (line 291)

**Before:**

```markdown
| **Checklists**     | Stage transition criteria from capability definitions    |
```

**After:**

```markdown
| **Checklists**     | Phase transition criteria from capability definitions    |
```

### Edit 3d: Related Documentation cross-link (line 300)

**Before:**

```markdown
- [Lifecycle](/docs/reference/lifecycle/) -- Stages, handoffs, and checklists
```

**After:**

```markdown
- [Lifecycle](/docs/reference/lifecycle/) — Phases, handoffs, and checklists
```

### Verification

- `grep -ci "stage" website/docs/reference/model/index.md` returns 0
- Cross-link target `/docs/reference/lifecycle/` still resolves after Step 1

## Step 4: Validate

Run `bun run check` to verify no formatting or lint errors across all changed
files.

### Success criteria verification

1. No references to `stages.yaml`, `stages.schema.json`, or `--stage` flag in
   `lifecycle/index.md` — confirmed by case-insensitive grep
2. No broken cross-links from reference index, core model, or agent-teams pages
   — all link targets preserved
3. `bun run check` passes

## Blast Radius

| File                                        | Action                                    |
| ------------------------------------------- | ----------------------------------------- |
| `website/docs/reference/lifecycle/index.md` | Modified (full rewrite)                   |
| `website/docs/reference/index.md`           | Modified (frontmatter + card description) |
| `website/docs/reference/model/index.md`     | Modified (4 line edits)                   |

No files created. No files deleted. No files outside `website/docs/reference/`
touched.

## Risks

1. **Lifecycle page linked from outside scoped files.** The spec lists three
   in-scope files but other pages (authoring-frameworks guide, pathway
   internals, pathway overview) may link to lifecycle content. Mitigation: the
   URL `/docs/reference/lifecycle/` is preserved — only the content changes, not
   the path. External links remain valid.

2. **"Stage" appears in non-lifecycle contexts.** Some pages use "stage" in
   CI/CD pipeline context (e.g., "deploy stage" meaning a CI stage). The grep
   verification in Step 3 is scoped to `model/index.md` only — do not blindly
   remove "stage" from unrelated contexts.

3. **Mermaid rendering.** The phase-flow diagram is preserved from the current
   page. If it rendered before, it renders after. The multi-agent diagram is
   removed, eliminating a rendering dependency.

## Ordering and Dependencies

```
Step 1 (lifecycle rewrite) → Step 2 (index card) → Step 3 (model edits) → Step 4 (validate)
```

Steps 2 and 3 are independent of each other but both depend on Step 1
establishing the vocabulary. Running them after Step 1 in either order is safe.
Step 4 must run last.

## Execution

Single agent: `technical-writer`. Sequential execution, no decomposition needed
— total change is ~150 lines of Markdown across three files. Estimated
implementation: one session.
