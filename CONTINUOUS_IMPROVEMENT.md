# Continuous Improvement System

> "It is not enough to do your best; you must know what to do, and then do your
> best."
>
> — W. Edwards Deming

This monorepo runs an autonomous continuous improvement system powered by Claude
Code agents on GitHub Actions. Six scheduled workflows, four agent personas, and
eight skills form a closed feedback loop that keeps the codebase secure,
release-ready, and steadily improving — without human intervention for routine
tasks. This is a repo self-maintenance system, not part of the Forward Impact
products — it maintains the project, not the engineering frameworks the products
serve.

## Architecture

Three layers compose the system:

```mermaid
graph TD
    W["Workflows (.github/workflows/)<br/>schedule, trigger, permissions"]
    A["Agents (.claude/agents/)<br/>persona, scope constraints, skill composition"]
    S["Skills (.claude/skills/)<br/>procedures, checklists, domain knowledge"]

    W --> A --> S
```

All workflows use a shared composite action (`.github/actions/claude/`) that
installs Claude Code, configures a bot Git identity, runs a prompt against an
agent profile in non-interactive mode, captures a full execution trace as
NDJSON, and uploads it as a workflow artifact.

## Agents

| Agent                 | Purpose                                                                         | Skills                                        |
| --------------------- | ------------------------------------------------------------------------------- | --------------------------------------------- |
| **security-engineer** | Patch dependencies, harden supply chain, enforce security policies              | dependabot-triage, security-audit, write-spec |
| **release-engineer**  | Keep PR branches merge-ready, repair trivial CI on main, cut releases           | release-readiness, release-review, gh-cli     |
| **improvement-coach** | Deep-analyze agent traces, fix trivial issues, spec larger improvements         | grounded-theory-analysis, write-spec, gh-cli  |
| **product-manager**   | Review PRs for product alignment, verify contributor trust, merge qualified PRs | product-backlog, review-spec, gh-cli          |

Each agent has explicit scope constraints — it knows what it must _not_ do. When
a finding exceeds an agent's scope, it writes a formal spec (`specs/`) rather
than attempting the fix.

## Workflows

| Workflow              | Schedule               | Agent             | What it does                                                                |
| --------------------- | ---------------------- | ----------------- | --------------------------------------------------------------------------- |
| **release-readiness** | Daily 05:23 UTC        | release-engineer  | Rebase open PRs on main, fix lint/format failures, repair main CI if broken |
| **security-audit**    | Every 2 days 04:43 UTC | security-engineer | Audit supply chain, dependencies, credentials, OWASP Top 10                 |
| **dependabot-triage** | Every 3 days 06:17 UTC | security-engineer | Evaluate Dependabot PRs against policy, merge/fix/close                     |
| **release-review**    | Weekly Mon 07:37 UTC   | release-engineer  | Find unreleased changes, bump versions, tag, push, verify publish           |
| **improvement-coach** | Weekly Wed 08:47 UTC   | improvement-coach | Deep-analyze a single random agent trace, open fix PRs or write specs       |
| **product-backlog**   | Daily 09:13 UTC        | product-manager   | Classify open PRs by type, verify contributor trust, merge fix/bug/spec PRs |

All schedules use off-minute values to avoid API load spikes. Every workflow
supports `workflow_dispatch` for manual runs, uses concurrency groups, and has a
30-minute timeout.

## The Feedback Loop

The improvement coach is the meta-agent that closes the loop. Each cycle focuses
on **one trace** — depth over breadth. It:

1. **Selects** a single completed run from the other five workflows (preferring
   failures, but successful runs are valid targets for inefficiency analysis).
2. **Downloads** the execution trace artifact and processes it with `fit-trace`.
3. **Deep-analyzes** every turn, tool call, and result using grounded theory
   methodology (open coding, axial coding, selective coding) — no skimming.
4. **Categorizes** findings as trivial fix, improvement, or observation.
5. **Acts**: trivial fixes become PRs; larger improvements become specs.

When analyzing a **product-backlog** trace, the coach additionally verifies that
the product manager performed trust checks on every merged PR (see §
Accountability below).

This means the system studies its own behaviour and feeds corrections back in —
a PDSA cycle (Plan-Do-Study-Act) running autonomously on a weekly cadence.

```mermaid
graph TD
    IC["Improvement Coach<br/>downloads traces, analyzes, audits trust checks"]
    SE["Security Engineer<br/>audit, triage"]
    RE["Release Engineer<br/>readiness, cuts"]
    PM["Product Manager<br/>backlog, merge"]
    CB["Codebase (main)"]

    IC -- "fix PRs / specs" --> CB
    IC -. "reads traces" .-> SE
    IC -. "reads traces" .-> RE
    IC -. "reads traces" .-> PM
    SE --> CB
    RE --> CB
    PM --> CB
```

## Skills

| Skill                        | Purpose                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------- |
| **security-audit**           | Seven-area security review (supply chain, deps, credentials, OWASP, CI)       |
| **dependabot-triage**        | Policy-based evaluation and action on Dependabot PRs                          |
| **release-readiness**        | Mechanical PR preparation — rebase, fix, report                               |
| **release-review**           | Version bumps, tagging, publish verification                                  |
| **grounded-theory-analysis** | Qualitative trace analysis adapted from research methodology                  |
| **write-spec**               | Spec and plan authoring for changes that exceed agent scope                   |
| **gh-cli**                   | GitHub CLI installation and usage patterns for CI                             |
| **product-backlog**          | PR triage with type classification, contributor verification, and merge gates |

## Trust Boundary

The CI system has a single point where external contributions enter the
codebase: the **product-backlog** workflow. Every other merge point operates on
trusted sources — our own agents acting without external input.

The product-backlog workflow applies a **two-tier gate** that limits what
external contributors can merge directly:

| PR type         | What merges                          | Who implements the change           |
| --------------- | ------------------------------------ | ----------------------------------- |
| `fix` / `bug`   | The contributor's code (small patch) | The external contributor            |
| `spec`          | A specification document (WHAT/WHY)  | Trusted agents, not the contributor |
| Everything else | Nothing — PR is skipped              | N/A                                 |

**Trivial fixes** (`fix`, `bug`) from top-20 contributors merge the
contributor's own code, gated by CI and trust checks. These are small,
mechanical patches where the code diff is the deliverable.

**Specs** (`spec`) from top-20 contributors merge only the specification
document — a description of what should change and why. The spec passes through
an additional `review-spec` quality gate. Critically, **planning and
implementation of approved specs is performed by trusted agents**, not by the
external contributor. The contributor proposes _what_ to change; the system's
own agents decide _how_ and write the code. This separation means that even a
compromised top-20 contributor cannot inject significant code changes through
the autonomous pipeline — they can only propose ideas that trusted agents
evaluate and implement independently.

**Features, refactors, and other significant changes** are never auto-merged.
The product manager skips these PR types entirely, requiring human review.

```mermaid
graph TD
    EXT["External contribution"]
    PM["Product Manager<br/>top-20 gate + CI"]
    CB["Codebase (main)"]
    SE["Security Engineer<br/>Dependabot only"]
    RE["Release Engineer<br/>rebase + release"]

    EXT -- "fix / bug PR" --> PM
    EXT -- "spec PR" --> PM
    PM -- "merge fix/bug code" --> CB
    PM -- "merge spec document" --> CB

    CB -- "spec available" --> TA
    TA["Trusted Agents<br/>plan + implement spec"]
    TA -- "implementation PR" --> CB

    SE -- "merge/tag" --> CB
    RE -- "merge/tag" --> CB

    style PM fill:#f9f,stroke:#333
    style TA fill:#bfb,stroke:#333
    style SE fill:#bbf,stroke:#333
    style RE fill:#bbf,stroke:#333
```

| Merge point           | Source                    | Trust model                                    |
| --------------------- | ------------------------- | ---------------------------------------------- |
| **product-backlog**   | External fix/bug PRs      | Top-20 contributor gate + CI                   |
| **product-backlog**   | External spec PRs         | Top-20 gate + CI + review-spec                 |
| **product-backlog**   | Agent implementation PRs  | Top-20 gate + CI (agents are top contributors) |
| **dependabot-triage** | Dependabot PRs            | Trusted bot, policy-gated                      |
| **release-readiness** | Agent-authored rebases    | Agent-only, no external input                  |
| **release-review**    | Agent-authored tags/bumps | Agent-only, no external input                  |
| **release-engineer**  | Trivial CI fixes on main  | Agent-only, mechanical fixes only              |
| **improvement-coach** | Agent-authored fix/spec   | Agent-only, traces as evidence                 |

This design concentrates external-contribution risk at a single auditable point
and limits external influence to small patches and proposals. Significant code
changes always pass through trusted agents — even when the original idea came
from outside. The improvement coach is responsible for verifying that the
product manager performed trust checks on every merged PR (see § Accountability
below).

## Design Principles

**Single external merge point.** Only the product-backlog workflow merges
external contributions. All other workflows operate on trusted sources (our own
agents, Dependabot). This constraint simplifies security auditing — there is
exactly one place to verify that contributor trust was checked.

**Fix-or-spec discipline.** Every agent separates mechanical fixes (`fix/`
branches) from structural improvements (`spec/` branches). No agent mixes the
two in a single PR.

**Spec-to-implementation handoff.** External contributors may propose specs, but
trusted agents always perform the planning and implementation. This ensures that
significant code changes are authored by agents operating within the system's
scope constraints and trace-driven accountability — never by unaudited external
code.

**Explicit scope constraints.** Each agent definition lists what it must not do.
The release engineer never resolves substantive merge conflicts. The security
engineer never weakens existing policies. The improvement coach never speculates
without trace evidence.

**Main branch CI repair.** The release engineer is the only agent allowed to
push directly to `main`, and only for trivial CI fixes — formatting, lint, and
lock file drift that `npm run check:fix` resolves. Without this privilege, a
single formatting regression on `main` would cause every rebased PR to inherit a
failing Quality workflow, creating permanent release blockage. The scope is
strictly mechanical: if `npm run check:fix` does not resolve the failure, the
release engineer must stop and report rather than attempt code-level fixes.

**Trace-driven observability.** Every workflow captures a full execution trace
as an artifact, giving the improvement coach (and humans) complete visibility
into what each agent did and why.

**Grounded findings.** The improvement coach must quote specific tool calls,
error messages, or token counts from traces. Speculation without evidence is
prohibited.

**Least privilege.** The security-audit workflow runs with `contents: read`
only. Workflows that need to push use `contents: write` with a scoped token.

## Accountability

The **improvement coach** is responsible for auditing the product manager's
trust verification. When analyzing a product-backlog trace, the coach must
check:

1. **Every merged PR had a contributor lookup** — the trace must show a
   `gh api repos/{owner}/{repo}/contributors` call before each merge.
2. **The author was verified against the result** — the trace must show the
   author login being compared to the contributor list.
3. **No merge happened without both checks** — if a PR was merged without a
   visible trust verification, this is a **high-severity finding**.

If trust verification is missing or incomplete, the improvement coach must open
a fix PR or spec to correct the gap. This is the mechanism that holds the
product manager accountable — trace evidence, not trust.
