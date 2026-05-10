---
title: Kata Agent Team
description: "An autonomous and continuously improving agentic development team — six agent personas, four workflows, fifteen skills, organized as a Plan-Do-Study-Act loop."
---

> "What does the pattern of the Improvement Kata give us? A means for
> systematically and scientifically working toward a new desired condition, in a
> way that is appropriate for the unpredictability and uncertainty involved."
>
> — Mike Rother, _Toyota Kata_

The **Kata Agent Team** is an autonomous and continuously improving agentic
development team running on GitHub Actions, organized as a daily
**Plan-Do-Study-Act** (PDSA) cycle. Agents plan by writing specs, do by shipping
features and hardening the repo, study their own execution traces and outputs,
and act on findings — closing the loop every day. The name follows Toyota Kata:
agents grasp the current condition (via prior-run traces), establish target
conditions (via specs), and experiment toward them (via implementation). Six
agent personas, four workflows, fifteen skills form this cycle.

This page is the internal-contributor entry point. The canonical reference is
[`KATA.md`](https://github.com/forwardimpact/monorepo/blob/main/KATA.md) at the
repo root — read by every agent at the start of every Kata run. This page
renders that material under the
[Kata brand](https://github.com/forwardimpact/monorepo/blob/main/design/kata/index.md)
for human contributors.

---

## The Six Personas

<div class="grid">

<a class="product-card" href="#staff-engineer">

### Staff Engineer

The drafting bench. Owns the full **spec → design → plan → implement** arc for
approved specs. Plan and Do.

</a>

<a class="product-card" href="#release-engineer">

### Release Engineer

The shipping bay. Keeps PR branches merge-ready, repairs trivial CI, cuts
releases. The sole external merge point. Do.

</a>

<a class="product-card" href="#security-engineer">

### Security Engineer

The night watch. Patches dependencies, hardens supply chain, enforces security
policies. Do, Study, Act.

</a>

<a class="product-card" href="#product-manager">

### Product Manager

The kanban rail. Triages issues, reviews spec quality, runs evaluations. Gates
spec quality off the critical path via the `spec:approved` label. Study, Act.

</a>

<a class="product-card" href="#technical-writer">

### Technical Writer

The archivist's desk. Reviews docs for accuracy, curates wiki, fixes staleness,
files spec gaps. Study, Act.

</a>

<a class="product-card" href="#improvement-coach">

### Improvement Coach

The Ohno circle. Facilitates storyboard meetings and 1-on-1 coaching sessions.
Reads traces. Study.

</a>

</div>

---

## The PDSA Loop

Every workflow belongs to a phase of the **Plan-Do-Study-Act** cycle (after
Deming). Findings from Study always re-enter the loop as specs or fix PRs —
nothing is observed without downstream action.

- **Plan** — Turn approved `spec.md` (WHAT/WHY) into `design.md` (WHICH/WHERE)
  then `plan-a.md` (HOW/WHEN) with steps, files, sequencing, risks.
- **Do** — Execute plans via implementation PRs; run scheduled workflows that
  harden, release, and maintain. Every run captures a trace.
- **Study** — Analyze Do outputs across four streams: security audits, external
  feedback triage, one-topic-deep doc review, one-trace-deep grounded theory.
- **Act** — Trivial findings become **pushed fix PRs**; structural findings
  become `spec.md` documents on **pushed spec branches**. A local commit is not
  a PR — the URL is the only valid completion signal. `fix/` and `spec/`
  branches never mix.

---

## The Trust Boundary

The Release Engineer is the **sole external merge point**. All other merge paths
operate on trusted sources (our agents, Dependabot). The Product Manager gates
spec **quality** off the critical path via the `spec:approved` label.

| External PR type | What merges                     | Who implements                        |
| ---------------- | ------------------------------- | ------------------------------------- |
| `fix` / `bug`    | Contributor's code (small)      | The external contributor              |
| `spec`           | Specification document only     | Trusted agents, never the contributor |
| Everything else  | Nothing — requires human review | N/A                                   |

Top-7 contributors pass the trust gate; `kata-agent-team` PRs are trusted by
identity. A compromised top contributor cannot inject code via this pipeline —
specs merge only the document, not code.

---

## The Workflows

A single scheduled **agent-team** workflow runs the producer → reviewer →
shipper chain three times daily on a Europe/Paris rhythm — 03:00, 12:00, and
20:00 — plus the daily **storyboard** at 08:00, an event-driven
**agent-react** workflow on PR and discussion activity, and an on-demand
**kata-coaching** workflow dispatched manually.

| Workflow            | Schedule (Paris, CEST)        | Agent                                                                                                       |
| ------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **kata-storyboard** | Daily 08:00                   | improvement-coach (facilitates 5 agents)                                                                    |
| **kata-coaching**   | `workflow_dispatch`           | improvement-coach (facilitates 1 agent)                                                                     |
| **agent-team**      | Daily 03:00 · 12:00 · 20:00   | product-manager → staff-engineer → security-engineer → technical-writer → release-engineer → improvement-coach |
| **agent-react**     | On PR/discussion activity     | release-engineer (facilitates 4 agents)                                                                     |

The agent-team matrix runs sequentially in declaration order on every
invocation: the product manager triages and approves spec quality so staff
has a fresh backlog, staff implements, security-engineer reviews code before
it ships, technical-writer reviews docs, release-engineer gates and ships,
improvement-coach reviews the run. Adding or removing an agent is a one-line
edit to the matrix in `.github/workflows/agent-team.yml`.

---

## Coordination Channels

Five channels carry agent-to-agent and agent-to-human collaboration,
distinguished by **time horizon** and **persistence**.

| Channel               | Use for                                                          | Lifetime                        |
| --------------------- | ---------------------------------------------------------------- | ------------------------------- |
| **Wiki**              | Permanent curated memory: summaries, weekly logs, decisions      | Persistent                      |
| **Storyboard**        | Daily current condition and next experiment                      | One day; captured into wiki     |
| **Discussion**        | Open questions before they become decisions — RFCs, cross-policy | Until resolved into spec / wiki |
| **PR / issue thread** | Real-time response on a specific artifact                        | Lives with the artifact         |
| **Sub-agent**         | Specialized inline work within one run                           | Ephemeral (one task)            |

Per-output coordination is governed by
[coordination-protocol.md](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/references/coordination-protocol.md);
shared memory mechanics by
[memory-protocol.md](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/references/memory-protocol.md).

---

## Metrics

Agents record time-series data to `wiki/metrics/{skill}/{YYYY}.csv`
after each run. The CSV schema (six fields: date, metric, value, unit, run,
note), storage convention, and metric design are documented in KATA.md § Metrics.
The storyboard meeting answers "what is the actual condition now?" with numbers,
not narratives, and XmR process behavior charts distinguish stable processes
from special-cause reactions.

---

## Authentication

Workflows authenticate via the **GitHub App** `kata-agent-team`, not a PAT. Each
run generates a 1-hour installation token via `actions/create-github-app-token`
— no long-lived secrets to rotate. The token must generate before
`actions/checkout` so checkout-token writes trigger downstream workflows.

| Permission    | Why                                                          |
| ------------- | ------------------------------------------------------------ |
| Contents      | Checkout, commit, push to `fix/`, `spec/`, release branches  |
| Pull requests | Open, comment, merge PRs (release-engineer, product-manager) |
| Issues        | Triage, label, comment (product-manager)                     |
| Discussions   | Reply on discussions and discussion comments (agent-react)   |
| Workflows     | Token-driven pushes re-trigger downstream workflows          |
| Metadata      | Required by GitHub                                           |

---

## Where Each Agent Lives

| Agent                 | Profile                                                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Staff Engineer**    | [staff-engineer.md](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/staff-engineer.md)       |
| **Release Engineer**  | [release-engineer.md](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/release-engineer.md)   |
| **Security Engineer** | [security-engineer.md](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/security-engineer.md) |
| **Product Manager**   | [product-manager.md](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/product-manager.md)     |
| **Technical Writer**  | [technical-writer.md](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/technical-writer.md)   |
| **Improvement Coach** | [improvement-coach.md](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/improvement-coach.md) |

---

## Further Reading

- **[KATA.md](https://github.com/forwardimpact/monorepo/blob/main/KATA.md)** —
  Canonical reference, read by every agent at the start of every run.
- **[Kata Brand](https://github.com/forwardimpact/monorepo/blob/main/design/kata/index.md)**
  — Brand implementation: palette, typography, motifs, and design tokens.
- **[Kata Scenes](https://github.com/forwardimpact/monorepo/blob/main/design/kata/scenes.md)**
  — Production-floor scenes: storyboard, gemba walk, Ohno circle, andon cord,
  merge gate, drafting bench, shipping bay, archivist's desk, trace tape.
- **[Kata Icons](https://github.com/forwardimpact/monorepo/blob/main/design/kata/icons.md)**
  — Six agent icons and the suite mark.
- **[COALIGNED.md](https://github.com/forwardimpact/monorepo/blob/main/COALIGNED.md)**
  — How `<read_do_checklist>` and `<do_confirm_checklist>` work.
- **[CONTRIBUTING.md](https://github.com/forwardimpact/monorepo/blob/main/CONTRIBUTING.md)**
  — Universal READ-DO and DO-CONFIRM checklists every Kata run runs.

---

> "Without standards, there can be no kaizen."
>
> — Taiichi Ohno
