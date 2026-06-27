---
title: "Get a Second Opinion on a Deliverable"
description: "Know what meets the bar and what falls short before you approve — assessed against your engineering standard, not intuition."
---

You need to assess a specific piece of agent output against your organization's
engineering standard before deciding whether to approve it.

## Prerequisites

Complete the
[Get Output Review Grounded in the Standard](/docs/products/trust-output/)
guide first. The steps below assume you have Guide installed, codegen complete,
and the service stack running.

You should also know the role the agent was configured to perform. If the agent
was set up using
[Agent Teams](/docs/products/agent-teams/), the role coordinates (discipline,
level, and track) are already defined in the agent profile. If not, identify the
closest match before continuing -- Guide needs a role context to ground its
assessment.

## Identify the deliverable

Decide which artifact you want assessed. Guide works with any deliverable you
can describe or paste -- a pull request diff, a design document, a configuration
file, a test plan, or prose output. The more concrete the input, the more
specific the assessment.

For a pull request, copy the diff or provide the PR URL. For a document, have
the text ready to paste into the session.

## Start a Guide session

Launch Guide in interactive mode:

```sh
npx fit-guide
```

Lines starting with `>` in the examples below are prompts you type inside the
Guide session -- they are not shell commands.

## Ask Guide to assess the deliverable

Describe the deliverable, the role the agent was performing, and what you want
assessed. Be specific about the role coordinates -- Guide uses them to look up
the expected skill proficiencies and behaviour maturities for that level.

```text
> An agent configured as a J060 Software Engineering contributor on the
> platform track produced this pull request. Assess whether the work meets
> the expected standard for that role:
>
> [paste diff or describe the deliverable]
```

Guide responds by checking the deliverable against the skill markers and
behaviour expectations defined for that role in your engineering standard:

```text
Assessing against Software Engineering J060 (platform track) expectations:

**Architecture Design (working level expected)**
- The PR introduces a new service boundary. At working level, the standard
  expects designs within a given architecture, not leading architecture
  decisions. This contribution aligns — module placement follows the existing
  service layout without introducing new boundaries.
  Result: meets expectations.

**Code Review readiness (working level expected)**
- Inline comments explain intent, not just what changed. The commit messages
  describe why each change was made.
  Result: meets expectations.

**Testing (working level expected)**
- Unit tests cover the new handler but no integration test verifies the
  service boundary interaction. At working level, the standard expects tests
  for the code you write — an integration test for the new endpoint would
  strengthen this.
  Result: partially meets expectations. Missing integration coverage for the
  new endpoint.

**Own the Outcome (developing maturity expected)**
- The PR description states the problem, links the relevant issue, and
  describes how to verify the change. This demonstrates developing-level
  ownership.
  Result: meets expectations.

Summary: 3 of 4 areas meet the J060 standard. The testing gap is specific
and addressable — add integration coverage for the new endpoint before
approving.
```

Every element in that assessment traces back to your capability YAML and
behaviour definitions. Two people reviewing the same deliverable against the
same standard get the same foundational analysis.

## Narrow the assessment to a specific area

When you already know which area concerns you, ask Guide to focus there:

```text
> Focus on the architecture decisions in this diff. Does the module placement
> match what working-level architecture design looks like in our standard?
```

```text
At working level, Architecture Design expects:
- Designs within a given architecture, following established patterns
- Understands module boundaries without redefining them
- Makes local design decisions that fit the surrounding structure

The diff places the new handler inside the existing service module and follows
the established routing pattern. The data access layer reuses the shared
repository interface. No new architectural boundaries are introduced.

This aligns with working-level expectations. A practitioner-level contribution
would define new module boundaries or introduce integration patterns — this
work stays within the existing structure, which is appropriate for J060.
```

This focused mode is useful when you have already reviewed most of the
deliverable yourself and want a standards-grounded check on one aspect.

## Ask about unfamiliar markers

When Guide references a marker you do not recognize, ask for the full
definition:

```text
> What markers define working-level testing in our standard?
```

Guide returns the markers from your capability YAML for that skill at the
requested proficiency level. This helps you understand exactly what the standard
expects and whether Guide's assessment is well-grounded.

## Use piped input for a quick assessment

When you want a single assessment without entering an interactive session, pipe
your question directly:

```sh
echo "Does this test plan meet J060 testing expectations? [paste plan]" | npx fit-guide
```

Guide prints the assessment and exits. This is useful when you are reviewing
multiple deliverables in sequence and want a fast check on each one.

## Verify

You have reached the outcome of this guide when:

- **You received a standards-grounded assessment.** Guide's response referenced
  specific skill markers and behaviour expectations from your engineering
  standard -- not generic quality advice.
- **You can name what meets the bar and what does not.** The assessment
  identified specific areas where the deliverable aligns with the expected level
  and areas where it falls short, with enough detail to act on.
- **You know what to ask for before approving.** If Guide identified gaps, you
  can describe the specific changes needed in terms the agent (or a human
  contributor) can act on.

For the full workflow -- understanding what to expect from agent output at each
role level and building a systematic review practice -- return to
[Get Output Review Grounded in the Standard](/docs/products/trust-output/).

## What's next

<div class="grid">

<!-- part:card:.. -->
<!-- part:card:../expected-output -->

</div>
