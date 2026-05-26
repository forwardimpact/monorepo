# Part 03 — Pathway product + service: remove stage CLI, flags, pages, formatters, web UI, build-packs, gRPC service

## Scope

Remove all stage-related UI, CLI, and generation code from the pathway product
and the pathway gRPC service. After this part, `fit-pathway stage` is an unknown
command, `--stage` and `--all-stages` flags are gone, the web UI has no stage
selector, build-packs generate one agent per discipline/track, and the gRPC
service returns stage-free profiles.

## Changes

### 1. Remove `stage` CLI subcommand

**Delete:** `products/pathway/src/commands/stage.js`

**File:** `products/pathway/bin/fit-pathway.js`

- Remove `import { runStageCommand }` (line 31)
- Remove `stage` from the `COMMANDS` object (line 57)
- Remove stage command definition (line 77)
- Remove `--all-stages` flag from options (line 148)
- Remove `--stage` flag from options (line 134)

### 2. Remove stage page and formatters

**Delete:**

- `products/pathway/src/pages/stage.js`
- `products/pathway/src/formatters/stage/index.js`
- `products/pathway/src/formatters/stage/shared.js`
- `products/pathway/src/formatters/stage/dom.js`
- `products/pathway/src/formatters/stage/` (entire directory)
- `products/pathway/src/css/pages/lifecycle.css` (stage lifecycle flow styles)

**File:** `products/pathway/src/formatters/json-ld.js`

Delete `stageToJsonLd()` (lines 225-242).

### 3. Update agent command — remove stage handling

**File:** `products/pathway/src/commands/agent.js`

**Remove:**

- `import { generateStageAgentProfile }` — replace with
  `import { generateAgentProfile }` from `@forwardimpact/libskill/agent`
- `handleSingleStage()` function (lines 142-192)
- `handleAllStages()` function (lines 198-294) — replaced by simpler handler
- `stageParams` object and its `stages: data.stages` property (lines 370-380)
- The `if (options.stage)` branch (line 396)
- Update module docstring to remove stage references (lines 7-9)

**Add new handler:** `handleAgent()`

```js
async function handleAgent({
  options, data, agentTrack, humanDiscipline, humanTrack,
  agentData, agentDiscipline, skillsWithAgent, level, templateLoader, dataDir,
}) {
  const profile = generateAgentProfile({
    discipline: humanDiscipline,
    track: humanTrack,
    level,
    skills: skillsWithAgent,
    behaviours: data.behaviours,
    agentBehaviours: agentData.behaviours,
    agentDiscipline,
    agentTrack,
  });

  // Validate, generate skills, write output — same structure as handleAllStages
  // but produces a single profile instead of N stage profiles
}
```

The handler generates one profile via `generateAgentProfile`, derives skills,
generates skill markdown (no `stages` parameter), validates, and writes output.
Same flow as current `handleAllStages` minus the `data.stages.map()` loop.

### 4. Update agent-list — remove stage references

**File:** `products/pathway/src/commands/agent-list.js`

In `showAgentSummary()`:

- Remove the "Stages" stat item (lines 68-71)

In `listAgentCombinationsVerbose()`:

- Remove the "Available stages" section (lines 142-147)

### 4a. Update job command — remove stage checklist handling

**File:** `products/pathway/src/commands/job.js`

- Remove `import { deriveChecklist }` (line 31)
- Delete `handleChecklist()` function (lines 233-267) — accepts `stageId`,
  validates against `data.stages`, calls `deriveChecklist({ stageId, ... })`.
  With flat checklists, per-stage checklist rendering is no longer meaningful.
- Remove `stages: data.stages` from the data passed to views (line 395)
- Remove any CLI flag or argument that accepts a stage ID for checklist display

### 4b. Update YAML data loader — remove stages loading

**File:** `products/pathway/src/lib/yaml-loader.js`

- Remove `loadYamlFile(\`\${dataDir}/stages.yaml\`)` (line 259)
- Remove `stages` from the destructuring and returned data object (lines
  252, 279)

Without this change, the loader throws a file-not-found error after
`data/pathway/stages.yaml` is deleted in Part 01.

### 4c. Update agent DOM formatter — remove stage imports

**File:** `products/pathway/src/formatters/agent/dom.js`

- Remove `import { getStageEmoji } from "../stage/shared.js"` (line 12) — this
  import breaks once the `stage/` formatter directory is deleted
- Delete `stageAgentToDOM()` function (line 254+) — formats stage-specific agent
  previews with stage emoji, stage info section, stage constraints
- Remove any other references to stages in the file

### 5. Update agent profile formatter — remove stage fields

**File:** `products/pathway/src/formatters/agent/profile.js`

In `prepareAgentProfileData()`:

- Remove `stageConstraints` processing (line 46-48)
- Remove `stageDescription`, `stageId`, `stageName` fields (lines 90-92)
- Remove `hasStageConstraints` (line 103)
- Remove `returnFormat` processing (lines 55-56, 107-108)
- Remove `stageTransitions` processing (lines 69-74, 109-110)
- Keep `disciplineConstraints`, `trackConstraints` and their processing

### 6. Update agent template

**File:** `products/pathway/templates/agent.template.md`

Remove all stage-specific template sections:

- `{{{stageDescription}}}` line (line 17)
- `{{#hasStageTransitions}}` block (lines 53-71) — stage transitions, entry
  criteria, handoffs
- `{{#hasReturnFormat}}` block (lines 73-82) — return format list
- `{{#hasStageConstraints}}` block (lines 87-91) — stage-specific constraints

Simplify the constraints section to show only discipline and track constraints
(remove the `{{#hasStageConstraints}}` / `{{#hasDisciplineOrTrackConstraints}}`
nesting — just render a flat constraints list).

Keep: frontmatter, title, identity, priority, role context, working styles,
skill index, discipline/track constraints, team instructions.

### 7. Update skill template

**File:** `products/pathway/templates/skill.template.md`

Replace the stages block (lines 48-69):

**Before:**

```mustache
{{#hasStages}}

# Stage checklists
{{#stages}}

## {{stageName}} stage

**Focus:** {{{focus}}}

<read_then_do_{{stageId}}>
...
</read_then_do_{{stageId}}>

<do_then_confirm_{{stageId}}>
...
</do_then_confirm_{{stageId}}>
{{/stages}}
{{/hasStages}}
```

**After:**

```mustache
{{#hasFocus}}

## Focus

{{{focus}}}
{{/hasFocus}}
{{#hasReadChecklist}}

<read_do_checklist goal="Internalize before starting">
{{#readChecklist}}
- [ ] {{{.}}}
{{/readChecklist}}
</read_do_checklist>
{{/hasReadChecklist}}
{{#hasConfirmChecklist}}

<do_confirm_checklist goal="Verify before completing">
{{#confirmChecklist}}
- [ ] {{{.}}}
{{/confirmChecklist}}
</do_confirm_checklist>
{{/hasConfirmChecklist}}
```

Note: checklist tag names change from `read_then_do_*` / `do_then_confirm_*`
(stage-keyed) to standard `read_do_checklist` / `do_confirm_checklist` per
CHECKLISTS.md conventions.

### 8. Remove stage selector from web UI agent builder

**File:** `products/pathway/src/pages/agent-builder.js`

- Remove `import { getStageEmoji }` (line 27)
- Remove `stages` loading from `data.stages` (line 108)
- Remove `stageOptions` array with "All Stages" (lines 171-178)
- Remove stage URL parameter parsing (lines 182-190)
- Remove stage handling in `updatePreview()` (lines 284-299)
- Remove stage selector form control (lines 381-394)
- Remove `ALL_STAGES_VALUE` constant (lines 35-36)

Update `updatePreview()` to generate a single profile directly via
`generateAgentProfile` instead of iterating stages.

**File:** `products/pathway/src/pages/agent-builder-preview.js`

- Remove `createAllStagesPreview()` (lines 148-175)
- Remove `createSingleStagePreview()` (lines 228-255)
- Replace with `createAgentPreview()` that calls `generateAgentProfile` once
- Remove `stages` parameter from `generateSkillMarkdown` calls

### 9. Remove stage references from landing page

**File:** `products/pathway/src/pages/landing.js`

- Remove `import { getStageEmoji }` (line 12)
- Remove `stages` from `data.stages` (line 46)
- Remove `createLifecycleFlow()` function (lines 21-38)
- Remove stages stat card (lines 133-135)
- Remove "Engineering Lifecycle" section (lines 145-157)
- Remove stages quick link card (lines 197-199)

### 10. Update routing

**File:** `products/pathway/src/main.js`

- Remove `/stage` and `/stage/:id` routes (lines 115-116)
- Update agent builder route to remove `:stage` parameter:
  `router.on("/agent/:discipline/:track", renderAgentBuilder)` (line 142)

**File:** `products/pathway/src/lib/cli-command.js`

- Remove `/stage` route mapping (line 26)
- Remove `/stage/:id` route mapping (lines 55-56)
- Update `/agent/discipline/track/stage` to `/agent/discipline/track` (lines
  119-121), remove `--stage` from generated command

### 11. Update application state

**File:** `products/pathway/src/lib/state.js`

Remove `stages: []` from store data shape (line 20).

### 12. Update build-packs

**File:** `products/pathway/src/commands/build-packs.js`

In `derivePackContent()` (lines 171-217):

**Before:**

```js
const profiles = data.stages.map((stage) =>
  generateStageAgentProfile({ ...stageParams, stage }),
);
```

**After:**

```js
const profile = generateAgentProfile({
  discipline: humanDiscipline,
  track: humanTrack,
  level,
  skills: skillsWithAgent,
  behaviours: data.behaviours,
  agentBehaviours: agentData.behaviours,
  agentDiscipline: discipline,
  agentTrack: track,
});
const profiles = [profile];
```

Remove `stages: data.stages` from `stageParams` (line 190). Remove `stages`
parameter from `generateSkillMarkdown` call (line 208).

The rest of the pack pipeline (writePackFiles, archivePack) works unchanged — it
already accepts an array of profiles.

### 13. Update pathway gRPC service

**File:** `services/pathway/index.js`

- Replace `import { generateStageAgentProfile }` with
  `import { generateAgentProfile }` from `@forwardimpact/libskill/agent`
  (line 9)
- Delete `#findStage()` method (lines 76-81)
- In `ListAgentProfiles()` (lines 158-184): remove `stage: null` from entries
  (line 178). The method already builds unique (discipline, track) pairs — it
  simply drops the stage dimension.
- In `DescribeAgentProfile()` (lines 189-229): remove the `stageParams` object,
  the `if (req.stage)` branch (lines 211-221), and the `data.stages.map()` loop
  (lines 223-226). Replace with a single call to `generateAgentProfile()`:

  ```js
  const profile = generateAgentProfile({
    discipline: humanDiscipline,
    track: humanTrack,
    level,
    skills: this.#skillsWithAgent,
    behaviours: data.behaviours,
    agentBehaviours: this.#agentData.behaviours,
    agentDiscipline,
    agentTrack,
  });
  const content = await agentProfileToTurtle({
    discipline: humanDiscipline,
    track: humanTrack,
    profile,
  });
  return { content };
  ```

**File:** `services/pathway/src/serialize.js`

- Remove `import { stageIri }` from `@forwardimpact/map/iri` (line 28)
- Update `agentProfileToTurtle()` and `agentProfileListToTurtle()` to not
  reference stage data. Remove any `stageIri()` calls and stage-related RDF
  quads.

**File:** `services/pathway/proto/pathway.proto`

- Remove `optional string stage = 3` from `ListAgentProfilesRequest` (line 36).
  Mark field 3 as reserved to avoid reuse: `reserved 3;`

**After proto change, run:** `just codegen` to regenerate types and clients.

### 13a. Update pathway service tests

**Files:**

- `services/pathway/test/service.test.js` — remove stage parameters from
  `DescribeAgentProfile` tests, update `ListAgentProfiles` expectations
- `services/pathway/test/serialize.test.js` — remove stage serialization tests,
  update profile serialization to not include stage data

### 14. Update tests

**File:** `products/pathway/test/cli-command.test.js`

Remove stage-related route mapping tests.

Add tests verifying:

- `fit-pathway stage` is not a recognized command
- Agent command produces single profile without `--stage` flag
- Build-packs produces one agent per discipline/track combination

### 15. Remove stage CSS

**File:** `products/pathway/src/css/pages/lifecycle.css`

Already listed for deletion in step 2. Ensure no import references remain.

**File:** `products/pathway/src/css/pages/agent-builder.css`

Remove any stage-selector-specific styles if present.

## Verification

```sh
just codegen                                                   # regenerate after proto change
cd products/pathway && bun test
cd services/pathway && bun test
bunx fit-pathway agent software_engineering --track=platform  # single profile: software-engineer--platform
bunx fit-pathway agent software_engineering                    # single profile: software-engineer
bunx fit-pathway stage                                         # unknown command error
bunx fit-pathway build-packs --output=/tmp/test-packs          # one agent per combo
```

## Blast radius

| Action                   | Files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Delete                   | `src/commands/stage.js`, `src/pages/stage.js`, `src/formatters/stage/` (directory), `src/css/pages/lifecycle.css`                                                                                                                                                                                                                                                                                                                                                                                                    |
| Modify (pathway product) | `bin/fit-pathway.js`, `src/commands/agent.js`, `src/commands/agent-list.js`, `src/commands/build-packs.js`, `src/commands/job.js`, `src/formatters/agent/profile.js`, `src/formatters/agent/dom.js`, `src/formatters/json-ld.js`, `src/pages/agent-builder.js`, `src/pages/agent-builder-preview.js`, `src/pages/landing.js`, `src/main.js`, `src/lib/cli-command.js`, `src/lib/yaml-loader.js`, `src/lib/state.js`, `src/css/pages/agent-builder.css`, `templates/agent.template.md`, `templates/skill.template.md` |
| Modify (pathway service) | `services/pathway/index.js`, `services/pathway/src/serialize.js`, `services/pathway/proto/pathway.proto`                                                                                                                                                                                                                                                                                                                                                                                                             |
| Modify (tests)           | `products/pathway/test/cli-command.test.js`, `services/pathway/test/service.test.js`, `services/pathway/test/serialize.test.js`                                                                                                                                                                                                                                                                                                                                                                                      |
| Regenerate               | `just codegen` (after proto change)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
