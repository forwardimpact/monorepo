---
title: "Check Progress Toward Next Level"
description: "See whether recent engineering work shows visible movement toward the next level. Review your readiness checklist and growth timeline."
---

You need to check whether your evidence record shows movement toward the bar
for the next level. You do not want to wait for a formal review to find out.

## Prerequisites

Complete
[Get Career Guidance Grounded in the Standard](/docs/products/growth-areas/)
first. That guide covers how to set up Guide and Landmark, how to identify
your gaps, and how to start to build evidence. The steps below assume you
already have an evidence record. They assume you want to measure whether it
grows.

You need:

- `npx fit-landmark` installed and connected to Map's activity layer (see
  [Getting Started: Landmark for Engineers](/docs/getting-started/engineers/landmark/))
- Your email address registered in the organization roster
- At least one round of artifacts ingested (pull requests, design documents, or
  code reviews)

## Check your readiness checklist

The `readiness` command shows a checklist of next-level markers. The checklist
marks which markers your work already evidenced and which ones are still
outstanding:

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

The summary line at the bottom is the quickest signal. Compare the
evidenced/total ratio to your last check. If the ratio grew, recent work
produces visible results. The coverage line at the end shows how much of your
artifact record backs the checklist. When fewer than 30% of your artifacts
are interpreted, `readiness` suppresses the checklist entirely. It then prints
the coverage figure with guidance on how to lift it.

## Review the evidence behind each marker

When a marker shows `[x]`, the readiness output names the artifact that
evidenced it. The full rationale says why Landmark matched that artifact to
that marker. To see it, use the `evidence` command filtered to a specific
skill:

```sh
npx fit-landmark evidence --skill architecture-design --email you@example.com
```

Expected output:

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

    Evidence covers 18/24 artifacts.
```

Each matched row includes a rationale that explains the match. It also
includes a provenance label that names where the evidence came from (see
[Know where each piece of evidence comes from](/docs/products/growth-areas/#know-where-each-piece-of-evidence-comes-from)).
Review the rationales to understand what kind of work Landmark recognizes.
The rationales also show what kind of work is not yet strong enough to match.

## Check your growth timeline

The `timeline` command shows the highest evidenced proficiency level per skill
per quarter. A level that appears for the first time means the evidence record
caught up to growth in that area:

```sh
npx fit-landmark timeline --email you@example.com
```

Expected output:

```text
  Growth timeline for you@example.com

    2025-Q1     architecture-design  working
    2025-Q2     architecture-design  working
    2025-Q3     architecture-design  practitioner
    2025-Q1     code-review          working
    2025-Q2     code-review          working
```

In this example, `architecture-design` moved from `working` to `practitioner`
in Q3. That is a visible shift. The evidence record now reflects growth that
previously existed only in practice.

Filter to a single skill to focus on one area:

```sh
npx fit-landmark timeline --email you@example.com --skill architecture-design
```

If the timeline shows the same proficiency level across multiple quarters with
no change, one of two things happened. The work did not yet produce artifacts
that match the next-level markers. Or nobody ingested the relevant artifacts.
Check whether Landmark processed your recent pull requests and design
documents. When coverage is below 30%, the timeline opens with a banner. The
banner says a flat line reflects the measurement floor. It does not reflect an
absence of growth.

## Look up what the missing markers expect

When the readiness checklist shows outstanding markers, use the `marker` command
to see what the standard defines for that proficiency level:

```sh
npx fit-landmark marker architecture-design --level practitioner
```

```text
  Markers: architecture-design (practitioner)

    - Leads architecture for a product or platform area
    - Defines module boundaries and integration patterns
    - Evaluates architectural trade-offs across multiple dimensions
    - Documents architectural decisions with context and rationale
```

These are the observable indicators your standard defines for that proficiency
level. When you know the full set, you can identify which kinds of work would
naturally produce evidence for the missing markers.

## Verify

You complete this guide when you can answer these questions:

- **Does your evidence record grow?** You ran
  `npx fit-landmark readiness` and compared the evidenced/total ratio to a
  previous check. The ratio changed. Or you understand why it did not.
- **Do you know which markers are still missing?** The readiness summary names
  the outstanding markers. You can describe what each one expects.
- **Can you see the trajectory?** You ran `npx fit-landmark timeline`. You
  can point to at least one skill where the proficiency level changed across
  quarters. Or you identified why no change appears yet.
- **Do you understand the rationale behind matched markers?** You ran
  `npx fit-landmark evidence` for at least one skill. You reviewed the
  rationale for each match.

If any of these are unclear, revisit the relevant step. The readiness checklist
is the most direct measure. Missing markers from a previous check can start to
show as evidenced. Recent work then produces visible movement toward the bar.

## What's next

<div class="grid">

<!-- part:card:.. -->

</div>
