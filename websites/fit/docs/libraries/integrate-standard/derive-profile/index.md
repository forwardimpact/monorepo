---
title: Derive a Skill Matrix or Agent Profile
description: Go from discipline, level, and track to a complete skill matrix or agent profile — without parsing YAML by hand.
---

You have a discipline, level, and track (or just discipline and level), and you
need the derived skill matrix or agent profile as structured data. This page
walks through the bounded task of going from those three coordinates to a
profile object you can render, store, or pass downstream.

## Prerequisites

Complete the
[Integrate with the Engineering Standard](/docs/libraries/integrate-standard/)
guide first -- this page assumes you have `@forwardimpact/libskill` and
`@forwardimpact/map` installed and know how to load standard data with
`createDataLoader(createDefaultRuntime()).loadAllData()`.

## Load data and resolve coordinates

Start by loading the standard data and finding the entities for your role
coordinates:

```js
import { createDataLoader } from "@forwardimpact/map/loader";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

const loader = createDataLoader(createDefaultRuntime());
const data = await loader.loadAllData("data/pathway");

const discipline = data.disciplines.find((d) => d.id === "software-engineering");
const level = data.levels.find((l) => l.id === "J070");
const track = data.tracks.find((t) => t.id === "platform");
```

If any of these return `undefined`, the ID does not exist in your standard. List
available values with `npx fit-pathway discipline --list`,
`npx fit-pathway level --list`, or `npx fit-pathway track --list`.

## Derive a skill matrix for a role

Call `deriveSkillMatrix` with the resolved entities:

```js
import { deriveSkillMatrix } from "@forwardimpact/libskill";

const matrix = deriveSkillMatrix({
  discipline,
  level,
  track,
  skills: data.skills,
  capabilities: data.capabilities,
});

for (const entry of matrix) {
  console.log(`${entry.type.padEnd(12)} ${entry.skillName.padEnd(30)} ${entry.proficiency}`);
}
```

Expected output (abbreviated):

```text
core         Architecture Design            practitioner
core         Code Review                    practitioner
core         Full Stack Development         practitioner
supporting   CI/CD                          working
supporting   Cloud Platforms                working
broad        Data Modeling                  foundational
track        Change Management              working
track        Incident Management            working
```

The `track` entries appear only when a track is passed. Omit `track` (or pass
`null`) to get the generalist matrix.

## Derive a behaviour profile for a role

Call `deriveBehaviourProfile` with the same coordinates:

```js
import { deriveBehaviourProfile } from "@forwardimpact/libskill";

const profile = deriveBehaviourProfile({
  discipline,
  level,
  track,
  behaviours: data.behaviours,
});

for (const entry of profile) {
  console.log(`${entry.behaviourName.padEnd(30)} ${entry.maturity}`);
}
```

Expected output (abbreviated):

```text
Build Polymathic Knowledge     role-modeling
Communicate with Precision     practicing
Own the Outcome                practicing
Stay Relentlessly Curious      practicing
Think in Systems               role-modeling
```

## Derive an agent profile instead

Agent profiles use the same derivation logic but apply agent-specific policies:
human-only skills are removed, only the highest-proficiency skills are kept, and
both skills and behaviours are sorted by level descending. Use
`prepareAgentProfile` for this:

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

console.log("Skills:", agentProfile.skillMatrix.length);
console.log("Behaviours:", agentProfile.behaviourProfile.length);
console.log("Top skill:", agentProfile.skillMatrix[0]?.skillName);
console.log("Top behaviour:", agentProfile.behaviourProfile[0]?.behaviourName);
```

Expected output:

```text
Skills: 14
Behaviours: 5
Top skill: Architecture Design
Top behaviour: Think in Systems
```

The agent matrix is smaller because human-only skills (like People Management)
are excluded. The sort order places the strongest skills and behaviours first,
which is useful when generating agent instructions where the most important
capabilities should lead.

## Get both at once with prepareBaseProfile

When you need the skill matrix, behaviour profile, and derived responsibilities
in a single call, use `prepareBaseProfile`:

```js
import { prepareBaseProfile } from "@forwardimpact/libskill/profile";

const base = prepareBaseProfile({
  discipline,
  track,
  level,
  skills: data.skills,
  behaviours: data.behaviours,
  capabilities: data.capabilities,
});

console.log("Skills:", base.skillMatrix.length);
console.log("Behaviours:", base.behaviourProfile.length);
console.log("Responsibilities:", base.derivedResponsibilities.length);
```

Expected output:

```text
Skills: 16
Behaviours: 5
Responsibilities: 4
```

`prepareBaseProfile` returns the raw derivation without agent-specific
filtering. Use it when building features for the general role audience.
Use `prepareAgentProfile` when the consumer is an agent configuration pipeline.

## Verify

You have reached the outcome of this guide when:

- You can resolve discipline, level, and track from their string IDs to the
  loaded data objects.
- You can derive a skill matrix and read each entry's type, proficiency, and
  description.
- You can derive a behaviour profile and read each entry's maturity level.
- You can choose between `prepareBaseProfile` (full role) and
  `prepareAgentProfile` (agent-optimized) depending on your use case.

## What's next

<div class="grid">

<!-- part:card:.. -->

</div>
