# plan-a(1080): Starter discipline + capability coverage

Implementation plan for [spec(1080)](spec.md) per
[design-a](design-a.md). Adds two starter discipline files and grows the
capability catalog to close `validateDisciplineSkillRefs` against substrate's
three-discipline skill set, then regenerates `_index.yaml`.

## Approach

Pure content edits under `products/map/starter/`; no source changes. Two new
discipline files mirror substrate; the capability catalog grows from 2 to 5
files (`delivery` and `reliability` extended in place; `scale`, `business`,
`people` added) covering 15 unique skill IDs. The existing
`bunx fit-map generate-index` regenerates both `_index.yaml`, and
`bunx fit-map validate` plus a substrate readiness sweep close spec
criteria 1–6.

Libraries used: none.

## Constraints (apply to every content step)

| # | Constraint |
| --- | --- |
| C-1 | Exemplar for every new/extended `skills[]` block: `task_completion` in `products/map/starter/capabilities/delivery.yaml`. New blocks carry the same top-level keys (`id`, `name`, `human.description`, `human.proficiencyDescriptions` with all 5 tiers, `markers` for ≥ awareness/foundational/working with both human + agent arrays, full `agent.*`), and prose follows the same tone, depth, and approximate length per tier. |
| C-2 | Exemplar for every new capability file: `delivery.yaml`. New files carry the same top-level keys (`id`, `name`, `emojiIcon`, `ordinalRank`, `description`, `professionalResponsibilities` with all 5 tiers, `managementResponsibilities` with all 5 tiers, `skills`). |
| C-3 | Exemplar for every new discipline file: `products/map/starter/disciplines/software_engineering.yaml`. New files carry the same top-level keys (`specialization`, `roleTitle`, `isProfessional`, `validTracks`, `description`, `coreSkills`, `supportingSkills`, `broadSkills`, optional `behaviourModifiers`, `human.*`, `agent.*`). |
| C-4 | Skill IDs and `validTracks` come verbatim from `data/synthetic/story.dsl:619-635`. |
| C-5 | `agent.name` for each new `skills[]` entry is the skill `id` rendered kebab-case (e.g. `data-integration`). Plan-enforced uniqueness across the capability catalog. |
| C-6 | `ordinalRank` per capability file: existing `delivery=1`, `reliability=2`; new `scale=3`, `business=4`, `people=5`. |
| C-7 | Byte-unchanged regions: `disciplines/software_engineering.yaml`; the `task_completion` and `planning` skill blocks in `delivery.yaml`; the `incident_response` skill block (including its nested `references` sub-key) in `reliability.yaml`. `git diff` shows only additions in Steps 3–4. |

## Steps

### Step 1 — Add `disciplines/data_engineering.yaml`

Author the data-engineering discipline file mirroring substrate.

- **Created**: `products/map/starter/disciplines/data_engineering.yaml`
- **Modified**: —
- **Deleted**: —

Field values (other fields per C-3; descriptive prose implementer-authored):

| Field | Value |
| --- | --- |
| `specialization` | `Data Engineering` |
| `roleTitle` | `Data Engineer` |
| `isProfessional` | `true` |
| `validTracks` | `[null, platform]` |
| `coreSkills` | `[data_integration, data_modeling, performance_optimization]` |
| `supportingSkills` | `[architecture_design, cloud_platforms]` |
| `broadSkills` | `[stakeholder_management, regulatory_compliance]` |
| `behaviourModifiers.systems_thinking` | `1` (design Decision 5) |

Verify:
`node -e "require('yaml').parse(require('fs').readFileSync('products/map/starter/disciplines/data_engineering.yaml','utf-8'))"`
exits 0, and `Object.keys` of the parsed object is a superset of the C-3
required keys.

### Step 2 — Add `disciplines/engineering_management.yaml`

Author the engineering-management discipline file with `isManagement: true`
as the one extension over substrate.

- **Created**: `products/map/starter/disciplines/engineering_management.yaml`
- **Modified**: —
- **Deleted**: —

| Field | Value |
| --- | --- |
| `specialization` | `Engineering Management` |
| `roleTitle` | `Engineering Manager` |
| `isProfessional` | `false` |
| `isManagement` | `true` |
| `validTracks` | `[null]` |
| `coreSkills` | `[stakeholder_management, team_collaboration, mentoring]` |
| `supportingSkills` | `[product_thinking, risk_management]` |
| `broadSkills` | `[architecture_design, incident_management]` |
| `behaviourModifiers` | (omitted, design Decision 5) |

Verify: parses (per Step 1 check); `isManagement: true` present at top level so
`products/map/src/levels.js:167` selects `managementResponsibilities` for
readiness rendering.

### Step 3 — Extend `capabilities/delivery.yaml` with `data_integration`

Append one `skills[]` entry for `data_integration` to the end of the
`skills:` array. `delivery.yaml` ends at line 146 with the last line of the
`planning` block; insert the new block as the next sibling under `skills:`.

- **Created**: —
- **Modified**: `products/map/starter/capabilities/delivery.yaml`
- **Deleted**: —

Block shape per C-1. Semantic focus: building and operating data-movement
pipelines between source systems and downstream consumers (analytics, ML,
application surfaces). `agent.name`: `data-integration` (C-5).

Verify: post-edit `skills[]` contains exactly three `- id:` lines in order
`task_completion`, `planning`, `data_integration`; `git diff
products/map/starter/capabilities/delivery.yaml` shows only additions, no
edits inside the prior two blocks (C-7).

### Step 4 — Extend `capabilities/reliability.yaml` with `incident_management`

Append one `skills[]` entry for `incident_management` after the
`incident_response` block ends (i.e., after the last line of
`incident_response.references`, which is the final array entry of
`incident_response`). The new block is a sibling of `incident_response`
under `skills:`, not a child of `incident_response.references`.

- **Created**: —
- **Modified**: `products/map/starter/capabilities/reliability.yaml`
- **Deleted**: —

Block shape per C-1. Semantic focus: process and coordination across
incidents (rotation design, postmortem culture, severity policy, paging
hygiene) — distinct from `incident_response` which is single-incident
execution. `agent.name`: `incident-management` (C-5). The new block carries
no `references` sub-key.

Verify: post-edit,
`yq '.skills | length' products/map/starter/capabilities/reliability.yaml`
returns `2`, `yq '.skills[].id' …` returns `incident_response` then
`incident_management`, and `yq '.skills[0].references | length' …` returns the
original entry count (`2`) — confirming the `references` array stayed inside
`incident_response` and was not pulled out or duplicated.

### Step 5 — Add `capabilities/scale.yaml`

Author the new `scale` capability with four skills.

- **Created**: `products/map/starter/capabilities/scale.yaml`
- **Modified**: —
- **Deleted**: —

File shape per C-2. Top-level `id: scale`, `name: Scale`, `ordinalRank: 3`
(C-6). Capability semantic focus: building systems that grow with load and
complexity. `skills[]` ids in order: `architecture_design`, `data_modeling`,
`performance_optimization`, `cloud_platforms`. Each block per C-1; `agent.name`
per C-5.

Verify: file parses; `yq '.skills[].id' …` returns the four ids above; `yq
'.ordinalRank' …` returns `3`.

### Step 6 — Add `capabilities/business.yaml`

Author the new `business` capability with four skills.

- **Created**: `products/map/starter/capabilities/business.yaml`
- **Modified**: —
- **Deleted**: —

File shape per C-2. Top-level `id: business`, `name: Business`,
`ordinalRank: 4` (C-6). Capability semantic focus: connecting engineering
work to business outcomes, stakeholders, and regulated environments.
`skills[]` ids: `stakeholder_management`, `product_thinking`,
`regulatory_compliance`, `risk_management`. Each block per C-1; `agent.name`
per C-5.

Verify: file parses; `yq '.skills[].id' …` returns the four ids above; `yq
'.ordinalRank' …` returns `4`.

### Step 7 — Add `capabilities/people.yaml`

Author the new `people` capability with two skills.

- **Created**: `products/map/starter/capabilities/people.yaml`
- **Modified**: —
- **Deleted**: —

File shape per C-2. Top-level `id: people`, `name: People`, `ordinalRank: 5`
(C-6). Capability semantic focus: working effectively with and through other
engineers. `skills[]` ids: `team_collaboration`, `mentoring`. Each block per
C-1; `agent.name` per C-5.

Verify: file parses; `yq '.skills[].id' …` returns the two ids above; `yq
'.ordinalRank' …` returns `5`.

### Step 8 — Regenerate `_index.yaml` files

Run the existing index generator to refresh both indexes.

- **Created**: —
- **Modified**:
  `products/map/starter/disciplines/_index.yaml`,
  `products/map/starter/capabilities/_index.yaml`
- **Deleted**: —

Command:

```sh
bunx fit-map generate-index --data products/map/starter
```

The generator iterates four directories (`behaviours`, `disciplines`,
`tracks`, `capabilities`) per `IndexGenerator.generateAllIndexes`; only
`disciplines/_index.yaml` and `capabilities/_index.yaml` carry diff because
`behaviours/` and `tracks/` indexes are already current.

Verify: for `disciplines/` and `capabilities/`,
`comm -3 <(ls *.yaml | grep -v _index | sed 's/.yaml$//' | sort) <(yq '.files[]' _index.yaml | sort)`
is empty (criterion 5);
`git status products/map/starter/behaviours/_index.yaml products/map/starter/tracks/_index.yaml`
shows no changes.

### Step 9 — Validate

End-to-end closure proof against starter content.

- **Created**: —
- **Modified**: —
- **Deleted**: —

Commands, in order:

1. `bun run check`.
2. `bunx fit-map validate --data products/map/starter`.

Verify: both exit 0 (criteria 2 + 6).

### Step 10 — Substrate readiness sweep

Prove criteria 3 + 4 against the canonical substrate roster.

- **Created**: —
- **Modified**: —
- **Deleted**: —

Prereqs (see Risk 1): `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` set;
substrate stack staged (`bunx fit-map substrate stage` if not already).

Commands:

1. `bunx fit-map substrate roster --format json | tee /tmp/1080-roster.json`
   — JSON shape is `{personas: [...], selection_metadata: {...}}`; iterate
   `.personas[]` whose `level` is in `[J040, J060]` (current starter ladder
   per `products/map/starter/levels.yaml`).
2. For each filtered persona, run
   `bunx fit-landmark readiness --email <persona-email> --target <persona-level>`
   and aggregate stdout+stderr to `/tmp/1080-readiness.log`.
3. Run `bunx fit-landmark health` once (organization-wide; the `health`
   subcommand exposes only `--manager` and `--verbose` per
   `products/landmark/bin/fit-landmark.js:125-134`) and capture output to
   `/tmp/1080-health.log`.

Verify across the captured logs:

- `grep -c 'Unknown discipline "' /tmp/1080-readiness.log` returns `0`
  (criterion 3, exact format from
  `products/landmark/src/commands/readiness.js:86`).
- `grep -E '^Summit growth alignment skipped:.*(discipline|UNKNOWN_DISCIPLINE)' /tmp/1080-health.log`
  is empty (criterion 4, format from `products/landmark/src/lib/summit.js`).
- For each persona, the readiness command exit code is `0` and stdout
  contains a `discipline:` line matching the persona's substrate discipline
  (covers criterion 6 — pre-change resolution preserved for the
  `software_engineering` persona at J040/J060).

Record the per-persona pass/fail in a `## Verification` block in the PR body
with columns
`email | level | discipline | readiness_exit | unknown_discipline_count`.

## Risks

| Row | Risk |
| --- | --- |
| 1 | Step 10 needs a live substrate stack — `bunx fit-map substrate stage` provisions docker containers and seeds the roster, and the runner needs `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` from local env or a teammate's Supabase project. Without these, Steps 1–9 still ship the spec's content guarantees but criteria 3 + 4 evidence has to come from the PR reviewer's environment. |
| 2 | `incident_management` and `incident_response` semantic overlap risks near-duplicate marker / proficiency strings; the validator does not catch this. The disambiguation in Step 4 is the only signal. |

## Execution

Single-agent sequential — Steps 8–10 depend on Steps 1–7. Route to
`staff-engineer` via `kata-implement` on branch
`feat/spec-1080-starter-non-swe-disciplines`. No parts decomposition.

— Staff Engineer 🛠️
