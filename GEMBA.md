# Gemba

> "Go see, ask why, show respect."
>
> — Taiichi Ohno

Gemba is the Forward Impact repo self-maintenance system: autonomous agents
running on GitHub Actions that keep the codebase secure, release-ready, and
steadily improving. The name comes from the Toyota Production System concept
of _genba_ (現場) — "the real place where work happens." Gemba agents walk the
real place (the execution traces of prior runs) and act on what they find.

Within Gemba, **Plan–Do–Study–Act** (PDSA, after Deming) is the improvement
method. Every workflow belongs to a PDSA phase, findings from Study always
re-enter the loop as specs or fix PRs, and the cycle runs on a schedule.
Nine scheduled workflows, five agent personas, and fifteen skills form a
self-reinforcing PDSA cycle. Product evaluation sessions feed the Study phase
with observations from the user's perspective. Gemba maintains the project —
not the engineering frameworks the products serve.

## Architecture

```mermaid
graph TD
    W["Workflows (.github/workflows/)<br/>schedule, trigger, permissions"]
    A["Agents (.claude/agents/)<br/>persona, scope constraints, skill composition"]
    S["Skills (.claude/skills/)<br/>procedures, checklists, domain knowledge"]

    W --> A --> S
```

All workflows use a shared composite action (`.github/actions/claude/`) that
installs Claude Code, runs a prompt against an agent profile, captures the
execution trace as NDJSON, and uploads it as an artifact. Authentication via
GitHub App tokens (see § Authentication).

## The PDSA Loop

The system runs as a continuous **Plan–Do–Study–Act** cycle. Plans are
executed, outputs are studied, findings become new specs, and the cycle
restarts. Each phase produces the artifacts the next phase consumes, forming
a self-reinforcing loop rather than a one-shot pipeline.

```mermaid
graph LR
    P["Plan<br/>plan.md (HOW) for<br/>approved specs"]
    D["Do<br/>implement plans; run<br/>workflows; ship PRs,<br/>issues, releases, traces"]
    S["Study<br/>triage feedback;<br/>analyze traces;<br/>audit posture"]
    A["Act<br/>spec.md (WHAT/WHY)<br/>capturing findings"]

    P --> D --> S --> A --> P
```

### Plan — turn specs into executable plans

Approved specs become concrete plans. Agents use the `gemba-plan` skill to
transform an approved `spec.md` (the WHAT/WHY) into a `plan.md` (the HOW)
with steps, files to change, tests to add, and risks to watch — enough for
any trusted agent to pick up and execute.

### Do — execute plans and run scheduled workflows

The Do phase is where work happens. It has two modes:

- **Implement approved plans** via the `gemba-implement` skill — trusted
  agents open PRs that complete the plan step by step.
- **Run scheduled workflows** that exercise, harden, and release the codebase
  (`security-update`, `release-readiness`, `release-review`,
  `product-backlog`). Each run produces the artifacts the Study phase
  consumes: PRs, tagged releases, audit reports, execution traces, and GitHub
  issues.

Every scheduled run captures a full execution trace — raw evidence for the
Study phase.

### Study — analyze outputs and feedback

The Study phase closes observation over the Do phase. Three study streams
feed the next Act phase:

- **Security engineer** studies the **repository's security posture** —
  supply chain, dependencies, credentials, OWASP Top 10 — in `security-audit`.
- **Product manager** studies **external feedback** — open issues, external
  PRs, contributor activity — in `product-feedback` and `product-backlog`.
  Triages against product alignment, verifies trust, classifies work, and
  gates merges. Product evaluation sessions feed the same stream with
  observations from first-time users.
- **Improvement coach** studies **internal agent behaviour**. Each cycle
  focuses on **one trace** — depth over breadth: select a run → download the
  trace → deep-analyze every turn via grounded theory (open coding → axial
  coding → selective coding) → categorize findings with quoted evidence.

When analyzing a **product-backlog** trace, the coach also verifies that the
product manager performed trust checks on every merged PR (see §
Accountability).

### Act — write new specs

Findings from the Study phase do not fix themselves. The Act phase converts
insight into new inputs for the next cycle:

- **Trivial findings** become fix PRs directly (short-circuit through the
  loop).
- **Structural findings** become new `spec.md` documents capturing WHAT needs
  to change and WHY, written with the `gemba-spec` skill. These enter the
  backlog and start the next Plan phase.

Fix-or-spec discipline keeps mechanical repairs (`fix/` branches) separate
from structural improvements (`spec/` branches) — never mixed in one PR.

## Agents

| Agent                 | Phase          | Purpose                                                                   | Skills                                                                                                                            |
| --------------------- | -------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **staff-engineer**    | Plan, Do       | Own the full spec → plan → implement arc for approved specs               | gemba-plan, gemba-implement, gemba-gh-cli                                                                                          |
| **security-engineer** | Do, Study, Act | Patch dependencies, harden supply chain, enforce security policies        | gemba-security-update, gemba-security-audit, gemba-spec                                                                            |
| **release-engineer**  | Do             | Keep PR branches merge-ready, repair trivial CI on main, cut releases     | gemba-release-readiness, gemba-release-review, gemba-gh-cli                                                                        |
| **product-manager**   | Do, Study, Act | Triage issues and PRs, merge fix/bug/spec PRs, supervise evaluations      | gemba-plan, gemba-product-merge, gemba-product-triage, gemba-product-classify, gemba-product-evaluation, gemba-spec, gemba-gh-cli |
| **improvement-coach** | Study, Act     | Walk traces, audit invariants, fix trivial issues, spec larger ones       | gemba-walk, gemba-grounded-theory-analysis, gemba-trace-audit, gemba-spec, gemba-gh-cli                                            |

Each agent has explicit scope constraints — it knows what it must _not_ do. When
a finding exceeds an agent's scope, it writes a formal spec (`specs/`) rather
than attempting the fix.

## Workflows

Daily pipeline follows the PDSA cycle: **Plan** (04 UTC) → **Do** (05–07 UTC)
→ **Study** (08 UTC) → **Study → Act** (09–11 UTC). Times respect dependencies
(plans before implementation, rebase before merge, merge before release) and
same-agent workflows never overlap.

| Workflow              | Phase       | Schedule                | Agent             | What it does                                                                  |
| --------------------- | ----------- | ----------------------- | ----------------- | ----------------------------------------------------------------------------- |
| **plan-specs**        | Plan        | Daily 04:11 UTC         | staff-engineer    | Pick up approved specs without plans and produce execution-ready plan.md      |
| **implement-plans**   | Do          | Daily 05:07 UTC         | staff-engineer    | Pick up approved plans (`status: planned`) and execute via implement-spec     |
| **security-update**   | Do          | Mon & Thu 05:43 UTC     | security-engineer | Apply security updates: triage Dependabot PRs, address audit findings         |
| **release-readiness** | Do          | Daily 06:23 UTC         | release-engineer  | Rebase open PRs on main, fix lint/format failures, repair main CI if broken   |
| **release-review**    | Do          | Tue, Thu, Sat 07:53 UTC | release-engineer  | Find unreleased changes, bump versions, tag, push, verify publish             |
| **product-backlog**   | Study → Do  | Daily 07:13 UTC         | product-manager   | Classify open PRs by type, verify contributor trust, merge fix/bug/spec PRs   |
| **security-audit**    | Study       | Tue & Fri 08:37 UTC     | security-engineer | Audit supply chain, dependencies, credentials, OWASP Top 10                   |
| **product-feedback**  | Study → Act | Mon, Wed, Fri 09:17 UTC | product-manager   | Triage open issues, implement trivial fixes, write specs for aligned requests |
| **improvement-coach** | Study → Act | Wed & Sat 10:47 UTC     | improvement-coach | Deep-analyze a single random agent trace, open fix PRs or write specs         |

Off-minute schedules avoid API load spikes. All workflows support
`workflow_dispatch`, use concurrency groups, and have a 30-minute timeout.

## Skills

Each skill owns exactly one PDSA phase (or none for utilities). Reading an
agent's skill list reveals its phase coverage at a glance.

All Gemba skills are namespaced with the `gemba-` prefix.

| Skill                              | Phase | Purpose                                                                       |
| ---------------------------------- | ----- | ----------------------------------------------------------------------------- |
| **gemba-plan**                     | Plan  | Write and review plans (HOW); advance approved specs from `review → planned`  |
| **gemba-security-update**          | Do    | Security updates: Dependabot triage, npm audit findings, vulnerability fixes  |
| **gemba-implement**                | Do    | Execute an approved plan step by step; advance `planned → active → done`     |
| **gemba-product-merge**            | Do    | Merge PRs marked mergeable by `gemba-product-classify`                        |
| **gemba-release-readiness**        | Do    | Mechanical PR preparation — rebase, fix, report                               |
| **gemba-release-review**           | Do    | Version bumps, tagging, publish verification                                  |
| **gemba-security-audit**           | Study | Seven-area security review (supply chain, deps, credentials, OWASP, CI)       |
| **gemba-product-triage**           | Study | Classify open issues for product alignment; produce a triage report           |
| **gemba-product-classify**         | Study | Classify open PRs for mergeability — trust, type, CI, spec review             |
| **gemba-product-evaluation**       | Study | Supervise product evaluation sessions, capture feedback, create issues        |
| **gemba-walk**                     | Study | Open-ended trace observation via grounded theory                              |
| **gemba-grounded-theory-analysis** | Study | Qualitative trace analysis adapted from research methodology                  |
| **gemba-trace-audit**              | Study | Verify named per-agent invariants against a trace; quoted evidence required   |
| **gemba-spec**                     | Act   | Write and review specs (WHAT/WHY); manage `draft → review` status             |
| **gemba-gh-cli**                   | —     | GitHub CLI installation and usage patterns for CI (utility, no PDSA phase)    |

## Trust Boundary

Product-backlog is the sole external merge point — every other merge path
operates on trusted sources (our agents, Dependabot). External contributions
pass through a two-tier gate:

| PR type         | What merges                          | Who implements the change           |
| --------------- | ------------------------------------ | ----------------------------------- |
| `fix` / `bug`   | The contributor's code (small patch) | The external contributor            |
| `spec`          | A specification document (WHAT/WHY)  | Trusted agents, not the contributor |
| Everything else | Nothing — PR is skipped              | N/A                                 |

**Trivial fixes** (`fix`, `bug`) from top-20 contributors merge the
contributor's code, gated by CI and trust checks.

**CI app PRs** (`app/forward-impact-ci`) are trusted by identity — the product
manager skips the top-20 lookup and proceeds to type classification and CI.

**Specs** (`spec`) from top-20 contributors merge only the specification
document. Planning and implementation is performed by trusted agents, not the
contributor — even a compromised top contributor cannot inject code through the
autonomous pipeline.

**All other PR types** (features, refactors) require human review.

```mermaid
graph TD
    EXT["External contribution"]
    ISS["GitHub issues"]
    PM["Product Manager<br/>trust gate + CI"]
    CB["Codebase (main)"]
    SE["Security Engineer<br/>Dependabot only"]
    RE["Release Engineer<br/>rebase + release"]

    EXT -- "fix / bug PR" --> PM
    EXT -- "spec PR" --> PM
    PM -- "merge fix/bug code" --> CB
    PM -- "merge spec document" --> CB

    ISS -- "bug report" --> PM
    ISS -- "feature request" --> PM
    PM -- "fix PR (agent-authored)" --> CB
    PM -- "spec PR (agent-authored)" --> CB

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

| Merge point           | Source                    | Trust model                                     |
| --------------------- | ------------------------- | ----------------------------------------------- |
| **plan-specs**        | Agent-authored `plan.md`  | Agent-only, against approved specs              |
| **implement-plans**   | Agent-authored impl PRs   | Agent-only, against approved plans              |
| **security-update**   | Dependabot PRs            | Trusted bot, policy-gated                       |
| **release-readiness** | Agent-authored rebases    | Agent-only, no external input                   |
| **product-backlog**   | External fix/bug PRs      | Top-20 contributor gate + CI                    |
| **product-backlog**   | External spec PRs         | Top-20 gate + CI + spec review                  |
| **product-backlog**   | CI app PRs                | Trusted app identity (`forward-impact-ci`) + CI |
| **release-review**    | Agent-authored tags/bumps | Agent-only, no external input                   |
| **product-feedback**  | Agent-authored fix/spec   | Agent-only, issues as input                     |
| **improvement-coach** | Agent-authored fix/spec   | Agent-only, traces as evidence                  |
| **release-engineer**  | Trivial CI fixes on main  | Agent-only, mechanical fixes only               |

## Design Principles

- **PDSA over pipeline.** Every workflow belongs to a phase of the Plan–Do–
  Study–Act cycle. Findings from Study always re-enter the loop as specs or
  fix PRs — nothing is observed without a downstream action.
- **Fix-or-spec discipline.** Mechanical fixes (`fix/` branches) and structural
  improvements (`spec/` branches) are never mixed in one PR.
- **Explicit scope constraints.** Each agent lists what it must _not_ do.
- **Main branch CI repair.** See CONTRIBUTING.md § Pull Request Workflow for the
  release engineer's direct-to-`main` exception.
- **Trace-driven observability.** Every workflow captures a full execution
  trace. The improvement coach must quote specific evidence — no speculation.
- **Least privilege.** `security-audit` runs `contents: read` only. Write
  workflows use scoped per-run installation tokens.

## Shared Memory

Agents share persistent memory via the repository's **GitHub wiki**, mounted as
a git submodule at `.claude/memory/`. Synced by `just memory-pull` (on
`SessionStart`) and `just memory-push` (on `Stop`).

Each agent maintains two kinds of file:

- A rolling **summary** — `<agent>.md`, latest state (coverage, backlog,
  blockers, observations for teammates).
- A **weekly log** — `<agent>-<YYYY>-W<VV>.md`, keyed by ISO week-year and week
  number (`date +%G-W%V`). One file per agent per week provides continuity
  across the weekly CI cadence without fragmenting context into daily files.

Every scheduled run must read the summary and the current week's log before
acting, append that run's findings to the week's log, and update the summary at
the end. The canonical memory instruction block lives in each agent profile;
skills reference it without restating paths.

## Authentication

Workflows authenticate via a **GitHub App** (`forward-impact-ci`), not a PAT.
Each run generates a short-lived installation token via
`actions/create-github-app-token` — no long-lived secrets to rotate.

Benefits: on-demand tokens (1-hour expiry), distinct bot identity
(`forward-impact-ci[bot]`) for unambiguous audit trails, and one-click setup for
downstream installations (store `CI_APP_ID` and `CI_APP_PRIVATE_KEY` as
repository secrets, or create a custom App and override `app-slug`).

Token generation runs before `actions/checkout` so the checkout token triggers
downstream workflows. The `security-audit` workflow uses `GITHUB_TOKEN` for
checkout (preserving `contents: read` least privilege) and generates a separate
App token for API access.

## Accountability

Cross-agent accountability runs through the `trace-audit` skill. The
improvement coach invokes it on every gemba walk to verify named per-agent
invariants against the actual trace — for example, that the product manager
ran a contributor lookup before marking any non-CI-app PR mergeable. The
canonical invariant list lives in
[.claude/skills/gemba-trace-audit/SKILL.md](.claude/skills/gemba-trace-audit/SKILL.md);
new accountability rules are added there as new specs land, not in this
document. High-severity audit failures must result in a fix PR or spec —
silent acceptance is itself a process failure.

## Authoring Best Practices

Lessons from trace analysis and grounded-theory coding of agent workflow runs.

### Instruction layering

Agent instructions span four layers. Each layer owns a distinct concern — no
layer should restate content from another.

```
libeval system prompt   — relay mechanics (how turns work, completion signal)
       ↓
workflow task            — this run (which product, scenario, success criteria)
       ↓
agent profile            — who you are (persona, voice, skill routing, constraints)
       ↓
skills                   — how to do it (procedures, checklists, templates)
```

**Rules:**

1. **Each layer owns its concern.** No layer restates another's content.
2. **Reference by name, not by content.** Tasks and profiles name skills — they
   do not copy their steps.
3. **Tasks are scenario-specific; skills are reusable.** Shared procedures
   belong in skills; per-run details (which product, success criteria) belong in
   tasks.
4. **Skills may elaborate on system prompt behaviour** but must not contradict
   or copy it verbatim.
5. **Profiles define boundaries; skills define steps.** Prefer one sentence per
   constraint. No MUST/MUST NOT checklists that repeat skill content.
6. **Task texts must activate the full workflow.** Name the complete cycle
   ("Walk the gemba and act on findings"), not just the first phase.

**Common violations:**

| Violation                                   | Symptom                                   |
| ------------------------------------------- | ----------------------------------------- |
| Task restates skill procedures              | Agent follows task wording, skips skill   |
| Task references skills unavailable to agent | Agent stalls searching for missing skill  |
| Profile copies skill checklists             | Tokens wasted parsing redundant text      |
| Skill description parrots system prompt     | Contradictions when system prompt evolves |

### Skill length and progressive disclosure

SKILL.md is the instruction the agent reads on every run. Keep it short — aim
for **~200 lines or fewer**. Long skills waste tokens on boilerplate and
increase the chance the agent skips steps buried deep in the document.

Move supporting material into co-located subdirectories that the agent reads
only when needed:

```
.claude/skills/<skill-name>/
  SKILL.md                     ← core instructions (always loaded)
  scripts/<name>.sh|.mjs       ← executable automation the agent invokes
  references/<name>.md         ← templates, examples, data tables
```

**What belongs in `scripts/`:** Repeatable shell or JS commands that the agent
runs verbatim — installation routines, data extraction queries, discovery
helpers. The SKILL.md documents the script's purpose and invocation; the script
contains the implementation.

**What belongs in `references/`:** Content the agent reads on demand —
comment/PR/issue body templates, report formats, worked examples, data
inventories (e.g. SHA-to-workflow mappings). The SKILL.md names the reference
file and describes when to consult it.

**What stays in SKILL.md:** The decision-making procedure — when to use the
skill, the gate checklist, the process steps, classification criteria, and
memory instructions. If the agent needs it on every run to know _what to do
next_, it belongs in the SKILL.md.

**Guideline, not a hard rule.** Some skills (e.g. `spec` at 179 lines) are
entirely instructional with no templates or scripts to extract — that's fine.
The goal is not to hit a line count but to separate procedure from supporting
material so the core instructions stay scannable.

### Shared patterns must be consistent

Use the same wording for shared structural elements (memory instructions,
prerequisites format, section headings) across all agents and skills.
Inconsistent wording correlated with agents skipping steps in trace analysis.

### resume() must propagate session state

The SDK does not persist `permissionMode` across resume boundaries. Always pass
all session configuration again when calling `resume()`.
