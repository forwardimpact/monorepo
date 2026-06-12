---
title: "Check Progress Toward Next Level"
description: "See whether recent engineering work shows visible movement toward the next level by reviewing your readiness checklist and growth timeline."
---

You need to check whether your evidence record shows movement toward the bar
for the next level -- without waiting for a formal review to find out.

## Prerequisites

Complete
[Get Career Guidance Grounded in the Standard](/docs/products/growth-areas/)
first. That guide covers setting up Guide and Landmark, identifying your gaps,
and starting to build evidence. The steps below assume you have an existing
evidence record and want to measure whether it is growing.

You need:

- `npx fit-landmark` installed and connected to Map's activity layer (see
  [Getting Started: Landmark for Engineers](/docs/getting-started/engineers/landmark/))
- Your email address registered in the organization roster
- At least one round of artifacts ingested (pull requests, design documents, or
  code reviews)

## Check your readiness checklist

The `readiness` command shows a checklist of next-level markers -- which ones
your work has already evidenced and which are still outstanding:

```sh
npx fit-landmark readiness --email you@example.com
```

Expected output:

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
level. To check against a specific level:

```sh
npx fit-landmark readiness --email you@example.com --target J080
```

The summary line at the bottom is the quickest signal: compare the
evidenced/total ratio to your last check. If the ratio has grown, recent work is
producing visible results. The trailing coverage line shows how much of your
artifact record backs the checklist — when fewer than 30% of your artifacts
are interpreted, `readiness` suppresses the checklist entirely and prints the
coverage figure with guidance on how to lift it instead.

## Review the evidence behind each marker

When a marker shows `[x]`, the readiness output names the artifact that
evidenced it. To see the full rationale -- why Landmark matched that artifact to
that marker -- use the `evidence` command filtered to a specific skill:

```sh
npx fit-landmark evidence --skill architecture_design --email you@example.com
```

Expected output:

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

    Evidence covers 18/24 artifacts.
```

Each matched row includes a rationale explaining the match and a provenance
label naming where the evidence came from (see
[Know where each piece of evidence comes from](/docs/products/growth-areas/#know-where-each-piece-of-evidence-comes-from)).
Reviewing rationales helps you understand what kind of work is being
recognized -- and what kind is not yet strong enough to match.

## Check your growth timeline

The `timeline` command shows the highest evidenced proficiency level per skill
per quarter. A level appearing for the first time means the evidence record has
caught up to growth in that area:

```sh
npx fit-landmark timeline --email you@example.com
```

Expected output:

```text
  Growth timeline for you@example.com

    2025-Q1     architecture_design  working
    2025-Q2     architecture_design  working
    2025-Q3     architecture_design  practitioner
    2025-Q1     code_review          working
    2025-Q2     code_review          working
```

In this example, `architecture_design` moved from `working` to `practitioner`
in Q3. That is a visible shift -- the evidence record now reflects growth that
previously existed only in practice.

Filter to a single skill to focus on one area:

```sh
npx fit-landmark timeline --email you@example.com --skill architecture_design
```

If the timeline shows the same proficiency level across multiple quarters with
no change, either the work has not yet produced artifacts that match the
next-level markers, or the relevant artifacts have not been ingested. Check
whether recent pull requests and design documents have been processed. When
coverage is below 30%, the timeline opens with a banner reminding you that a
flat line reflects the measurement floor, not an absence of growth.

## Look up what the missing markers expect

When the readiness checklist shows outstanding markers, use the `marker` command
to see what the standard defines for that proficiency level:

```sh
npx fit-landmark marker architecture_design --level practitioner
```

```text
  Markers: architecture_design (practitioner)

    - Leads architecture for a product or platform area
    - Defines module boundaries and integration patterns
    - Evaluates architectural trade-offs across multiple dimensions
    - Documents architectural decisions with context and rationale
```

These are the observable indicators your standard defines for that proficiency
level. Knowing the full set helps you identify which kinds of work would
naturally produce evidence for the missing markers.

## Verify

You have completed this guide when you can answer these questions:

- **Is your evidence record growing?** You have run
  `npx fit-landmark readiness` and compared the evidenced/total ratio to a
  previous check. The ratio has changed -- or you understand why it has not.
- **Do you know which markers are still missing?** The readiness summary names
  the outstanding markers, and you can describe what each one expects.
- **Can you see the trajectory?** You have run `npx fit-landmark timeline` and
  can point to at least one skill where the proficiency level has changed across
  quarters -- or you have identified why no change appears yet.
- **Do you understand the rationale behind matched markers?** You have run
  `npx fit-landmark evidence` for at least one skill and reviewed the rationale
  for each match.

If any of these are unclear, revisit the relevant step. The readiness checklist
is the most direct measure -- when missing markers from a previous check start
showing as evidenced, recent work is producing visible movement toward the bar.

## What's next

<div class="grid">

<!-- part:card:.. -->

</div>
