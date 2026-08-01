---
title: Turn Standard Definitions into Queryable Data
description: Engineering standard YAML becomes queryable data. Derive skill matrices, behaviour profiles, and agent configurations programmatically from a single load.
---

You build a feature that needs skill matrices or role definitions. The standard
data sits in YAML files across `data/pathway/`. If you parse those files
yourself, you reimplement the derivation rules. Those rules cover modifier
resolution, proficiency clamping, tier classification, and validation. You also
keep your code in sync as the standard evolves. `@forwardimpact/libskill`
handles that derivation. Load the standard data once with
`@forwardimpact/map`. Then call pure functions that return structured skill
matrices, behaviour profiles, responsibilities, and agent configurations. The
library applies the same rules that `fit-pathway` uses internally, so your
feature stays consistent with the CLI.

## Prerequisites

- Node.js 22+
- Install both packages:

```sh
npm install @forwardimpact/libskill @forwardimpact/map
```

- Standard data initialized at `data/pathway/`. If you still need to do this,
  run `npx fit-pathway init` and follow the prompts.

## Load the standard data

`@forwardimpact/map` provides a `DataLoader`. The loader reads every YAML file
in your standard data directory. It returns a single object with all entities
resolved:

```js
import { createDataLoader } from "@forwardimpact/map/loader";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

const loader = createDataLoader(createDefaultRuntime());
const data = await loader.loadAllData("data/pathway");
```

`createDataLoader` takes a runtime, the bag of injected collaborators it reads
files through. `createDefaultRuntime()` from `@forwardimpact/libutil` wires the
real filesystem. Pass your own when you load data from somewhere else.

The returned `data` object contains arrays for `disciplines`, `levels`,
`tracks`, `skills`, `behaviours`, `capabilities`, and `drivers`. Every function
in `@forwardimpact/libskill` accepts these arrays as input parameters. The
library never reads the filesystem itself. You control where the data comes
from. The functions stay pure.

## Derive a skill matrix

A skill matrix shows every skill relevant to a discipline at a specific level,
with the proficiency that level requires. Call `deriveSkillMatrix` with a
discipline, level, and optionally a track:

```js
import { deriveSkillMatrix } from "@forwardimpact/libskill";

const discipline = data.disciplines.find((d) => d.id === "software-engineering");
const level = data.levels.find((l) => l.id === "J070");

const matrix = deriveSkillMatrix({
  discipline,
  level,
  skills: data.skills,
  capabilities: data.capabilities,
});

console.log(JSON.stringify(matrix[0], null, 2));
```

Expected output (one entry):

```json
{
  "skillId": "architecture-design",
  "skillName": "Architecture Design",
  "capability": "design",
  "capabilityRank": 1,
  "isHumanOnly": false,
  "type": "core",
  "proficiency": "practitioner",
  "proficiencyDescription": "You lead architecture for a product or platform area..."
}
```

Each entry in the matrix includes:

| Field                    | Meaning                                        |
| ------------------------ | ---------------------------------------------- |
| `skillId`                | unique identifier that matches the YAML source |
| `type`                   | `core`, `supporting`, `broad`, or `track`      |
| `proficiency`            | derived proficiency after the modifiers apply  |
| `proficiencyDescription` | human-readable description of that proficiency |
| `isHumanOnly`            | `true` for skills irrelevant to agents         |

`deriveSkillMatrix` sorts the matrix by type. The type order is core,
supporting, broad, then track. Within each type it sorts alphabetically.

## Apply track specializations

Tracks adjust skill proficiencies and add track-specific skills through
modifiers. Pass a track to see the difference:

```js
const track = data.tracks.find((t) => t.id === "platform");

const generalMatrix = deriveSkillMatrix({
  discipline,
  level,
  skills: data.skills,
  capabilities: data.capabilities,
});

const platformMatrix = deriveSkillMatrix({
  discipline,
  level,
  track,
  skills: data.skills,
  capabilities: data.capabilities,
});

console.log("General skills:", generalMatrix.length);
console.log("Platform skills:", platformMatrix.length);
```

Expected output:

```text
General skills: 12
Platform skills: 16
```

The platform track adds skills such as Change Management, Incident Management,
Observability, and Performance Optimization. Those skills do not appear in the
generalist matrix. Skills that are already present can also shift proficiency.
A track modifier of `+1` on a capability raises every skill in that capability
by one proficiency level. The level's maximum clamps the result.

## Derive a behaviour profile

Behaviours describe how engineers approach their work. The behaviour profile
shows the expected maturity for each behaviour at a given level:

```js
import { deriveBehaviourProfile } from "@forwardimpact/libskill";

const profile = deriveBehaviourProfile({
  discipline,
  level,
  behaviours: data.behaviours,
});

console.log(JSON.stringify(profile[0], null, 2));
```

Expected output (one entry):

```json
{
  "behaviourId": "systems-thinking",
  "behaviourName": "Think in Systems",
  "maturity": "role-modeling",
  "maturityDescription": "You shape how teams approach problems..."
}
```

Track and discipline modifiers both affect behaviour maturity. A discipline with
`behaviourModifiers: { collaboration: 1 }` raises the collaboration maturity by
one level from the base. A track with its own modifier stacks on top.

## Derive a complete role definition

Use `deriveJob` when you need the full picture. The full picture covers the
skill matrix, the behaviour profile, the responsibilities, and the
expectations. `deriveJob` validates the combination first. It returns `null`
for an invalid pairing. One example is a discipline that requires a track when
you call `deriveJob` without one:

```js
import { deriveJob } from "@forwardimpact/libskill";

const result = deriveJob({
  discipline,
  level,
  track,
  skills: data.skills,
  behaviours: data.behaviours,
  capabilities: data.capabilities,
});

if (!result) {
  console.error("Invalid combination");
  process.exit(1);
}

console.log(result.title);
console.log("Skills:", result.skillMatrix.length);
console.log("Behaviours:", result.behaviourProfile.length);
console.log("Responsibilities:", result.derivedResponsibilities.length);
```

Expected output:

```text
Senior Engineer Software Engineer - Platform Engineering
Skills: 16
Behaviours: 5
Responsibilities: 4
```

The returned object contains `id`, `title`, `skillMatrix` (same shape as
`deriveSkillMatrix` output), `behaviourProfile` (same shape as
`deriveBehaviourProfile`), `derivedResponsibilities`, and `expectations`
(scope, autonomy, influence, complexity).

## Generate all valid roles

To enumerate every valid discipline-level-track combination, use
`generateAllJobs`:

```js
import { generateAllJobs } from "@forwardimpact/libskill";

const allJobs = generateAllJobs({
  disciplines: data.disciplines,
  levels: data.levels,
  tracks: data.tracks,
  skills: data.skills,
  behaviours: data.behaviours,
});

console.log("Total valid roles:", allJobs.length);
console.log(
  "Titles:",
  allJobs.slice(0, 3).map((j) => j.title)
);
```

Expected output (values depend on your standard):

```text
Total valid roles: 48
Titles: [
  "Associate Engineer Clinical Informatics",
  "Associate Engineer Data Engineer",
  "Associate Engineer Software Engineer"
]
```

The function skips invalid combinations automatically. Each entry is a full role
definition (same shape as `deriveJob` output).

## Prepare display-ready views

When you need data shaped for a UI or report rather than raw derivation output,
use the view preparation functions. `prepareJobDetail` adds driver coverage
analysis and a de-duplicated toolkit on top of the base derivation:

```js
import { prepareJobDetail } from "@forwardimpact/libskill";

const view = prepareJobDetail({
  discipline,
  level,
  track,
  skills: data.skills,
  behaviours: data.behaviours,
  drivers: data.drivers,
  capabilities: data.capabilities,
});

console.log(view.title);
console.log("Driver coverage:");
for (const d of view.driverCoverage) {
  console.log(`  ${d.name}: ${(d.coverage * 100).toFixed(0)}%`);
}
```

Expected output:

```text
Senior Engineer Software Engineer - Platform Engineering
Driver coverage:
  Velocity: 85%
  Stability: 70%
```

For list views, `prepareJobSummary` returns only the title, the counts, and the
identifiers. It returns no full matrices.

## Derive agent profiles

Agent profiles follow the same derivation path as role definitions. They also
apply extra policies. The derivation excludes human-only skills. It keeps only
the highest-level skills. It sorts skills and behaviours by level descending.

Use `prepareAgentProfile` when you need the filtered, agent-optimized view:

```js
import { prepareAgentProfile } from "@forwardimpact/libskill/profile";

const agentProfile = prepareAgentProfile({
  discipline,
  track,
  level,
  skills: data.skills,
  behaviours: data.behaviours,
  capabilities: data.capabilities,
});

console.log("Agent skills:", agentProfile.skillMatrix.length);
console.log("First skill:", agentProfile.skillMatrix[0].skillName);
```

The agent skill matrix is smaller than the full role matrix. The derivation
removes human-only skills and collapses lower-level duplicates.
`prepareAgentProfile` sorts behaviours strongest-first. That order helps agent
instructions, where the most important working styles should lead. For the full
agent generation pipeline (identity text, working styles, skill markdown), see
`generateAgentProfile` on the `@forwardimpact/libskill/agent` subpath.

## Subpath imports

The root import provides the most commonly used functions. For focused use,
import from subpaths to load only what you need:

| Subpath                                   | Key exports                                              |
| ----------------------------------------- | -------------------------------------------------------- |
| `@forwardimpact/libskill`                 | `deriveSkillMatrix`, `deriveBehaviourProfile`, `deriveJob`|
| `@forwardimpact/libskill/matching`        | `calculateJobMatch`, `findMatchingJobs`                   |
| `@forwardimpact/libskill/progression`     | `analyzeProgression`, `analyzeLevelProgression`           |
| `@forwardimpact/libskill/agent`           | `generateAgentProfile`, `deriveAgentSkills`               |
| `@forwardimpact/libskill/profile`         | `prepareBaseProfile`, `prepareAgentProfile`               |
| `@forwardimpact/libskill/interview`       | `deriveInterviewQuestions`                                |
| `@forwardimpact/libskill/job`             | `prepareJobDetail`, `prepareJobSummary`                   |
| `@forwardimpact/libskill/job-cache`       | `createJobCache`, `buildJobKey`                           |
| `@forwardimpact/libskill/policies`        | policies for filters, sorts, and predicates               |

## Cache derived roles

When you derive the same combination repeatedly, pass a cache to avoid
redundant computation. One example is a loop that compares roles:

```js
import { createJobCache } from "@forwardimpact/libskill/job-cache";
import { prepareJobDetail } from "@forwardimpact/libskill";

const cache = createJobCache();

const view = prepareJobDetail({
  discipline, level, track,
  skills: data.skills, behaviours: data.behaviours,
  drivers: data.drivers, capabilities: data.capabilities,
  jobCache: cache,
});
```

The cache keys on discipline ID, level ID, and track ID. Create one cache per
request or operation. Do not share caches across data reloads.

## Validate combinations before you derive

Not every discipline-level-track triple is valid. Some disciplines require a
track. Some tracks have a minimum level. Check before you derive:

```js
import { isValidJobCombination } from "@forwardimpact/libskill";

const valid = isValidJobCombination({ discipline, level, track: null });
console.log("Valid without track:", valid);
```

If the discipline has `validTracks: [null, "platform"]`, a call without a track
is valid. If it has `validTracks: ["platform", "sre"]` (no `null`), the
discipline requires a track. The call then returns `false`.

`deriveJob` calls this validation internally. It returns `null` for invalid
combinations. Use `isValidJobCombination` when you need to check validity
without the full derivation. One example is to disable invalid options in a
form.

## Verify

You reach the outcome of this guide when:

- You can load standard data with
  `createDataLoader(createDefaultRuntime()).loadAllData()` and pass the result
  to `@forwardimpact/libskill` functions.
- You can derive a skill matrix for a discipline + level (+ optional track) and
  inspect the type, proficiency, and description of each entry.
- You can derive a behaviour profile and read the maturity level for each
  behaviour.
- You can generate a complete role definition with `deriveJob` and access its
  skill matrix, behaviour profile, responsibilities, and expectations.
- You understand how track modifiers shift proficiencies and maturities.

## What's next

<div class="grid">

<!-- part:card:derive-profile -->

</div>
