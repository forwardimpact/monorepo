---
title: "Get Career Guidance Grounded in the Standard"
description: "When a promotion conversation ends with 'not yet' and no specifics, use Guide and Landmark to find what's missing and show concrete evidence of growth."
---

The promotion conversation ended with "not yet", and nobody could point to what
specific evidence would change the answer. The feedback felt subjective, and you
left without a clear picture of what to work on or how to show progress. This
guide walks you through finding the specific gaps between where you are and
where you need to be, then building a visible evidence record that grounds the
next conversation in facts. For the other half of this job, reviewing a
deliverable against the same standard, see
[Get Output Review Grounded in the Standard](/docs/products/trust-output/).

Two products work together in this workflow. **Guide** is an AI agent that
reasons about your organization's engineering standard -- it identifies gaps and
gives career advice grounded in your actual skill and behaviour definitions.
**Landmark** reads your engineering artifacts (pull requests, design documents,
code reviews) and shows which standard markers your work has evidenced. Together
they replace subjective impressions with specific, standards-grounded answers.

## Prerequisites

This guide assumes you have completed the setup for both products:

- [Getting Started: Guide for Engineers](/docs/getting-started/engineers/guide/)
  -- install Guide, run codegen, authenticate with Anthropic, process your
  standard data, and start the service stack.
- [Getting Started: Landmark for Engineers](/docs/getting-started/engineers/landmark/)
  -- install Landmark and confirm access to Map's activity layer.

You should also know your role coordinates (discipline, level, and track). If
you have not identified those yet, work through
[See What's Expected at Your Level](/docs/products/career-paths/) first -- that
guide covers finding your coordinates and understanding what your current level
expects.

## Ask Guide what's missing

Start by asking Guide what the gap looks like between your current level and
your target. Guide reads your organization's skill definitions, behaviour
expectations, and markers, and returns specific areas grounded in your
standard rather than generic career advice.

Start Guide and ask a growth question. Lines starting with `>` are prompts you
type inside the Guide session:

```sh
npx fit-guide
```

```text
> What should I focus on to move from J060 to J070 in Software Engineering?
```

Guide responds with the specific skills and behaviours that change between
levels, drawn from your standard data:

```text
Moving from Engineer (J060) to Senior Engineer (J070) in Software Engineering
involves 12 changes across skills and behaviours.

**Biggest skill jumps:**

- **Architecture Design** — Working to Practitioner. At Practitioner, you lead
  architecture for a product or platform area, defining module boundaries and
  integration patterns. The key shift is from designing within a given
  architecture to shaping the architecture itself.

- **Code Review** — Working to Practitioner. At Practitioner, you mentor others
  on review quality and define review standards for your area.

**Key behaviour shifts:**

- **Think in Systems** — Practicing to Role Modeling. At Role Modeling, you
  shape how the team approaches problems systemically, not just apply systems
  thinking yourself.

- **Own the Outcome** — Developing to Practicing. This means consistently
  demonstrating ownership in daily work, not just when prompted.

Focus on Architecture Design and Think in Systems first — those represent the
largest shifts in scope and autonomy.
```

You can also pipe a question directly without entering the interactive session:

```sh
echo "What markers define practitioner-level architecture design?" | npx fit-guide
```

Guide will reference the specific markers from your capability YAML -- the same
observable indicators that Landmark uses to match evidence.

### Go deeper on specific gaps

Once you know the broad gap, drill into specific areas:

```text
> What does practitioner-level code review look like in our standard?
```

```text
> How is Think in Systems different at Role Modeling vs Practicing?
```

```text
> Which of my core skills have the biggest jump to J070?
```

Each answer is grounded in your organization's definitions. Two people asking
the same question get the same foundational answer because the source of truth
is shared.

## Check your evidence record

Guide tells you what to work on. Landmark tells you what your engineering record
already shows. Before you start building new evidence, see where you stand.

### See which markers your work has evidenced

```sh
npx fit-landmark evidence --email you@example.com
```

```text
  Evidence

    architecture_design: 3 matched, 1 unmatched
      [matched] Designs services with clear API boundaries
        rationale: A recent pull request introduced a new service boundary with documented...
        provenance: artifact_interpreted
      [matched] Documents trade-offs in design decisions
        rationale: Design doc for auth migration weighed three approaches...
        provenance: agent_attested
      [matched] Defines module boundaries for a bounded domain
        rationale: RFC-019 established module boundaries for the billing...
        provenance: artifact_interpreted
      [unmatched] Leads architecture for a product or platform area

    code_review: 2 matched, 0 unmatched
      [matched] Provides actionable feedback on design intent, not just style
        rationale: Review of a recent pull request identified a coupling risk between...
        provenance: artifact_interpreted
      [matched] Catches cross-cutting concerns during review
        rationale: Review of a recent pull request flagged a missing audit trail...
        provenance: agent_attested

    Evidence covers 18/24 artifacts.
```

Each row shows the marker it matched, the rationale for the match, and a
provenance label naming where the evidence came from. Filter by skill to
focus on a specific gap:

```sh
npx fit-landmark evidence --skill architecture_design --email you@example.com
```

### Know where each piece of evidence comes from

Every evidence row carries one of four provenance labels. They matter when
you bring the record to a promotion conversation — evidence interpreted from
real artifacts carries more weight than placeholder rows:

| Provenance              | Where the row came from                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| `artifact_interpreted`  | Matched directly from an ingested artifact (pull request, design document, code review)  |
| `agent_attested`        | Written by Guide's deeper evaluation of your artifacts against a marker                  |
| `human_attested`        | Recorded by a person attesting the marker — also the default for rows written before provenance tracking |
| `synthetic_placeholder` | Generated from synthetic demo data — not evidence of real work                           |

The `coverage` command (below) breaks your record down by these labels, so
you can see at a glance how much of it rests on interpreted artifacts versus
placeholders.

### Check promotion readiness

See a checklist of next-level markers -- which ones you have already evidenced
and which are still outstanding:

```sh
npx fit-landmark readiness --email you@example.com
```

```text
  Readiness: you@example.com (J060 → J070)

    Architecture Design (practitioner):
      [x] Designs services with clear API boundaries (service-boundary-pr)
      [x] Documents trade-offs in design decisions (design-doc-auth)
      [x] Defines module boundaries for a bounded domain (RFC-019)
      [ ] Leads architecture for a product or platform area

    Code Review (practitioner):
      [x] Provides actionable feedback on design intent, not just style (review-coupling-pr)
      [ ] Mentors others on review quality
      [ ] Defines review standards for the area

    5/7 markers evidenced.
    Evidence coverage: 18/24 artifacts interpreted (75.0%).
    Missing: Leads architecture for a product or platform area; Mentors others on review quality; Defines review standards for the area
```

Without `--target`, readiness checks against the next level above your current
level. To check against a specific level, add the `--target` flag:

```sh
npx fit-landmark readiness --email you@example.com --target J080
```

The missing markers become your concrete growth plan -- each one describes an
observable action you can work toward.

### View skill coverage

See how complete your evidence record is across all expected skills:

```sh
npx fit-landmark coverage --email you@example.com
```

```text
  Evidence coverage for You (you@example.com)

    18/24 artifacts interpreted (75.0%)

    By provenance (evidence rows):
      synthetic_placeholder     0
      artifact_interpreted      14
      agent_attested            5
      human_attested            3

    By type:
      code_review           2/4 interpreted
      design_document       4/5 interpreted
      pull_request          12/15 interpreted
```

Coverage shows how many of your artifacts have been interpreted into
evidence, broken down by provenance label and artifact type. A low
interpreted ratio means the record is thin — focus on getting artifacts
ingested and interpreted before reading too much into any other view.

### When coverage is below the confidence floor

When fewer than 30% of your artifacts are interpreted, Landmark treats the
record as too thin to support conclusions:

- `readiness` suppresses its verdict entirely and prints the coverage figure
  with guidance instead of a checklist.
- `coverage` and `timeline` print a banner — low coverage means the numbers
  reflect a measurement gap, not an absence of growth.

Each suppression names the same way out: add evidence from interpreted
artifacts, run Guide's evaluate-evidence assessment, or have a person attest
markers directly. Once coverage crosses the floor, the full views return.

## Build evidence in the gaps

Now you know exactly which markers are missing. The goal is not to game the
checklist -- it is to do work that naturally demonstrates growth in those areas.

### Use Guide to plan your approach

Ask Guide how to build evidence for a specific missing marker:

```sh
npx fit-guide
```

```text
> How can I build evidence for "Leads architecture for a product or platform
> area"? I'm at working-level Architecture Design and need practitioner.
```

Guide will suggest concrete activities grounded in your standard -- not generic
advice. It knows what your organization defines as practitioner-level
architecture work and can recommend activities that would produce artifacts
Landmark can later interpret.

### Look up marker definitions directly

To see the full set of markers defined for a skill at any proficiency level,
use Landmark's `marker` command:

```sh
npx fit-landmark marker architecture_design
```

This shows all markers across all proficiency levels. Filter to a specific
level:

```sh
npx fit-landmark marker architecture_design --level practitioner
```

Markers are the observable indicators defined in your capability YAML. They
describe what someone at that proficiency level does in practice -- not what
they know in theory. Every marker Landmark checks against is visible here.

### Track progress over time

As you do the work and your artifacts accumulate, track whether your evidence
record is growing:

```sh
npx fit-landmark timeline --email you@example.com
```

```text
  Growth timeline for you@example.com

    2025-Q1     architecture_design  working
    2025-Q2     architecture_design  working
    2025-Q3     architecture_design  practitioner
    2025-Q1     code_review          working
    2025-Q2     code_review          working
```

The timeline shows the highest evidenced proficiency level per skill per
quarter. A level appearing for the first time tells you the evidence record
has caught up to your growth. Filter by skill to focus on one area:

```sh
npx fit-landmark timeline --email you@example.com --skill architecture_design
```

## Verify

You have reached the outcome of this guide when you can answer these questions:

- **What specific skills and behaviours need to grow?** You have asked Guide
  about the gap between your current level and your target, and you can name the
  areas with the largest shifts.
- **Where does your evidence record already show strength?** You have run
  `npx fit-landmark evidence` and `npx fit-landmark readiness` and can identify
  which markers are evidenced and which are still missing.
- **What does the next level look like in practice?** You have looked up
  specific marker definitions with `npx fit-landmark marker` and can describe
  the observable actions your target level expects.
- **Is your evidence growing over time?** You have checked
  `npx fit-landmark timeline` and can see whether recent work is producing
  visible movement.

If any of these are unclear, revisit the relevant step. The readiness checklist
is the most direct measure -- when the missing markers from your first run
start showing as evidenced, you are making progress.

## What's next

<div class="grid">

<!-- part:card:growth-question -->
<!-- part:card:check-progress -->
<!-- part:card:../trust-output -->

</div>
