---
title: "Getting Started: Summit for Leaders"
description: "Model team capability — coverage heatmaps, structural risks, what-if staffing scenarios, growth alignment, and trajectory over time."
---

Summit treats a team as a system, not a collection of individuals. It aggregates
skill matrices into capability coverage, structural risks, and what-if staffing
scenarios. Core Summit is fully local and deterministic — it reads your Map
standard data plus a team roster, and runs instantly with no network calls.

Two optional flags unlock the activity layer: `--evidenced` compares derived
coverage against practice patterns from evidence rows, and `--outcomes` weights
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

Summit reads team composition from a `summit.yaml` file (or, if you've set up
Map's activity layer, from the `organization_people` table directly). A roster
file is the fastest way to try Summit — every discipline, level, and track it
references must exist in your Map standard data.

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

`teams:` are reporting teams — the people who roll up to a manager. `projects:`
are allocation-weighted project teams that can either reference existing
reporting-team members by `email` (inheriting their job profile) or declare new
members inline. Allocation is a fraction between 0 and 1.

Summit does not auto-discover a roster — pass `--roster ./path/to/summit.yaml`
explicitly to every command. All the commands below accept the flag. (If you've
set up Map's activity layer, you can omit `--roster` and Summit will read the
team from the `organization_people` table instead.)

Summit automatically looks for Map standard data in `data/pathway/` relative to
the current working directory. If your standard data lives elsewhere, pass
`--data ./path/to/data/pathway` to any command.

## Validate the roster

Before running analysis, check that every discipline, level, and track your
roster references actually exists in your agent-aligned engineering standard:

```sh
npx fit-summit validate --roster ./summit.yaml
```

A successful run prints the total member count across all teams. Any validation
errors point at the offending row so you can fix the YAML before aggregating.

## Show the roster

Dump what Summit sees — useful for confirming the right file is being picked up
and for sharing the team layout with a collaborator:

```sh
npx fit-summit roster --roster ./summit.yaml
```

## View capability coverage

See your team's collective proficiency across all skills:

```sh
npx fit-summit coverage platform --roster ./summit.yaml
```

The report groups skills by capability and shows, for each skill, the headcount
depth at `working+` proficiency. A blank bar signals a gap — nobody on the team
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
where exactly one person holds working+ proficiency — losing them leaves the
team unable to execute. **Critical gaps** are skills the discipline or track
expects but nobody on the team holds at working level or above. **Concentration
risks** are clusters where three or more people overlap on the same (level,
capability, proficiency) bucket — a structural imbalance that suggests room for
cross-training.

## Run what-if scenarios

Simulate roster changes and see their impact before making a decision. Summit
supports four kinds of mutation — `--add`, `--remove`, `--move`, and `--promote`
— and reports which capabilities and risks change as a result:

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

Add `--focus <capability>` to filter the diff to a single capability when you
want to see the impact of a change on one area of the team.

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

Diff two teams' coverage and risks side by side — useful when considering a
structural reorganization or understanding why two similarly-sized teams feel
different:

```sh
npx fit-summit compare platform delivery --roster ./summit.yaml
```

## Track trajectory over time

Summit can reconstruct the history of your roster from git — if `summit.yaml` is
checked into a repository, `trajectory` walks the git log to rebuild the roster
at each quarter boundary and charts how capability has evolved:

```sh
npx fit-summit trajectory platform --roster ./summit.yaml --quarters 4
```

**Prerequisites:** The roster file passed to `--roster` must be tracked in a git
repository with multiple commits over time. `trajectory` reads the git history
of that file to reconstruct past roster states at quarter boundaries. If the
file is not committed, has no history, or lives outside a git repository, the
command cannot produce results.

This turns "is the team getting stronger?" from a felt sense into a structural
answer.

## Combine with the activity layer

When Map's activity layer is populated (see the
[Map guide](/docs/getting-started/leaders/map/)), Summit can overlay evidence
of practiced capability onto its structural view. The `--evidenced` flag reads
practice patterns from `activity.evidence` and compares them to what the roster
predicts — flagging skills the agent-aligned engineering standard says the team
should have that aren't showing up in real work:

```sh
npx fit-summit coverage platform --roster ./summit.yaml --evidenced
npx fit-summit risks platform --roster ./summit.yaml --evidenced
```

Set `--lookback-months` (default 12) to control the practice window.

## Match the audience to the conversation

Summit has a built-in privacy model. The `--audience` flag adjusts what
individual-level detail is shown:

- `manager` (the default) and `engineer` — individual holders are visible by
  name; appropriate for 1:1s and for engineers reviewing their own team
- `director` — holder names are stripped; only aggregated counts remain,
  appropriate for cross-team planning artifacts

Use `--audience director` when sharing a view across teams or publishing a
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
