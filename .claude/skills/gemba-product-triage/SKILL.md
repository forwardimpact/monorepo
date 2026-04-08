---
name: gemba-product-triage
description: >
  Classify open GitHub issues by product alignment and decide what action
  each needs — trivial fix, spec, or out-of-scope. Produce a triage report
  for the agent to act on. Does not implement fixes or write specs itself.
---

# Product Issue Triage

Triage open GitHub issues against the product vision and decide the appropriate
action for each — but do not take it. The triage produces a report; the agent
then uses follow-up skills (`gemba-spec` for features, direct git operations for
trivial fixes) to execute on the recommendations.

This is the Study half of the product feedback loop. The Act half lives in the
agent's workflow, calling `gemba-spec` or making fix PRs directly based on the
triage decisions captured here.

## When to Use

- Reviewing open issues for product alignment on a schedule
- On-demand when specific issues need a product decision
- Before any action is taken on an issue

## Prerequisites

See [`gemba-gh-cli`](../gemba-gh-cli/SKILL.md) for `gh` installation and the
canonical query shapes used in the steps below.

All comment templates are in `references/templates.md`.

## Classification

| Category            | Criteria                                              | Recommended action                    |
| ------------------- | ----------------------------------------------------- | ------------------------------------- |
| **Trivial fix/bug** | Clear bug or small fix with obvious resolution        | Fix PR (direct git ops, no spec)      |
| **Product-aligned** | Feature/improvement serving the product vision        | Write spec via the `gemba-spec` skill |
| **Out of scope**    | Not aligned, unclear, duplicate, or already addressed | Comment + label `triaged`/`wontfix`   |

## Product Vision Alignment

Use CLAUDE.md and JTBD.md to determine alignment. The six products:

| Product      | Question it answers                               |
| ------------ | ------------------------------------------------- |
| **Map**      | What does good engineering look like here?        |
| **Pathway**  | Where does my career path go from here?           |
| **Basecamp** | Am I prepared for what's ahead today?             |
| **Guide**    | How do I find my bearing?                         |
| **Landmark** | What milestones has my engineering reached?       |
| **Summit**   | Is this team supported to reach peak performance? |

An issue is product-aligned if it describes a need one of these products should
address for its users (Leadership, Engineers, or Agents).

## Process

### Step 0: Read Memory

Read memory per the agent profile (your summary, the current week's log, and
teammates' summaries). Extract issues previously processed and recurring themes
from prior `product-manager` entries.

### Step 1: List Open Issues

```sh
gh issue list --state open --limit 50 \
  --json number,title,body,author,labels,createdAt,updatedAt \
  --jq '.[] | {number, title, author: .author.login, labels: [.labels[].name], created: .createdAt}'
```

Skip issues with `triaged` or `wontfix` labels.

### Step 2: Read and Classify Each Issue

```sh
gh issue view <number> --json title,body,comments,labels,author
```

Classify against the table above. Record reasoning briefly so a future run can
audit the decision.

### Step 3: Produce the Triage Report

For each issue, record: number, title, category, recommended action, and a
one-line rationale. The report is the deliverable of this skill.

### Step 4: Hand Off

The triage report is consumed by the calling agent, which then takes action:

- **Trivial fix/bug** → make the fix on a `fix/<short-name>` branch from `main`,
  run `bun run check` and `bun run test`, open a PR. Templates in
  `references/templates.md` § Fix PRs. Label the issue `triaged`.
- **Product-aligned** → invoke the `gemba-spec` skill to draft a spec,
  referencing the issue. Label the issue `triaged`.
- **Out of scope** → comment with explanation per `references/templates.md` §
  Issue Comments and apply the appropriate label.

This skill stops at the report. Do not implement fixes or write specs from
within gemba-product-triage — the phase boundary matters.

## Memory: What to Record

Append to the current week's log (see agent profile for the file path):

- **Issue triage table** — Each issue with category, action, and rationale
- **Recurring themes** — Patterns across issues, with frequency and alignment
- **Hand-offs** — Which follow-up skills were invoked for which issues
