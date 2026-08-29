---
title: "Evaluate a Candidate Against Team Gaps"
description: "Know whether a candidate fills the team's actual capability gap before you make an offer. Do not discover the mismatch after the new hire starts."
---

You need to check whether a specific candidate addresses the structural gaps in
your team. Do not compare the candidate only against the position description.

## Prerequisites

Complete the
[Make Staffing Decisions You Can Defend](/docs/products/team-capability/) guide
first. This page assumes you have a `summit.yaml` roster and ran `coverage` and
`risks`. It also assumes you know where your team's gaps are.

## Describe the candidate as a role

Summit evaluates a candidate by their role definition. The definition holds a
discipline, a level, and an optional track. You do not enter a name or a CV.
You describe the position the candidate would fill.

Determine the candidate's closest match from your engineering standard:

```sh
npx fit-pathway job --list
```

This prints every valid combination of discipline, level, and track. Find the
row that matches the candidate's experience. For example, a mid-level software
engineer with a platform background maps to `software-engineering J060` with
track `platform`.

If you are unsure which level applies, generate two adjacent role definitions.
Then compare the expectations:

```sh
npx fit-pathway job software-engineering J060 --track=platform
npx fit-pathway job software-engineering J070 --track=platform
```

The Expectations section of each output describes impact scope, autonomy, and
complexity handled. Pick the level where the candidate's experience sits today.
Do not pick the level you hope they will grow into.

## Add the candidate to a simulation

Run the `what-if --add` command against the team where the candidate would land.
The `--add` flag takes a flow-style YAML object that describes the role:

```sh
npx fit-summit what-if platform --roster ./summit.yaml \
  --add "{ discipline: software-engineering, level: J060, track: platform }"
```

Expected output:

```text
  Adding hypothetical member to Platform team

  Resolved Risks:
    observability             resolves critical gap
    infrastructure            resolves single point of failure

  Coverage Change:
    Architecture capability   ████████░░ → ██████████  (+20%)
```

The output answers two questions at once. It names the current risks this role
resolves. It shows how overall coverage shifts. If the candidate's role resolves
the risks you identified in the
[parent guide](/docs/products/team-capability/), you have evidence that this
position fills the actual gap.

## Narrow the focus

When the full coverage diff is too broad, focus on the capability area you care
about most:

```sh
npx fit-summit what-if platform --roster ./summit.yaml \
  --add "{ discipline: software-engineering, level: J060, track: platform }" \
  --focus architecture
```

Expected output:

```text
  Adding hypothetical member to Platform team (focus: architecture)

  Capability: Architecture
    system_design             ████████░░ → ████████░░  (unchanged)
    api_design                ██████████ → ██████████  (unchanged)
    infrastructure            ████░░░░░░ → ██████░░░░  (+1 depth)
    observability             ░░░░░░░░░░ → ████░░░░░░  (resolved gap)
```

Use this when two candidates target different capability areas. You then see
each one's contribution in isolation.

## Compare two candidates

To decide between candidates, run `what-if --add` once for each candidate. Then
compare the output. For example, one candidate is a J060 software engineer on
the platform track. The other is a J070 data engineer:

```sh
npx fit-summit what-if platform --roster ./summit.yaml \
  --add "{ discipline: software-engineering, level: J060, track: platform }"
```

```text
  Resolved Risks:
    observability             resolves critical gap
    infrastructure            resolves single point of failure
```

```sh
npx fit-summit what-if platform --roster ./summit.yaml \
  --add "{ discipline: data-engineering, level: J070, track: platform }"
```

```text
  Resolved Risks:
    (none)
```

Compare the "Resolved Risks" section in each output. The candidate whose role
resolves more structural risks is the stronger fit for the team's actual
needs.

## Verify

The evaluation is complete when you can answer these questions from the
`what-if --add` output:

- **Does this role resolve the risks you identified?** The "Resolved Risks"
  section names the specific single points of failure or critical gaps the
  candidate's role addresses.
- **How does coverage change?** The "Coverage Change" section shows whether the
  candidate adds depth where the team is thin or redundancy where it is already
  strong.
- **Can you articulate why this candidate over another?** If you compared two
  candidates, you can point to the structural difference. Say "Candidate A
  resolves the observability gap. Candidate B does not." Do not rely on
  impressions.

The `what-if` output may show that the role resolves none of your identified
risks. In that case, re-examine whether the position description matches the
gap.
The problem may not be the candidate. The role may follow the position
description instead of the team's actual needs.

## What's next

<div class="grid">

<!-- part:card:.. -->
<!-- part:card:../surface-gaps -->

</div>
