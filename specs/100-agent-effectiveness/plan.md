# Agent Effectiveness — Plan

Address the 9 structural issues from `spec.md` with minimal schema and data
changes. Prioritise changes that fix multiple issues at once.

---

## 1. Add `summary` to stages data

**Fixes:** Issue 1 (description is a data join)

The `buildAgentDescription()` function already uses `stage.summary` with a
fallback to `stage.name`. The schema already supports `summary`. The field is
simply missing from `data/pathway/stages.yaml`.

### Data change — `data/pathway/stages.yaml`

Add a `summary` field to each stage. This is a third-person, one-line statement
of what the agent does — used in frontmatter `description` and agent listings.

```yaml
- id: specify
  name: Specify
  summary: Defines requirements, writes user stories, and establishes acceptance criteria
  # ...

- id: plan
  name: Plan
  summary: Designs architecture, makes technology choices, and decomposes work into plan files
  # ...

- id: code
  name: Code
  summary: Implements the solution with tests, iterating until complete
  # ...
```

### Schema change

None — `summary` is already in `stages.schema.json`.

### Code change

None — `buildAgentDescription()` already reads `stage.summary`.

**Note:** `buildAgentDescription()` still appends `discipline.description` after
the summary. This is intentional for now — it provides discipline context in
listings. If the result is still too long after adding `summary`, truncate or
drop the discipline suffix in a follow-up.

---

## 2. Layer constraints by source

**Fixes:** Issue 2 (flat merge), Issue 8 (syntactic inconsistency)

### Template change — `products/pathway/templates/agent.template.md`

Replace the single flat `## Constraints` section with layered subsections. Stage
constraints come first (most actionable), followed by discipline and track.

```mustache
{{#hasConstraints}}
## Constraints

{{#hasStageConstraints}}
{{#stageConstraints}}
- {{{.}}}
{{/stageConstraints}}
{{/hasStageConstraints}}
{{#hasDisciplineOrTrackConstraints}}

**General:**
{{#disciplineConstraints}}
- {{{.}}}
{{/disciplineConstraints}}
{{#trackConstraints}}
- {{{.}}}
{{/trackConstraints}}
{{/hasDisciplineOrTrackConstraints}}
{{/hasConstraints}}
```

Guard the stage block with `hasStageConstraints` so an empty stage section
doesn't render when only discipline/track constraints exist.

### Code change — `libraries/libskill/agent.js`

In `buildStageProfileBodyData()`, expose constraints as three separate arrays
(`stageConstraints`, `disciplineConstraints`, `trackConstraints`) instead of a
single merged `constraints` array. Add `hasStageConstraints` and
`hasDisciplineOrTrackConstraints` booleans.

### Data change — discipline/track `agent.constraints`

Normalise all constraint strings to imperative form ("Do not commit code without
running tests"). No template-level grammar transforms — every constraint is a
complete sentence that renders as-is. This avoids encoding an invisible grammar
contract into the data.

Example change in `data/pathway/disciplines/software_engineering.yaml`:

```yaml
agent:
  constraints:
    - Do not commit code without running tests
    - Do not make changes without understanding the existing codebase
    - Do not ignore error handling and edge cases
    - Do not over-engineer simple solutions
```

Track constraints are already imperative and need no change.

---

## 3. Curate skill stage coverage, then filter by stage

**Fixes:** Issue 3 (identical skills array across all 6 agents)

Skills have `agent.stages` keyed by stage ID. The schema already allows partial
coverage — not all 6 keys are required. However, every skill currently defines
all 6 stages, so filtering `skills:` by `agent.stages[stageId]` today produces
identical skill sets (confirmed by data analysis: 24/24 agent-eligible skills
define all 6 stages, yielding 1 unique set across all agents).

The fix has two parts: curate the data, then filter in code.

### Data change — `data/pathway/capabilities/*.yaml`

Remove `agent.stages` entries for stages where the skill is not meaningfully
relevant. Use these criteria:

| Stage    | Skill belongs here when...                          |
| -------- | --------------------------------------------------- |
| specify  | It informs what to build or constrains requirements |
| plan     | It drives architecture or design decisions          |
| scaffold | It requires tooling, dependencies, or env setup     |
| code     | It is directly exercised during implementation      |
| review   | It has quality criteria to verify                   |
| deploy   | It has production or operational concerns           |

Example — `problem_discovery` keeps only specify + plan:

```yaml
agent:
  name: problem-discovery
  stages:
    specify:
      focus: ...
      readChecklist: [...]
      confirmChecklist: [...]
    plan:
      focus: ...
      readChecklist: [...]
      confirmChecklist: [...]
    # scaffold, code, review, deploy — removed
```

Example — `devops` keeps scaffold + code + deploy:

```yaml
agent:
  name: devops-cicd
  stages:
    scaffold:
      focus: ...
    code:
      focus: ...
    deploy:
      focus: ...
    # specify, plan, review — removed
```

This also shortens SKILL.md files — fewer stage sections are rendered.

Each stage entry that IS present must still have `focus`, `readChecklist`, and
`confirmChecklist` — the schema requires all three per stage key.

**Downstream consumers:** `checklist.js` already skips missing stages
(`if (!stageData) continue`). `validation.js` iterates only present entries. No
code changes needed for either. The `libsyntheticprose` capability prompt tells
the LLM to generate all 6 stages — update the prompt to say "generate only the
stages where this skill is meaningfully relevant."

### Code change — `libraries/libskill/agent.js`

In `buildStageProfileBodyData()`, filter `skillIndex` to only include skills
whose underlying data has an `agent.stages[stageId]` entry. This filters the
`skillDirnames` array that becomes the frontmatter `skills:` list.

```js
const skillIndex = derivedSkills
  .map(derived => {
    const skill = skills.find(s => s.id === derived.skillId);
    if (!skill?.agent) return null;
    if (!skill.agent.stages?.[stage.id]) return null;  // ← new filter
    return { name, dirname, useWhen };
  })
  .filter(Boolean);
```

### Schema change

None — `capability.schema.json` already defines `agent.stages` as an object with
optional stage keys.

### Validation

After curation, verify every stage agent still loads at least 2 skills. Add a
check to the agent generation code that warns if a stage × discipline × track
combination produces fewer than 2 skills.

---

## 4. Remove meta-instructions from the template

**Fixes:** Issue 4 (meta-instructions about skill loading)

### Template change — `products/pathway/templates/agent.template.md`

Remove the 10-line block that explains how Claude Code loads skills and how to
interpret checklist tags. Keep only the skill table and the `<required_tools>` /
install script references.

Replace with the skill table plus a conditional scaffold block:

```mustache
{{#hasSkills}}

## Required skills

| Skill | Use when |
| ----- | -------- |
{{#skillIndex}}
| {{{name}}} | {{{useWhen}}} |
{{/skillIndex}}
{{#isOnboard}}

For each skill, run `bash .claude/skills/<skill-name>/scripts/install.sh`
BEFORE any manual setup. Consult `references/REFERENCE.md` for implementation
patterns.
{{/isOnboard}}
{{/hasSkills}}
```

The checklist tag names (`<read_then_do_code>`, `<do_then_confirm_code>`) are
self-explanatory inside the skill files. The agent doesn't need an explanation
of the mechanism. The scaffold install guidance is kept because it's actionable.

---

## 5. Flatten working styles to a list

**Fixes:** Issue 5 (subsection headings for list-weight content)

### Template change — `products/pathway/templates/agent.template.md`

Replace `### {title}` subsections with bold-title paragraphs separated by blank
lines:

```mustache
{{#hasWorkingStyles}}

## Working style

{{#workingStyles}}
**{{title}}**

{{{content}}}

{{/workingStyles}}
{{/hasWorkingStyles}}
```

The title and content are on separate lines so multi-line content (numbered
lists) renders correctly without a run-on first line.

### Schema/data change

None.

---

## 6. Add `returnFormat` to stages schema and data

**Fixes:** Issue 6 (static, stage-agnostic return format)

### Schema change — `products/map/schema/json/stages.schema.json`

Add a `returnFormat` property to the stage definition as a simple string array:

```json
"returnFormat": {
  "type": "array",
  "description": "Expected outputs when completing this stage",
  "items": { "type": "string" }
}
```

A `string[]` is sufficient — neither label nor description is used independently
anywhere. Keeps the schema minimal.

### Data change — `data/pathway/stages.yaml`

Add `returnFormat` to each stage with stage-appropriate outputs:

```yaml
- id: specify
  returnFormat:
    - "Specification: spec.md with user stories, acceptance criteria, and scope"
    - "Open questions: unresolved items that need stakeholder input"
    - "Recommendation: ready for planning, or needs more discovery"

- id: code
  returnFormat:
    - "Implementation summary: files changed, features completed, tests added"
    - "Checklist status: items verified from skill Do-Then-Confirm checklists"
    - "Recommendation: ready for review, or needs more work"
```

### Template change — `products/pathway/templates/agent.template.md`

Replace the hardcoded return format block with a data-driven section:

```mustache
{{#hasReturnFormat}}

## Return format

When completing work, provide:

{{#returnFormat}}
1. {{{.}}}
{{/returnFormat}}
{{/hasReturnFormat}}
```

### Code change

Pass `stage.returnFormat` through `buildStageProfileBodyData()` and
`prepareAgentProfileData()` in the formatter.

---

## 7. Filter self-referential handoffs

**Fixes:** Issue 7 (self-referential stage transitions)

### Code change — `libraries/libskill/agent.js`

In `deriveStageTransitions()`, skip handoffs where
`handoff.targetStage === stage.id`. Self-loops are revision cycles, not forward
transitions. The agent already has "continue working in the current stage" text
in the entry criteria block.

### Schema/data change

None — the handoff data stays as-is (self-referential handoffs are useful for
the web UI button labels). Only the agent template rendering filters them out.

Backward transitions (e.g. review→code, review→plan) are intentionally preserved
— they're legitimate handoffs, not self-loops.

---

## 8. (Covered by Issue 2)

Syntactic inconsistency in constraints is resolved by the layered constraint
approach in change 2 — all constraints are normalised to imperative form in the
data, and the template renders them as-is in separate groups.

---

## 9. Skip `applyTo` for now

**Rationale:** Adding `applyTo` requires either new schema fields on stages or a
heuristic in the derivation code that maps stages to glob patterns. Both add
maintenance burden for uncertain value — glob patterns are highly
installation-specific and the stage data shouldn't encode project layout
assumptions. This can be revisited after the other 8 issues are resolved and
evaluated.

---

## Summary of changes

| Location                                                    | Type     | Changes                                                                                        |
| ----------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------- |
| `data/pathway/stages.yaml`                                  | Data     | Add `summary`, add `returnFormat` per stage                                                    |
| `data/pathway/capabilities/*.yaml`                          | Data     | Curate `agent.stages` — remove stages where the skill is not relevant                          |
| `data/pathway/disciplines/*.yaml`                           | Data     | Normalise `agent.constraints` to imperative form                                               |
| `libraries/libsyntheticprose/prompts/pathway/capability.js` | Code     | Update prompt to generate only relevant stages                                                 |
| `products/map/schema/json/stages.schema.json`               | Schema   | Add `returnFormat` property (string array)                                                     |
| `products/pathway/templates/agent.template.md`              | Template | Layer constraints, flatten working styles, data-driven return format, remove meta-instructions |
| `libraries/libskill/agent.js`                               | Code     | Separate constraint arrays, filter self-handoffs, filter skills by stage, min-skill warning    |
| `products/pathway/src/formatters/agent/profile.js`          | Code     | Pass through new fields (`returnFormat`, separated constraints)                                |

### Execution order

1. Schema: add `returnFormat` to `stages.schema.json`
2. Data: add `summary` and `returnFormat` to `stages.yaml`
3. Data: normalise discipline constraint strings
4. Data: curate `agent.stages` in capabilities — remove irrelevant stage entries
5. Code: update `libsyntheticprose` capability prompt for partial stages
6. Code: separate constraints, filter self-handoffs, filter skills by stage
7. Template: all template changes
8. Formatter: pass through new fields
9. Validate: `npx fit-map validate` and `npm test`

### Verification

After all changes, regenerate the SE platform agents and diff against the
current output in `tmp/agents/`:

```sh
npx fit-pathway agent software_engineering --track=platform --output=tmp/agents-new
diff -r tmp/agents/.claude tmp/agents-new/.claude
```

Confirm:

- Each stage agent has a distinct `skills:` list
- Constraints are layered (stage first, then general)
- No self-referential stage transitions
- Return format varies per stage
- No meta-instructions in the Required skills section
