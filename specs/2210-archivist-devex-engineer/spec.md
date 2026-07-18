# Spec 2210: Archivist and DevEx Engineer agents

**Classification:** Internal. Every change lands under `.claude/` (two agent
profiles, two skills, the approval-signal catalogue, the `kata-review`
caller-protocol reference), `KATA.md`, the `kata-shift` workflow, and the
`websites/kata/` enumeration consumers. Nothing lands under `products/` or
`services/`.

**Persona / job:** Teams Using Agents — *Run a Continuously Improving Agent
Team* ([JTBD.md](../../JTBD.md)). Both agents defend the long-run effectiveness
of the Kata team itself.

## Problem

Two standing maintenance responsibilities have no owner in the current
six-persona roster. Left unowned, both compound with every shift.

### Spec and wiki accumulation

- Completed and cancelled spec directories persist under `specs/` indefinitely;
  the tree only grows (`ls specs/`). STATUS.md keeps one small row per spec as
  the permanent ledger — that ledger is intentional and is not the bloat; the
  directories are.
- Weekly agent logs are append-only, one file per agent per ISO week, with no
  rotation — unbounded growth. Monthly storyboards accumulate the same way.
- The technical writer's wiki curation enforces *hygiene* — contract audit,
  claims, teammate observations, MEMORY.md currency — and rotates a log only
  when it breaches its size budget. No agent does *time-based retention*:
  nothing retires a past-week log or past-month storyboard by age, or archives a
  completed spec.
- Effect: every agent's on-boot read set and every repository-wide search grows,
  raising context cost and lowering signal for all agents.

### Codebase cleanliness and technical debt

- The security engineer audits security and the technical writer audits docs.
  No agent owns code health — dead code paths, inconsistency, duplication, and
  accumulating debt.
- Review panels grade one artifact at a time for the correctness of that
  change. No standing owner performs a deep-dive codebase-health review the way
  the security audit sweeps security posture one topic per run.
- Effect: debt and inconsistency slow every agent invocation, and the
  simplicity differentiator stated in [KATA.md](../../KATA.md) erodes without an
  owner.

Both problems work against the stated aim — improve performance, quality, and
output — by taxing every downstream agent invocation.

## Proposal

Add two agents to the roster, each following the established profile shape
(persona, voice, session protocol, assess ladder, scope constraints) and each
equipped with one new skill plus the shared `kata-spec`, `kata-review`, and
`kata-session` skills already used across the roster.

### Archivist

- **Phases:** Study (detect stale artifacts) and Act (remove them). The new
  `kata-archive` skill owns the Study phase; removal is the agent's Act
  responsibility, reusing existing write paths — it needs no second skill.
- **Owns** lifecycle retention of time-bounded artifacts: completed and
  cancelled specs under `specs/`, past-week agent logs, and past-month
  storyboards.
- **Retention outcome:** before any artifact is removed, its durable signal is
  preserved in the owning summary or index; removal stays recoverable through
  version history. How the signal is folded and which threshold counts as stale
  are design and plan concerns.
- **Two write targets, two authorizations** — the spec keeps these distinct
  because they touch different repositories under different rules:

  | Target                                  | Repository          | Authorization                                                                 |
  | --------------------------------------- | ------------------- | ----------------------------------------------------------------------------- |
  | Past-week logs, past-month storyboards  | `wiki/` (separate)  | Acted on directly during scheduled shifts, like all agent memory writes        |
  | Completed / cancelled specs             | `specs/` on `main`  | Landed via a routine retention PR through the release-engineer merge gate       |

  This preserves the trust boundary: the release engineer stays the sole agent
  that pushes to `main`, so the Archivist opens a retention PR the release
  engineer merges — it never pushes to `main` itself — while wiki retention
  rides the ordinary memory-write path every agent already uses.
- **Retention PR is a new approval class.** A retention PR carries no spec
  phase, so the STATUS phase gate does not apply to it. Its authorizing signal
  is a product-manager review approval — the product manager confirms the
  targets are terminal and their durable signal was preserved — after which the
  release engineer merges, with no human review. This adds one agent-originated
  signal to the approval-signal catalogue, alongside the existing plan
  panel-clean signal; it does not touch the human-only rule, which continues to
  govern spec and design approval. Where the signal is recorded and how the gate
  identifies a retention PR are design concerns.
- **Boundary with the technical writer** — split by artifact lifecycle, so the
  two never contend for the same file:

  | Owner            | Owns                                                          |
  | ---------------- | ------------------------------------------------------------ |
  | Archivist        | Past-week weekly logs, past-month storyboards, terminal specs |
  | Technical writer | MEMORY.md, active claims, current summaries, observations     |

- **STATUS.md is never trimmed by the Archivist.** When a terminal spec
  directory is archived, its STATUS.md ledger row remains as the permanent
  record.

### DevEx Engineer

- **Phases:** Do (review-panel participation), Study (deep-dive audits), and Act
  (mechanical fixes and specs) — the same phase set as the security engineer.
  The new `kata-devex-audit` skill owns the Study phase; panel participation
  reuses `kata-review`, so the Do phase needs no new skill.
- **On shifts:** performs deep-dive codebase-health reviews (dead code paths,
  inconsistency, duplication, accumulating debt), one area per run against a
  coverage map so no area is neglected — the same shape the security audit uses
  for security posture.
- **Joins the review panels as a new, separate panel** on design, plan, and
  implementation reviews, carrying its own reviewer role and panel size. It is
  not a lens folded into the technical panel.
- **Boundary with the technical and security panels:** the technical panel
  grades whether the change under review is correct and sound; the security
  engineer owns security; the DevEx panel judges maintainability, consistency,
  and debt independent of whether the change is correct.

### New skills — minimal set

| Skill              | Phase | Purpose                                                                        |
| ------------------ | ----- | ------------------------------------------------------------------------------ |
| `kata-archive`     | Study | Detect retention candidates, preserve durable signal, remove stale artifacts    |
| `kata-devex-audit` | Study | Deep-dive codebase-health review, one area per run, against a coverage map      |

Both agents reuse the shared `kata-spec`, `kata-review`, and `kata-session`
skills, so no further skills are added. Panel participation needs no new skill —
it reuses `kata-review`; adding the DevEx panel is a caller-protocol change.

## Scope

Components changed:

| Component                                | Change                                                       |
| ---------------------------------------- | ------------------------------------------------------------ |
| Archivist agent profile                  | New profile: persona, assess ladder, retention scope limits   |
| DevEx Engineer agent profile             | New profile: persona, audit assess ladder, cleanup limits     |
| `kata-archive` skill                     | New Study-phase skill                                         |
| `kata-devex-audit` skill                 | New Study-phase skill                                         |
| `kata-review` caller-protocol reference  | Add the DevEx panel (role, size) for design/plan/implement    |
| Product-manager profile                  | Grant authority to approve retention PRs; scope its human-only / never-originate-approval constraint to spec and design |
| `kata-release-merge` skill               | Recognize the retention-PR class and product-manager approval as its merge signal |
| Approval-signal catalogue                | `x-approval-signals` and `KATA.md` § Approval Signal / § Trust Boundary gain the retention-PR product-manager signal |
| `KATA.md`                                | Roster table, skills enumeration block, `kata-shift` roster sequence and the `kata-storyboard` facilitation count in § Workflows, and the hand-maintained persona-count prose ("Six personas") |
| `websites/kata/index.md`, `llms.txt`     | `published-skills` enumeration count consumers, plus the hand-maintained agent-count prose ("Six agents") |
| `kata-shift` workflow                    | Add both agents to the shift roster matrix                   |

Excluded:

- No changes under `products/` or `services/`.
- No change to the technical writer's hygiene remit beyond the retention
  boundary drawn above.
- No change to the release-engineer trust boundary: spec removal is PR-mediated
  and the release engineer stays the sole `main`-push agent.
- The DevEx panel is added to design, plan, and implementation reviews only;
  spec reviews keep the product and technical panels unchanged.
- Retention thresholds, the audit-topic list, and how durable signal is folded
  are design and plan concerns, not fixed here.
- Whether these agents and skills publish externally in the `kata-skills` pack.
  (The `kata-` prefix already subjects both new skills to the skill-template and
  genericity invariants regardless of that decision.)

## Success criteria

| Criterion                                                                                                      | Verified by                                                        |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Two agent profiles (`archivist`, `devex-engineer`) exist and pass the instruction-layer length checks          | `coaligned instructions`                                           |
| Two new skills (`kata-archive`, `kata-devex-audit`) exist, each `kata-`-prefixed, each owning one PDSA phase    | `coaligned instructions`; `KATA.md` skills table                    |
| Both new skills pass the skill-template and genericity invariants                                              | `coaligned invariants`                                             |
| `published-skills` enumeration stays consistent across `KATA.md`, `websites/kata/index.md`, and `llms.txt`      | the repository's enumeration-drift invariant (`coaligned invariants`) |
| `KATA.md` roster table lists both agents                                                                       | `KATA.md` § Agents                                                 |
| `kata-review` caller protocol lists a DevEx panel — own role and size — for design, plan, and implementation, and not for spec reviews | `kata-review` caller-protocol reference (panel-composition table) |
| Persona-count and roster prose in `KATA.md`, `websites/kata/index.md`, and `llms.txt` reflect the two added agents | those files (hand-maintained prose, not enum-gated) |
| `kata-shift` roster matrix and its § Workflows roster sequence include `archivist` and `devex-engineer`          | the `kata-shift` workflow file; `KATA.md` § Workflows              |
| Archivist scope constraints forbid removing non-terminal specs, current-week logs, the current-month storyboard, and canonical records (STATUS.md, MEMORY.md) | Archivist profile constraints section |
| Archivist opens a release-engineer-gated PR to remove spec directories (never pushing to `main`), and removes wiki artifacts directly on shift | Archivist profile; `kata-archive` skill |
| The retention-PR product-manager signal appears in the approval-signal catalogue (`x-approval-signals` and `KATA.md` § Approval Signal), and the product-manager profile's human-only constraint is scoped to spec and design | those files |
| `kata-release-merge` gates the retention-PR class on the product-manager approval signal, not a STATUS phase row | `kata-release-merge` skill |
| The `kata-storyboard` facilitation count in `KATA.md` § Workflows reflects whether the two added agents participate in the storyboard | `KATA.md` § Workflows |
| Retention preserves durable signal before removal and leaves removal recoverable through version history        | `kata-archive` skill procedure                                     |
| DevEx audit reviews one area per run and records coverage in `wiki/devex-engineer.md`                           | `kata-devex-audit` skill; `wiki/devex-engineer.md` coverage map     |
| DevEx scope constraints forbid behavior changes in a cleanup fix and route structural refactors to a spec       | DevEx Engineer profile constraints section                         |
| Both agents classified internal                                                                                | work-definition § Classification tests (all changes outside `products/`, `services/`) |
