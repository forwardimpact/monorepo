# Plan: Track-level `teamInstructions` for Agent Teams

## Approach

The change flows through the standard data pipeline: schema → data → derivation
→ formatter. Each layer touches one or two files. The schema accepts the new
field, the derivation passes it through with variable substitution, and the
formatter writes it to disk or includes it in the ZIP.

All changes are additive — no existing behaviour is modified. When
`teamInstructions` is absent, every code path skips the new logic.

## Changes

### 1. JSON Schema — add `teamInstructions` to `trackAgentSection`

**File:** `products/map/schema/json/track.schema.json`

In the `trackAgentSection` definition, add `teamInstructions` after
`constraints`:

```json
"teamInstructions": {
  "type": "string",
  "description": "Shared instructions included in the team-level instructions file (e.g. CLAUDE.md). Provides cross-cutting context, conventions, and coordination rules that apply to all agents and skills in this track's exported team."
}
```

No other schema properties or rules change. `additionalProperties: false` is
already set, so this addition is required for the field to validate.

### 2. RDF/SHACL Schema — add `fit:teamInstructions` property and shape

**File:** `products/map/schema/rdf/track.ttl`

Add the property declaration in the Properties section:

```turtle
fit:teamInstructions a rdf:Property ;
    rdfs:label "teamInstructions"@en ;
    rdfs:comment "Shared instructions for the team-level instructions file"@en ;
    rdfs:domain fit:TrackAgentSection ;
    rdfs:range xsd:string .
```

Add the SHACL constraint to `TrackAgentSectionShape`:

```turtle
sh:property [
    sh:path fit:teamInstructions ;
    sh:datatype xsd:string ;
    sh:maxCount 1 ;
    sh:name "teamInstructions" ;
    sh:description "Shared instructions included in the team-level instructions file" ;
] ;
```

### 3. Agent derivation — pass `teamInstructions` through with interpolation

**File:** `libraries/libskill/agent.js`

In `buildStageProfileBodyData()` (~line 500), after the existing priority
interpolation, add:

```js
// Build teamInstructions - from track agent section (optional)
const rawTeamInstructions = agentTrack.teamInstructions;
const teamInstructions = rawTeamInstructions
  ? substituteTemplateVars(rawTeamInstructions, humanDiscipline)
  : null;
```

Include `teamInstructions` in the returned object.

In `generateStageAgentProfile()` (~line 633), the `teamInstructions` value flows
automatically because `buildStageProfileBodyData` returns it and
`generateStageAgentProfile` passes the body data through unchanged.

Export a new helper function for the CLI to use directly:

```js
/**
 * Interpolate teamInstructions from a track's agent section
 * @param {Object} agentTrack - Agent track definition
 * @param {Object} humanDiscipline - Human discipline (with roleTitle, specialization)
 * @returns {string|null} Interpolated team instructions or null
 */
export function interpolateTeamInstructions(agentTrack, humanDiscipline) {
  if (!agentTrack?.teamInstructions) return null;
  return substituteTemplateVars(agentTrack.teamInstructions, humanDiscipline);
}
```

### 4. CLI export — write `.claude/CLAUDE.md`

**File:** `products/pathway/src/commands/agent.js`

Add a new `writeTeamInstructions` function alongside the existing
`writeProfile`, `writeSkills`, and `generateClaudeCodeSettings`:

```js
/**
 * Write team instructions to CLAUDE.md
 * @param {string|null} teamInstructions - Interpolated team instructions content
 * @param {string} baseDir - Base output directory
 * @returns {string|null} Path written, or null if skipped
 */
async function writeTeamInstructions(teamInstructions, baseDir) {
  if (!teamInstructions) return null;
  const filePath = join(baseDir, ".claude", "CLAUDE.md");
  await ensureDir(filePath);
  await writeFile(filePath, teamInstructions.trim() + "\n", "utf-8");
  console.log(formatSuccess(`Created: ${filePath}`));
  return filePath;
}
```

Call it in two places in `runAgentCommand`:

**Single-stage output** (~line 435): after `writeProfile` and before
`generateClaudeCodeSettings`, add:

```js
const teamInstructions = interpolateTeamInstructions(agentTrack, humanDiscipline);
await writeTeamInstructions(teamInstructions, baseDir);
```

**All-stages output** (~line 527): after the `writeProfile` loop and
`writeSkills`, before `generateClaudeCodeSettings`, add the same two lines.

**Console output** (no `--output`): before the profile console output, print
team instructions if present:

```js
const teamInstructions = interpolateTeamInstructions(agentTrack, humanDiscipline);
if (teamInstructions) {
  console.log("# Team Instructions (CLAUDE.md)\n");
  console.log(teamInstructions.trim());
  console.log("\n---\n");
}
```

Import `interpolateTeamInstructions` from `@forwardimpact/libskill`.

### 5. DOM formatter — include `CLAUDE.md` in ZIP download

**File:** `products/pathway/src/formatters/agent/dom.js`

In `downloadAllAsZip()` (~line 180), accept an additional `teamInstructions`
parameter. Before the "Generate and download" step, add:

```js
if (teamInstructions) {
  zip.file(".claude/CLAUDE.md", teamInstructions.trim() + "\n");
}
```

Update the call site in `createDownloadButton` and `agentDeploymentToDOM` to
pass `teamInstructions` through from the deployment data.

### 6. Tests

**Schema validation.** Add test cases to the existing map validation tests:
- Track with `teamInstructions` string validates.
- Track without `teamInstructions` validates (backward compat).
- Track with `teamInstructions: 123` (non-string) fails validation.

**Derivation.** Add test cases to libskill agent tests:
- `interpolateTeamInstructions` replaces `{roleTitle}` and
  `{specialization}`.
- `interpolateTeamInstructions` returns `null` when field is absent.
- `buildStageProfileBodyData` includes `teamInstructions` in output.

**CLI output.** Add test cases to pathway agent command tests:
- With `--output` and `teamInstructions` present, `.claude/CLAUDE.md` is
  written with interpolated content.
- With `--output` and `teamInstructions` absent, no `.claude/CLAUDE.md` is
  created.

## Ordering

Steps 1–2 (schema) have no code dependencies and can be done in any order.
Step 3 (derivation) depends on the schema being valid but not on the schema
files themselves — libskill reads data, not schema files. Step 4 (CLI) depends
on step 3 for the exported `interpolateTeamInstructions` function. Step 5 (DOM)
is independent of step 4. Step 6 (tests) should be written alongside each step.

Recommended order: 1 → 2 → 3 → 4 → 5 → 6. All in one commit.

## Files Modified

| File | Action |
|------|--------|
| `products/map/schema/json/track.schema.json` | Add property |
| `products/map/schema/rdf/track.ttl` | Add property + shape |
| `libraries/libskill/agent.js` | Add interpolation, pass-through |
| `products/pathway/src/commands/agent.js` | Add write function, call sites |
| `products/pathway/src/formatters/agent/dom.js` | Add ZIP inclusion |

## Files Not Modified

- Track YAML files in `data/pathway/tracks/` — no `teamInstructions` authored
  yet; that is a downstream/installation concern.
- Agent profile template (`products/pathway/templates/agent.template.md`) —
  team instructions go in a separate file, not inside profiles.
- Skill formatter — unchanged.
- Validation logic in map — plain string, no custom validation needed.
