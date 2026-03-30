# Continuous Improvement System

> "It is not enough to do your best; you must know what to do, and then do your
> best."
>
> — W. Edwards Deming

This monorepo runs an autonomous continuous improvement system powered by Claude
Code agents on GitHub Actions. Five scheduled workflows, three agent personas,
and seven skills form a closed feedback loop that keeps the codebase secure,
release-ready, and steadily improving — without human intervention for routine
tasks.

## Architecture

Three layers compose the system:

```
Workflows (.github/workflows/)     ← schedule, trigger, permissions
  └─ Agents (.claude/agents/)      ← persona, scope constraints, skill composition
       └─ Skills (.claude/skills/) ← procedures, checklists, domain knowledge
```

All workflows use a shared composite action (`.github/actions/claude/`) that
installs Claude Code, configures a bot Git identity, runs a prompt against an
agent profile in non-interactive mode, captures a full execution trace as
NDJSON, and uploads it as a workflow artifact.

## Agents

| Agent                 | Purpose                                                                 | Skills                                        |
| --------------------- | ----------------------------------------------------------------------- | --------------------------------------------- |
| **security-engineer** | Patch dependencies, harden supply chain, enforce security policies      | dependabot-triage, security-audit, write-spec |
| **release-engineer**  | Keep PR branches merge-ready, cut releases, verify publish workflows    | release-readiness, release-review, gh-cli     |
| **improvement-coach** | Deep-analyze agent traces, fix trivial issues, spec larger improvements | grounded-theory-analysis, write-spec, gh-cli  |

Each agent has explicit scope constraints — it knows what it must _not_ do. When
a finding exceeds an agent's scope, it writes a formal spec (`specs/`) rather
than attempting the fix.

## Workflows

| Workflow              | Schedule               | Agent             | What it does                                                          |
| --------------------- | ---------------------- | ----------------- | --------------------------------------------------------------------- |
| **release-readiness** | Daily 05:23 UTC        | release-engineer  | Rebase open PRs on main, fix lint/format failures, report status      |
| **security-audit**    | Every 2 days 04:43 UTC | security-engineer | Audit supply chain, dependencies, credentials, OWASP Top 10           |
| **dependabot-triage** | Every 3 days 06:17 UTC | security-engineer | Evaluate Dependabot PRs against policy, merge/fix/close               |
| **release-review**    | Weekly Mon 07:37 UTC   | release-engineer  | Find unreleased changes, bump versions, tag, push, verify publish     |
| **improvement-coach** | Weekly Wed 08:47 UTC   | improvement-coach | Deep-analyze a single random agent trace, open fix PRs or write specs |

All schedules use off-minute values to avoid API load spikes. Every workflow
supports `workflow_dispatch` for manual runs, uses concurrency groups, and has a
30-minute timeout.

## The Feedback Loop

The improvement coach is the meta-agent that closes the loop. Each cycle focuses
on **one trace** — depth over breadth. It:

1. **Selects** a single completed run from the other four workflows (preferring
   failures, but successful runs are valid targets for inefficiency analysis).
2. **Downloads** the execution trace artifact and processes it with `fit-trace`.
3. **Deep-analyzes** every turn, tool call, and result using grounded theory
   methodology (open coding, axial coding, selective coding) — no skimming.
4. **Categorizes** findings as trivial fix, improvement, or observation.
5. **Acts**: trivial fixes become PRs; larger improvements become specs.

This means the system studies its own behaviour and feeds corrections back in —
a PDSA cycle (Plan-Do-Study-Act) running autonomously on a weekly cadence.

```
┌─────────────────────────────────────────────────────┐
│                 Improvement Coach                    │
│        downloads traces, analyzes, acts              │
└──────────┬───────────────────────────┬──────────────┘
           │ fix PRs / specs           │ reads traces
           ▼                           │
┌──────────────────┐   ┌──────────────────┐
│ Security Engineer│   │ Release Engineer  │
│  audit, triage   │   │  readiness, cuts  │
└────────┬─────────┘   └────────┬─────────┘
         │                      │
         └──────────┬───────────┘
                    ▼
              Codebase (main)
```

## Skills

| Skill                        | Purpose                                                                 |
| ---------------------------- | ----------------------------------------------------------------------- |
| **security-audit**           | Seven-area security review (supply chain, deps, credentials, OWASP, CI) |
| **dependabot-triage**        | Policy-based evaluation and action on Dependabot PRs                    |
| **release-readiness**        | Mechanical PR preparation — rebase, fix, report                         |
| **release-review**           | Version bumps, tagging, publish verification                            |
| **grounded-theory-analysis** | Qualitative trace analysis adapted from research methodology            |
| **write-spec**               | Spec and plan authoring for changes that exceed agent scope             |
| **gh-cli**                   | GitHub CLI installation and usage patterns for CI                       |

## Design Principles

**Fix-or-spec discipline.** Every agent separates mechanical fixes (`fix/`
branches) from structural improvements (`spec/` branches). No agent mixes the
two in a single PR.

**Explicit scope constraints.** Each agent definition lists what it must not do.
The release engineer never resolves substantive merge conflicts. The security
engineer never weakens existing policies. The improvement coach never speculates
without trace evidence.

**Trace-driven observability.** Every workflow captures a full execution trace
as an artifact, giving the improvement coach (and humans) complete visibility
into what each agent did and why.

**Grounded findings.** The improvement coach must quote specific tool calls,
error messages, or token counts from traces. Speculation without evidence is
prohibited.

**Least privilege.** The security-audit workflow runs with `contents: read`
only. Workflows that need to push use `contents: write` with a scoped token.
