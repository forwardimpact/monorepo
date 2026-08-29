---
title: "Get Career Guidance Grounded in the Standard"
description: "A promotion conversation ended with 'not yet' and no specifics. Use Guide and Landmark to find what is missing and show concrete evidence of growth."
---

The promotion conversation ended with "not yet". Nobody could point to the
specific evidence that would change the answer. The feedback felt subjective.
You left without a clear picture of what to work on or how to show progress.

This guide shows you how to find the specific gaps between where you are and
where you need to be. It then shows you how to build a visible evidence record
that grounds the next conversation in facts. The other half of this job is to
review a deliverable against the same standard. See
[Get Output Review Grounded in the Standard](/docs/products/trust-output/).

Two products work together in this workflow. **Guide** is an AI agent that
reasons about your organization's engineering standard. It identifies gaps. It
gives career advice grounded in your actual skill and behaviour definitions.
**Landmark** reads your engineering artifacts (pull requests, design documents,
code reviews) and shows which standard markers your work evidences. Together
they replace subjective impressions with specific, standards-grounded answers.

## Prerequisites

This guide assumes you completed the setup for both products:

- [Getting Started: Guide for Engineers](/docs/getting-started/engineers/guide/)
  -- install Guide, run codegen, authenticate with Anthropic, process your
  standard data, and start the service stack.
- [Getting Started: Landmark for Engineers](/docs/getting-started/engineers/landmark/)
  -- install Landmark and confirm access to Map's activity layer.

Also know your role coordinates (discipline, level, and track). If you do not
know them yet, work through
[See What's Expected at Your Level](/docs/products/career-paths/) first. That
guide covers how to find your coordinates. It also explains what your current
level expects.

## Ask Guide what's missing

First, ask Guide what the gap looks like between your current level and your
target. Guide reads your organization's skill definitions, behaviour
expectations, and markers. It returns specific areas grounded in your standard.
It does not return generic career advice.

Start Guide and ask a growth question. Lines that start with `>` are prompts
you type inside the Guide session:

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

You can also pipe a question directly and skip the interactive session:

```sh
echo "What markers define practitioner-level architecture design?" | npx fit-guide
```

Guide references the specific markers from your capability YAML. These are the
same observable indicators that Landmark uses to match evidence.

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

Your organization's definitions ground each answer. Two people who ask the same
question get the same foundational answer. They share one source of truth.

## Check your evidence record

Guide tells you what to work on. Landmark tells you what your engineering record
already shows. Before you build new evidence, see where you stand.

### See which markers your work evidences

```sh
npx fit-landmark evidence --email you@example.com
```

```text
  Evidence

    architecture-design: 3 matched, 1 unmatched
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

    code-review: 2 matched, 0 unmatched
      [matched] Provides actionable feedback on design intent, not just style
        rationale: Review of a recent pull request identified a coupling risk between...
        provenance: artifact_interpreted
      [matched] Catches cross-cutting concerns during review
        rationale: Review of a recent pull request flagged a missing audit trail...
        provenance: agent_attested

    Evidence covers 18/24 artifacts.
```

Each row shows the marker it matched, the rationale for the match, and a
provenance label that names where the evidence came from. Filter by skill to
focus on a specific gap:

```sh
npx fit-landmark evidence --skill architecture-design --email you@example.com
```

### Know where each piece of evidence comes from

Every evidence row carries one of four provenance labels. They matter when
you bring the record to a promotion conversation. Evidence interpreted from
real artifacts carries more weight than placeholder rows:

| Provenance              | Where the row came from                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| `artifact_interpreted`  | Landmark matched the row directly from an ingested artifact (pull request, design document, code review) |
| `agent_attested`        | Guide wrote the row after a deeper evaluation of your artifacts against a marker         |
| `human_attested`        | A person recorded the row to attest the marker. Rows written before provenance tracking also default to this label |
| `synthetic_placeholder` | The demo generator created the row from synthetic data. It is not evidence of real work  |

The `coverage` command (below) breaks your record down by these labels. You can
then see how much of the record rests on interpreted artifacts and how much
rests on placeholders.

### Check promotion readiness

See a checklist of next-level markers. The checklist shows which ones you
already evidenced and which ones are still outstanding:

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

The missing markers become your concrete growth plan. Each one describes an
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
      code-review           2/4 interpreted
      design_document       4/5 interpreted
      pull_request          12/15 interpreted
```

Coverage shows how many of your artifacts Landmark interprets into evidence. It
breaks the count down by provenance label and artifact type. A low interpreted
ratio means the record is thin. Ingest and interpret more artifacts
before you rely on any other view.

### When coverage is below the confidence floor

When Landmark interprets fewer than 30% of your artifacts, it treats the
record as too thin to support conclusions:

- `readiness` suppresses its verdict entirely and prints the coverage figure
  with guidance instead of a checklist.
- `coverage` and `timeline` print a banner. Low coverage means the numbers
  reflect a measurement gap. It does not mean growth is absent.

Each suppression names the same way out: add evidence from interpreted
artifacts, run Guide's evaluate-evidence assessment, or have a person attest
markers directly. Once coverage crosses the floor, the full views return.

## Build evidence in the gaps

Now you know exactly which markers are missing. Do work that naturally
demonstrates growth in those areas. Do not game the checklist.

### Use Guide to plan your approach

Ask Guide how to build evidence for a specific missing marker:

```sh
npx fit-guide
```

```text
> How can I build evidence for "Leads architecture for a product or platform
> area"? I'm at working-level Architecture Design and need practitioner.
```

Guide suggests concrete activities grounded in your standard. It does not give
generic advice. It knows what your organization defines as practitioner-level
architecture work. It can recommend activities that produce artifacts Landmark
can later interpret.

### Look up marker definitions directly

To see the full set of markers defined for a skill at any proficiency level,
use Landmark's `marker` command:

```sh
npx fit-landmark marker architecture-design
```

This shows all markers across all proficiency levels. Filter to a specific
level:

```sh
npx fit-landmark marker architecture-design --level practitioner
```

Markers are the observable indicators defined in your capability YAML. They
describe what someone at that proficiency level does in practice. They do not
describe what that person knows in theory. Every marker Landmark checks against
is visible here.

### Track progress over time

As you do the work and your artifacts accumulate, track whether your evidence
record grows:

```sh
npx fit-landmark timeline --email you@example.com
```

```text
  Growth timeline for you@example.com

    2025-Q1     architecture-design  working
    2025-Q2     architecture-design  working
    2025-Q3     architecture-design  practitioner
    2025-Q1     code-review          working
    2025-Q2     code-review          working
```

The timeline shows the highest evidenced proficiency level per skill per
quarter. A level that appears for the first time tells you the evidence record
caught up to your growth. Filter by skill to focus on one area:

```sh
npx fit-landmark timeline --email you@example.com --skill architecture-design
```

## Verify

You reach the outcome of this guide when you can answer these questions:

- **What specific skills and behaviours need to grow?** You asked Guide about
  the gap between your current level and your target. You can name the areas
  with the largest shifts.
- **Where does your evidence record already show strength?** You ran
  `npx fit-landmark evidence` and `npx fit-landmark readiness`. You can identify
  which markers are evidenced and which are still missing.
- **What does the next level look like in practice?** You looked up specific
  marker definitions with `npx fit-landmark marker`. You can describe the
  observable actions your target level expects.
- **Does your evidence grow over time?** You checked
  `npx fit-landmark timeline`. You can see whether recent work produces visible
  movement.

If any of these are unclear, revisit the relevant step. The readiness checklist
is the most direct measure. When the missing markers from your first run show
as evidenced, you make progress.

## What's next

<div class="grid">

<!-- part:card:growth-question -->
<!-- part:card:check-progress -->
<!-- part:card:../trust-output -->

</div>
