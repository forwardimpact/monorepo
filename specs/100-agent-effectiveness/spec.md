# Agent Effectiveness

Pathway generates stage-specific Claude Code agents from discipline x track x
stage combinations. The current template and assembly pipeline produce agents
that are structurally correct but not structurally effective. This spec
identifies 9 structural issues — problems with how information is organized,
layered, and delivered to the agent — independent of the quality of the
underlying curated content.

All examples are from a generated `software_engineering --track=platform` team.

---

## 1. Description frontmatter is a data join, not a description

### What

The `description` frontmatter field concatenates the stage summary, a literal
"agent for", the discipline specialization, the track name, and the first line
of the discipline description into a single run-on value.

### Why it matters

The `description` field is what Claude Code shows when listing available agents
and what it uses to decide which agent to invoke. A concatenated data join
doesn't communicate purpose — it reads as a database dump. The agent name
(`se-platform-code`) already encodes discipline + track + stage. The description
should say what the agent _does_, not repeat what it _is called_.

### Example

```yaml
# Current
description: Code agent for Software Engineering on Platform track. Builds and
  maintains software systems, focusing on code quality, architecture, and
  reliable delivery of business value. In the AI era, emphasizes verification
  and review of AI-generated code.
```

The first sentence restates the agent name. The trailing sentences are identical
across all 6 agents — only the stage word changes. The description should say
what the agent does in your workflow (e.g. "Implements the solution. Writes
code, writes tests, iterates until complete.").

---

## 2. Constraints are a flat merge with no layering

### What

Stage constraints, discipline constraints, and track constraints are
concatenated into a single flat list at the end of the agent profile.

### Why it matters

The agent cannot distinguish between stage-specific boundaries (what it must not
do _in this stage_) and general organizational rules (what it must never do _in
any context_). Stage constraints are the most actionable — they define the
boundaries of the current work. Burying them among general rules dilutes their
signal. The current structure also produces visible duplication when discipline
and track constraints overlap.

### Example

```markdown
## Constraints

- Implement one task at a time, verify before moving on        ← stage
- Write tests alongside implementation                         ← stage
- Track progress with the todo tool                            ← stage
- Committing code without running tests                        ← discipline
- Making changes without understanding the existing codebase   ← discipline
- Over-engineering simple solutions                            ← discipline
- Maintain backward compatibility                              ← track
- Document breaking changes with migration guides              ← track
```

The stage constraints are imperatives ("Implement one task at a time"). The
discipline constraints are bare gerunds ("Committing code without running
tests") — they lack a verb framing like "Avoid" or "Do not". Syntactically
inconsistent within the same list. The specify, code, and review agents all
share the same discipline + track constraints — only the stage entries vary.

---

## 3. All 6 agents load the identical skills array

### What

Every stage agent — specify, plan, onboard, code, review, deploy — lists the
same 5 skills in its `skills:` frontmatter.

### Why it matters

Claude Code loads every listed skill into the agent's context window. Skills
contain 6 stages of checklists each (specify through deploy), but the agent only
uses one stage's checklists. Loading all skills regardless of stage relevance
wastes context on checklists and guidance the agent will never act on. A specify
agent has no use for `sre-practices` code-stage checklists. A review agent
doesn't need `code-quality-review` onboard-stage install scripts.

Each skill is ~185 lines. 5 skills × 185 lines = ~925 lines of skill context
per agent. Each skill has 6 stage sections of ~20 lines each. Only 1 stage
section is relevant. That means ~83% of loaded checklist content is noise.

### Example

```yaml
# se-platform-specify.md
skills:
  - architecture-design
  - code-quality-review
  - cloud-platforms
  - devops-cicd
  - sre-practices

# se-platform-code.md
skills:
  - architecture-design
  - code-quality-review
  - cloud-platforms
  - devops-cicd
  - sre-practices

# se-platform-review.md
skills:
  - architecture-design
  - code-quality-review
  - cloud-platforms
  - devops-cicd
  - sre-practices
```

Identical across all 6 agents. The skill data already contains per-stage
relevance information (the `agent.stages` object) that could filter this.

---

## 4. Required skills section is meta-instructions about skill loading

### What

The "Required skills" section spends 10 lines explaining _how Claude Code loads
skills_ and _how to interpret checklist tags_, followed by the actual skill
table.

### Why it matters

Claude Code auto-injects skill content when skills are listed in frontmatter.
The agent doesn't need to be told how this mechanism works. The
meta-instructions consume context and attention that should go to the skills
themselves. The checklist tag explanation (`<read_then_do_code>`,
`<do_then_confirm_code>`) is useful, but it dominates a section whose purpose is
to list which skills apply and when.

### Example

```markdown
## Required skills

Skills listed in the `skills:` frontmatter are automatically loaded into your
context. Each skill contains stage-specific checklists:

- `<read_then_do_code>` — Read-Then-Do checklist for the
  Code stage. Read and understand these items BEFORE starting work.
  These are prerequisites and context you must absorb first.
- `<do_then_confirm_code>` — Do-Then-Confirm checklist for the
  Code stage. Complete your work, then verify each item. These are
  quality gates to check AFTER implementation.
- `<required_tools>` — Mandatory tools for this skill. You MUST use these
  organizational standards that override general knowledge or personal
  preferences.

| Skill | Use when |
| ----- | -------- |
| Architecture Design | use when defining or reviewing system architecture... |
```

13 lines of meta-instructions before the 5-row table that is the actual content.

---

## 5. Working styles use subsection headings for list-weight content

### What

Each behaviour's working style renders as a `### title` subsection with a
paragraph body under `## Working style`. With 3 behaviours, this creates 3
subsections of 1-2 sentences each.

### Why it matters

The `###` heading level signals structural importance — it creates a navigable
section in the document. But working styles are brief qualitative notes, not
major structural components. The heading hierarchy (`## Working style` →
`### Systemic Analyst` → `### Precise Communicator` → `### Outcome Steward`)
visually inflates 3 short paragraphs into a section that dominates the profile.
A flat list would convey the same information with less structural noise.

### Example

```markdown
## Working style

### Consider the whole system

For every change:
1. Identify upstream and downstream impacts
2. Consider non-functional requirements (performance, security)
3. Document assumptions and trade-offs

### Communicate with clarity

When providing output:
1. Separate blocking issues from suggestions
2. Explain the "why" behind each recommendation
3. Provide concrete examples or alternatives

### Investigate before acting

Before taking action:
1. Confirm your understanding of the goal
2. Identify unknowns that could affect the approach
3. Research unfamiliar areas via subagent if needed
```

3 subsections with numbered lists. This occupies roughly the same vertical space
as the "Required skills" and "Stage transitions" sections, despite carrying less
actionable information. The headings create structural weight that a flat list or
bold-title paragraphs would avoid.

---

## 6. Return format is static and stage-agnostic

### What

Every agent — specify through deploy — renders the same 3-item return format:
(1) Work completed, (2) Checklist status, (3) Recommendation.

### Why it matters

Different stages produce different artifacts. A specify agent should return
specifications and requirements documents. A review agent should return
findings, approval status, and blocking issues. A deploy agent should return
deployment status and monitoring URLs. The generic format tells the agent to
report "what was accomplished" without defining what a successful stage output
looks like. This is also the only section that isn't driven by data — it's
hardcoded in the template.

### Example

```markdown
## Return format

When completing work, provide:

1. **Work completed**: What was accomplished
2. **Checklist status**: Items verified from skill Do-Then-Confirm checklists
3. **Recommendation**: Ready for next stage, or needs more work
```

This identical block appears in `se-platform-specify.md`, `se-platform-code.md`,
`se-platform-review.md`, and all other stage agents. The specify agent and the
deploy agent are told to return the same structure despite producing entirely
different work products.

---

## 7. Stage transitions contain self-referential handoffs

### What

Stage transition blocks include handoffs that loop back to the current stage.
The specify agent renders three transition blocks: two that hand off to Specify
itself ("Refine spec.md", "Create alternative spec.md") and one that hands
forward to Plan. The plan agent similarly has two self-loops plus one forward
handoff.

### Why it matters

Self-referential transitions ("When your work is complete, the next stage is
**Specify**" — while already in the specify agent) are confusing. They look
structurally identical to forward transitions but represent revision cycles. The
agent already has a "continue working in the current stage" clause under each
transition's entry criteria. The self-loops duplicate that intent with more
ambiguity — the agent now has two conflicting ways to express "I'm not done
yet."

### Example

```markdown
# se-platform-specify.md — Stage transitions section

When your work is complete, the next stage is **Specify**.

Refine spec.md with more detail or clarity. Summarize what was completed
in the Specify stage.

When your work is complete, the next stage is **Specify**.

Create an alternative spec.md exploring a different approach. Summarize
what was completed in the Specify stage.

When your work is complete, the next stage is **Plan**.

Create the plan files based on spec.md. Summarize what was completed
in the Specify stage.
```

The first two transitions hand off to the agent's own stage. The same pattern
appears in plan (2 self-loops + 1 forward) and review (1 back to code, 1 back
to plan, 1 forward to deploy). Self-loops should either be omitted or rendered
as a distinct "Revision" section so the agent can distinguish "iterate on my
work" from "pass work to the next stage."

---

## 8. Constraint format is syntactically inconsistent

### What

Stage constraints use imperative verbs ("Implement one task at a time", "Write
tests alongside implementation"). Discipline and track constraints use bare
gerunds without a framing verb ("Committing code without running tests", "Making
changes without understanding the existing codebase").

### Why it matters

The agent receives a flat list where some items are instructions ("do X") and
others are noun phrases ("doing Y") with no verb to indicate whether they mean
"avoid doing Y" or "remember when doing Y." This is a data quality issue at the
source — `agentDiscipline.constraints` and `agentTrack.constraints` use a
different grammatical pattern than `stage.constraints`. The template or assembly
code could normalize the format, or the constraint data should enforce a
consistent pattern.

### Example

```markdown
## Constraints

- Implement one task at a time, verify before moving on   ← imperative ✓
- Write tests alongside implementation                    ← imperative ✓
- Track progress with the todo tool                       ← imperative ✓
- Committing code without running tests                   ← gerund, no verb ✗
- Making changes without understanding the existing codebase  ← gerund, no verb ✗
- Ignoring error handling and edge cases                  ← gerund, no verb ✗
- Over-engineering simple solutions                       ← gerund, no verb ✗
- Maintain backward compatibility                        ← imperative ✓
- Document breaking changes with migration guides         ← imperative ✓
```

The gerund entries need a framing verb ("Avoid committing code without running
tests") to be parseable as constraints rather than topic labels.

---

## 9. No applyTo in agent frontmatter

### What

The generated agent profiles do not use Claude Code's `applyTo` frontmatter
field. No agent is scoped to specific file types or paths.

### Why it matters

Claude Code uses `applyTo` globs to scope when an agent is suggested or
relevant. Stage agents have natural file affinities: a specify agent works on
`specs/**/*.md`, a deploy agent works on CI/CD configs and infrastructure files,
an onboard agent works on environment setup files. Without `applyTo`, Claude Code
cannot use file context to suggest the right agent — the user must always select
manually from a flat list of 6 agents with near-identical descriptions.

The stage data already contains enough information to derive reasonable globs.
Stage handoff checklists reference specific file patterns (`spec.md`,
`00-overview.md`, `01-*.md`, `scripts/install.sh`). These could drive `applyTo`
values in the frontmatter.

### Example

```yaml
# se-platform-specify.md — could scope to spec files
---
name: se-platform-specify
description: ...
applyTo: "specs/**/*.md"
---

# se-platform-deploy.md — could scope to CI/CD and infra
---
name: se-platform-deploy
description: ...
applyTo: "{.github/**,Makefile,Dockerfile,docker-compose*.yml}"
---

# se-platform-onboard.md — could scope to env and config
---
name: se-platform-onboard
description: ...
applyTo: "{.env*,package.json,justfile,docker-compose.dev.yml}"
---
```

Currently none of the 6 agents have `applyTo`. All are equally weighted
regardless of what file the user is working in.
