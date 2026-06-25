---
title: "Evaluate a Candidate Against Team Gaps"
description: "Know whether a candidate fills the team's actual capability gap before making an offer — not after onboarding reveals the mismatch."
---

You need to check whether a specific candidate addresses the structural gaps in
your team, not just the position description.

## Prerequisites

Complete the
[Make Staffing Decisions You Can Defend](/docs/products/team-capability/) guide
first -- this page assumes you have a `summit.yaml` roster, have run `coverage`
and `risks`, and understand where your team's gaps are.

## Describe the candidate as a role

Summit evaluates a candidate by their role definition -- discipline, level, and
optionally track. You are not entering a name or a CV; you are describing the
position the candidate would fill.

Determine the candidate's closest match from your engineering standard:

```sh
npx fit-pathway job --list
```

This prints every valid discipline, level, and track combination. Find the row
that matches the candidate's experience. For example, a mid-level software
engineer with a platform background maps to `software-engineering J060` with
track `platform`.

If you are unsure which level applies, generate two adjacent role definitions
and compare the expectations:

```sh
npx fit-pathway job software-engineering J060 --track=platform
npx fit-pathway job software-engineering J070 --track=platform
```

The Expectations section of each output describes impact scope, autonomy, and
complexity handled. Pick the level where the candidate's experience sits today,
not where you hope they will grow.

## Simulate adding the candidate

Run the `what-if --add` command against the team where the candidate would land.
The `--add` flag takes a flow-style YAML object describing the role:

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

The output answers two questions at once: which existing risks does this role
resolve, and how does overall coverage shift. If the candidate's role resolves
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

This is useful when two candidates target different capability areas and you
want to see each one's contribution in isolation.

## Compare two candidates

To decide between candidates, run `what-if --add` once for each and compare the
output. For example, one candidate is a J060 software engineer on the platform
track; the other is a J070 data engineer:

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
  candidates, you can point to the structural difference -- "Candidate A
  resolves the observability gap; Candidate B does not" -- rather than relying
  on impressions.

If the `what-if` output shows the candidate's role resolves none of your
identified risks, re-examine whether the position description matches the gap.
The problem may not be the candidate -- it may be that the role was defined
around the position description rather than the team's actual needs.

## What's next

<div class="grid">

<!-- part:card:.. -->
<!-- part:card:../surface-gaps -->

</div>
