---
title: "Getting Started: Summit for Leaders"
description: "Model team capability — coverage heatmaps, structural risks, what-if staffing scenarios, growth alignment, and trajectory over time."
---

Summit treats a team as a system. It does not treat a team as a collection of
individuals. It aggregates skill matrices into capability coverage, structural
risks, and what-if staffing scenarios. Core Summit is fully local and
deterministic. It reads your Map standard data plus a team roster. It runs
instantly with no network calls.

Two optional flags unlock the activity layer. `--evidenced` compares derived
coverage against practice patterns from evidence rows. `--outcomes` weights
growth recommendations by GetDX driver scores. Without those flags Summit needs
nothing beyond standard data and a roster.

## Prerequisites

- Node.js 22+
- npm
- Standard data initialized (see
  [Getting Started: Map for Leaders](/docs/getting-started/leaders/map/))

## Install

```sh
npm install @forwardimpact/summit
```

## Create a roster

Summit reads team composition from a `summit.yaml` file. If you set up Map's
activity layer, Summit reads it from the `organization_people` table directly.
A roster file is the fastest way to try Summit. Every discipline, level, and
track it references must exist in your Map standard data.

Save this as `summit.yaml` next to your `data/pathway/` directory:

```yaml
teams:
  platform:
    - name: Alice
      email: alice@example.com
      job:
        discipline: software-engineering
        level: J060
        track: platform
    - name: Bob
      email: bob@example.com
      job:
        discipline: software-engineering
        level: J040

  delivery:
    - name: Carol
      email: carol@example.com
      job:
        discipline: software-engineering
        level: J060
    - name: Dan
      email: dan@example.com
      job:
        discipline: software-engineering
        level: J040
        track: forward-deployed

projects:
  migration-q2:
    - email: alice@example.com
      allocation: 0.6
    - email: carol@example.com
      allocation: 0.4
    - name: External Consultant
      job:
        discipline: software-engineering
        level: J060
        track: platform
      allocation: 1.0
```

`teams:` are reporting teams. They hold the people who roll up to a manager.
`projects:` are allocation-weighted project teams. A project team can reference
existing reporting-team members by `email` and inherit their job profile. It can
also declare new members inline. Allocation is a fraction between 0 and 1.

Summit does not auto-discover a roster. Pass `--roster ./path/to/summit.yaml`
explicitly to every command. All the commands below accept the flag. If you set
up Map's activity layer, you can omit `--roster`. Summit then reads the team
from the `organization_people` table instead.

Summit automatically looks for Map standard data in `data/pathway/` relative to
the current working directory. If your standard data lives elsewhere, pass
`--data ./path/to/data/pathway` to any command.

## Validate the roster

Before you run analysis, check that every discipline, level, and track your
roster references exists in your agent-aligned engineering standard:

```sh
npx fit-summit validate --roster ./summit.yaml
```

A successful run prints the total member count across all teams. Any validation
errors point at the offending row so you can fix the YAML before you aggregate.

## Show the roster

Dump what Summit sees. Use this to confirm that Summit picks up the right file.
Use it also to share the team layout with a collaborator:

```sh
npx fit-summit roster --roster ./summit.yaml
```

## View capability coverage

See your team's collective proficiency across all skills:

```sh
npx fit-summit coverage platform --roster ./summit.yaml
```

The report groups skills by capability. For each skill, it shows the headcount
depth at `working+` proficiency. A blank bar signals a gap. Nobody on the team
holds the skill at the working level or above.

Project teams carry allocation weights, so coverage reports effective depth
instead of raw headcount:

```sh
npx fit-summit coverage --project migration-q2 --roster ./summit.yaml
```

## Identify structural risks

Find single points of failure, critical gaps, and concentration risks:

```sh
npx fit-summit risks platform --roster ./summit.yaml
```

Summit reports three kinds of risk. **Single points of failure** are skills
where exactly one person holds working+ proficiency. If that person leaves, the
team cannot execute. **Critical gaps** are skills the discipline or track
expects but nobody on the team holds at working level or above. **Concentration
risks** are clusters where three or more people overlap on the same (level,
capability, proficiency) bucket. This structural imbalance suggests room for
cross-training.

## Run what-if scenarios

Simulate roster changes and see their impact before you decide. Summit supports
four kinds of mutation: `--add`, `--remove`, `--move`, and `--promote`. It
reports which capabilities and risks change as a result:

```sh
# Hypothetical new hire
npx fit-summit what-if platform --roster ./summit.yaml \
  --add "{ discipline: software-engineering, level: J060, track: platform }"

# Departure
npx fit-summit what-if platform --roster ./summit.yaml \
  --remove bob@example.com

# Internal move
npx fit-summit what-if platform --roster ./summit.yaml \
  --move carol@example.com --to delivery

# Promotion
npx fit-summit what-if platform --roster ./summit.yaml \
  --promote bob@example.com
```

Add `--focus <capability>` to filter the diff to a single capability. Use it to
see the impact of a change on one area of the team.

## Align growth with team needs

Growth opportunities highlight where individual development would have the most
leverage for the team as a whole:

```sh
npx fit-summit growth platform --roster ./summit.yaml
```

Add `--outcomes` to weight recommendations by GetDX driver scores (requires
Map's activity layer):

```sh
npx fit-summit growth platform --roster ./summit.yaml --outcomes
```

## Compare two teams

Diff two teams' coverage and risks side by side. Use this when you consider a
structural reorganization. Use it also when you want to know why two
similarly-sized teams feel different:

```sh
npx fit-summit compare platform delivery --roster ./summit.yaml
```

## Track trajectory over time

Summit can reconstruct the history of your roster from git. If you check
`summit.yaml` into a repository, `trajectory` walks the git log. It rebuilds the
roster at each quarter boundary. It charts how capability evolved:

```sh
npx fit-summit trajectory platform --roster ./summit.yaml --quarters 4
```

**Prerequisites:** You must track the roster file you pass to `--roster` in a
git repository with multiple commits over time. `trajectory` reads the git
history of that file to reconstruct past roster states at quarter boundaries.
If you do not commit the file, or it has no history, or it lives outside a git
repository, the command cannot produce results.

This turns "is the team getting stronger?" from a felt sense into a structural
answer.

## Combine with the activity layer

When you populate Map's activity layer (see the
[Map guide](/docs/getting-started/leaders/map/)), Summit can overlay evidence
of practiced capability onto its structural view. The `--evidenced` flag reads
practice patterns from `activity.evidence`. It compares them to what the roster
predicts. It flags skills the agent-aligned engineering standard says the team
should have but that do not appear in real work:

```sh
npx fit-summit coverage platform --roster ./summit.yaml --evidenced
npx fit-summit risks platform --roster ./summit.yaml --evidenced
```

Set `--lookback-months` (default 12) to control the practice window.

## Match the audience to the conversation

Summit has a built-in privacy model. The `--audience` flag adjusts which
individual-level detail Summit shows:

- `manager` (the default) and `engineer` — Summit shows individual holders by
  name, which suits 1:1s and engineers who review their own team
- `director` — Summit strips holder names and leaves only aggregated counts,
  which suits cross-team planning artifacts

Use `--audience director` when you share a view across teams or publish a
planning artifact beyond the team manager.

```sh
npx fit-summit coverage platform --roster ./summit.yaml --audience director
```

---

## What's next

<div class="grid">

<!-- part:card:../../../../summit -->
<!-- part:card:../../../products/team-capability -->

</div>
