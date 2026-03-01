---
title: Landmark
description: See your own growth — observable markers for engineering practice, reflecting your work against the skills that matter.
layout: product
toc: false
hero:
  subtitle: See your own growth. Landmark is a GitHub App that collects engineering activity and reflects it against your framework — helping engineers see their own evidence and helping organizations improve the systems that support great practice.
  cta:
    - label: Read the spec
      href: https://github.com/forwardimpact/monorepo/tree/main/specs/landmark
    - label: Coming soon
      href: /docs/
      secondary: true
---

> The evidence is already there — in pull requests, code reviews, design
> documents, architecture decisions. Landmark makes it visible. Not to judge
> individuals, but to help engineers reflect on their own growth and to help
> organizations see whether their engineering systems create the conditions for
> that growth to happen.

### What you get

- GitHub activity collected automatically — PRs, reviews, commits, discussions
- Personal evidence for every engineer, private and self-directed
- Practice patterns across teams — anonymous, aggregate, process-focused
- Skill markers that connect real work to framework expectations
- Guide-powered interpretation with visible rationale
- Full event replay — raw data is immutable, extraction logic can evolve

---

### Who it's for

**Engineers** who want to see their own growth reflected in the work they
already do — not scores or dashboards, but real artifacts with context. Evidence
you can bring to career conversations on your own terms.

**Engineering leaders** who want to improve the systems that support good
practice. When a skill shows weak evidence across a team, the question is always
"does our process support this?" — not "who isn't doing this?"

---

## Two Views

### Personal Evidence

An engineer sees their own artifacts reflected against the markers for their
role. Nobody else sees this view unless the engineer shares it.

```
$ fit-landmark evidence --skill system_design

  Your evidence: System Design (working level)

  PR #342 "Redesign authentication flow"
    Design doc with component diagram in PR description. Approved by two
    reviewers without structural rework.
    → relates to: design doc accepted without senior rewrite

  PR #342 review thread
    Resolved caching vs. session debate. Posted trade-off comparison and
    the team converged on session approach.
    → relates to: led a discussion that resolved a design disagreement
```

### Practice Patterns

Engineering leadership sees aggregate patterns across a team. No individuals
named. Minimum team size of 5 to prevent identification.

```
$ fit-landmark practice system_design --team platform

  System Design practice — Platform team (last quarter)

  Strong evidence:
    Design documents in PRs — most feature PRs include architecture sections
    Review quality — review threads regularly discuss design rationale

  Weak evidence:
    Trade-off analysis — few PRs document multiple approaches considered
    Consider: do engineers have time for design exploration before
    implementation begins?
```

---

## How It Works

Landmark is a GitHub App with three phases:

1. **Ingestion** — real-time webhook events stored as immutable raw payloads
2. **Extraction** — scheduled jobs parse structured artifacts from raw events
3. **Interpretation** — Guide reads artifacts against skill markers on demand

```
GitHub Events → Collector (deterministic) → Guide (interpretation) → Evidence
```

The collector is cheap, repeatable, and auditable. The interpretation is an LLM
judgement — visible and reviewable. The engineer sees not just "this artifact
relates to this marker" but Guide's rationale for why.

---

### Stay Updated

Landmark is currently in development. The foundation is being built across Map
(skill markers), Guide (interpretation), and Pathway (career progression). When
these are mature, Landmark will bring evidence from real engineering work into
the picture.
