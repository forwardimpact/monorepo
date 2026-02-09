---
name: improve-skill
description: Review and improve skills in capability files for agent documents. Use when improving toolReferences, implementationReference, and stage checklists.
---

# Improve Skills for Agent Documents

Review and improve skills in a capability file to produce excellent agent skill
documents. Focus on `toolReferences`, `implementationReference`, and stage
`readChecklist`/`confirmChecklist` sections.

## When to Use

- Reviewing skills with `agent:` sections in capability files
- Improving tool references for better agent skill documents
- Restructuring implementation references for clarity
- Improving stage checklists (read-then-do and do-then-confirm)
- Ensuring generated SKILL.md files are useful and complete

## Context

Skills with `agent:` sections generate SKILL.md files using
`apps/pathway/templates/skill.template.md`. The template:

- Renders `toolReferences` as a **Required Tools** table automatically
- Renders `implementationReference` as a **Reference** section

Because the template handles tool rendering separately, the
`implementationReference` must NOT duplicate tool information.

### Data File Locations

Skills live in capability YAML files in **two** locations that must stay in
sync:

- `data/capabilities/{id}.yaml` — Active installation data
- `apps/schema/examples/capabilities/{id}.yaml` — Canonical example data

When a capability exists in both locations, update both files. Check with:

```sh
diff data/capabilities/{id}.yaml apps/schema/examples/capabilities/{id}.yaml
```

## Core Principles

### Outcome-Oriented Instructions

Skills exist to help someone achieve an outcome. The `implementationReference`
should provide **clear step-by-step instructions** that guide the reader from
start to finish—not a scattered collection of code snippets or best practices.

Ask: _"If I follow these instructions, will I achieve the skill's stated
purpose?"_

### Minimal Essential Tooling

Recommend only the **core tools required** to achieve the skill's outcome. A
focused set of 2-4 essential tools is more valuable than an exhaustive list.

Ask: _"Could someone complete this skill without this tool?"_ If yes, omit it.

### Checklist Manifesto Checklists

Stage checklists exist to **prevent critical failures**, not to be exhaustive
task lists. They should cause the agent to pause, reflect, and ask the user
where relevant.

- **readChecklist** (Read-Then-Do): Critical checks to read **before** starting
  the stage. These gate entry — don't start until every item is satisfied.
- **confirmChecklist** (Do-Then-Confirm): Critical checks to verify **before**
  handing off to the next stage. These gate exit — don't proceed until every
  item is confirmed.

Ask: _"If someone skipped this check, what could go wrong?"_ If the answer is
"something critical fails silently," it belongs in the checklist.

## Process

1. **Identify the capability** to review (ask if not specified)
2. **Read the capability file** from both `data/capabilities/{id}.yaml` and
   `apps/schema/examples/capabilities/{id}.yaml`
3. **For each skill with an `agent:` section**, review and improve
4. **Study the updated skill** by running `npx fit-pathway skill <name> --agent`
5. **Iterate** until the skill document is clear, complete, and well-structured
6. **Run validation**: `npx fit-schema validate`

### Tool References Review

Aim for **2-4 essential tools** per skill. Check that `toolReferences`:

- **Include only tools essential** to achieve the skill's core outcome
- Include the primary tool used in `implementationReference` code samples
- Prefer open source tools and libraries over commercial offerings (exceptions:
  ubiquitous platforms like AWS, GitHub, Azure, GCP are fine)
- Have accurate, concise `description` fields
- Have specific `useWhen` guidance relevant to this skill (not generic)
- Include `url` for official documentation where available
- Include `icon` field where appropriate using Simple Icons names (use `task`,
  `python`, `typescript` as generic fallbacks)

**Exclude:**

- Nice-to-have tools that aren't central to the implementation
- Alternative tools (pick one, don't list options)
- Generic utilities (linters, formatters) unless skill-specific
- Tools mentioned only in passing

### Implementation Reference Review

Check that `implementationReference`:

- **Follows a logical sequence** from setup to implementation to verification
- **Does NOT contain** tool tables or "Technology Stack" sections (duplicates
  `toolReferences`)
- **Provides step-by-step guidance** to achieve the skill's purpose
- **Shows complete, working code** (not fragments or pseudocode)
- **Connects the steps** so the reader understands the flow
- **Includes verification** so the reader knows when they've succeeded

### Stage Checklists Review

Each stage (`specify`, `plan`, `onboard`, `code`, `review`, `deploy`) has a
`readChecklist` and `confirmChecklist`. Review all stages for the skill.

#### Writing Effective Checklists

**1. Force pause-and-reflect with ASK items**

Use `ASK the user` prefix for items that require information the agent cannot
infer. This forces the agent to stop and gather critical input before
proceeding.

Good examples by stage:

- **specify**: `ASK the user what business problem this should solve — get a
  concrete problem statement`
- **onboard**: `ASK the user for a valid GITHUB_TOKEN with Models access`
- **onboard**: `ASK the user for database credentials (connection string, API
  key)`

Bad: `Configure API keys` (vague, agent may skip or guess)

**2. Be explicit and verifiable**

Each item should be concrete enough that someone can unambiguously determine
whether it's done. Include specific commands, thresholds, or observable
outcomes.

Good: `python -c "import sklearn, pandas, mlflow"` succeeds
Bad: `ML frameworks installed`

Good: `Train/test gap within acceptable range (< 5%)`
Bad: `No overfitting`

Good: `All credentials stored in .env file and .env is listed in .gitignore`
Bad: `Environment variables configured`

**3. Include quantified thresholds where possible**

Replace vague quality bars with concrete numbers:

- `gap < 5%` instead of "acceptable range"
- `p50 and p95 latency measured` instead of "latency checked"
- `at least 3× model size available for checkpoints` instead of "sufficient
  disk space"
- `similarity scores > 0.7 indicates good relevance` instead of "good
  relevance"

**4. Cover security and credentials explicitly**

Every `onboard` checklist should address credentials:

- readChecklist: `ASK the user for [specific credential]`
- confirmChecklist: `All credentials stored in .env — NEVER hardcoded in code`

**5. Cover domain-specific critical risks**

Each skill has unique failure modes. The checklists must explicitly guard against
them:

| Domain             | Critical Risks to Check                                  |
| ------------------ | -------------------------------------------------------- |
| ML models          | Data leakage, overfitting, bias/fairness, class imbalance|
| RAG systems        | Hallucination, chunk quality, source citation, cost/query|
| Fine-tuning        | Catastrophic forgetting, VRAM limits, licensing, eval loss|
| Observability      | Tracing gaps, missing spans, dashboard verification      |
| Deployment         | Rollback procedures, monitoring, alerting                |

**6. Match checklist items to stage purpose**

- **specify**: Gather requirements from user, define success criteria
- **plan**: Technical decisions, architecture, evaluation methodology
- **onboard**: Environment setup, credentials, tool installation, data access
- **code**: Implementation, testing, experiment tracking
- **review**: Validation against criteria, edge cases, bias checks
- **deploy**: Production readiness, monitoring, rollback, documentation

#### Checklist Anti-Patterns

| Anti-Pattern                    | Fix                                                |
| ------------------------------- | -------------------------------------------------- |
| Vague items ("check quality")   | Be specific ("retrieval precision@5 > 0.8")        |
| Missing user prompts in onboard | Add `ASK the user for` credential/config items     |
| No verification commands        | Add runnable commands that prove success            |
| Duplicating focus text          | Checklists complement focus, don't repeat it       |
| Too few items (< 4)             | Cover all critical failure modes for the stage     |
| Too many items (> 10)           | Keep only items where skipping causes real failure  |
| Generic across skills           | Tailor to the skill's unique domain risks          |
| No security checks              | Add credential storage and .gitignore verification |
| Missing rollback/recovery       | Deploy stage should always cover rollback          |

### Common Problems to Fix (All Sections)

| Problem                 | Fix                                             |
| ----------------------- | ----------------------------------------------- |
| Too many tools          | Keep only 2-4 essential tools for core outcome  |
| Scattered snippets      | Restructure as numbered steps or logical flow   |
| Tool lists in reference | Remove (already in `toolReferences`)            |
| Code without context    | Add prose explaining what each section achieves |
| Missing setup           | Add installation/configuration steps            |
| No verification         | Add "you'll know it works when..." guidance     |
| Generic best practices  | Make specific to achieving the skill's outcome  |
| Vague checklists        | Add ASK items, commands, and thresholds         |
| Missing ASK items       | Onboard and specify stages need user prompts    |
| No credential checks    | Add .env and .gitignore verification            |

### Good Structure Pattern

```markdown
## Setup

[Installation and configuration]

## Step 1: [First action]

[Explanation + code]

## Step 2: [Next action]

[Explanation + code]

## Verification

[How to confirm success]

## Common Pitfalls

[What to watch out for]
```

### Good Checklist Pattern

```yaml
stages:
  onboard:
    focus: |
      Set up the development environment...
    readChecklist:
      - ASK the user for [specific credential or config needed]
      - ASK the user to confirm [prerequisite environment detail]
      - Install [specific packages] — `pip install pkg1 pkg2`
      - Configure [specific tool] with [specific settings]
      - Verify [specific data/service] is accessible
    confirmChecklist:
      - All packages installed — `python -c "import pkg1, pkg2"` succeeds
      - [Service] running — `curl localhost:port` responds
      - [Credential] configured — `tool whoami` succeeds
      - All credentials stored in .env — NEVER hardcoded in code
      - Dependencies pinned in requirements.txt
```

## Output

1. Summarize issues found
2. Apply fixes directly to the capability file (both locations if applicable)
3. Run `npx fit-schema validate` to verify changes
