# libskill

<!-- BEGIN:description — Do not edit. Generated from package.json. -->

The engineering standard made queryable — derive skill matrices, job
definitions, agent profiles, career paths, and interview plans from standard
data.

<!-- END:description -->

## Getting Started

```js
import { deriveJob, deriveSkillMatrix, deriveBehaviourProfile } from '@forwardimpact/libskill';
```

Subpath imports are available for focused use:

```js
import { calculateJobMatch } from '@forwardimpact/libskill/matching';
import { analyzeProgression } from '@forwardimpact/libskill/progression';
import { generateAgentProfile } from '@forwardimpact/libskill/agent';
```

## Documentation

libskill ships no CLI, so its derivations surface through the product CLIs that
consume it (`fit-pathway`, `fit-guide`). Coverage by derivation:

- **Skill matrices, behaviour profiles, agent profiles, job matching** —
  library tier:
  [Turn Standard Definitions into Queryable Data](https://www.forwardimpact.team/docs/libraries/integrate-standard/index.md)
  and its
  [Derive a Skill Matrix or Agent Profile](https://www.forwardimpact.team/docs/libraries/integrate-standard/derive-profile/index.md)
  child.
- **Career-path / progression analysis** (`analyzeProgression`,
  `analyzeLevelProgression`) — product tier via `fit-pathway progress`:
  [See What's Expected at Your Level](https://www.forwardimpact.team/docs/products/career-paths/index.md).
- **Interview-plan derivation** (`deriveInterviewQuestions` and the specialized
  variants) — product tier via `fit-pathway interview`:
  [Getting Started: Pathway for Leaders](https://www.forwardimpact.team/docs/getting-started/leaders/pathway/index.md).
