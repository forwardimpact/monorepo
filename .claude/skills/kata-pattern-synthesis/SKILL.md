---
name: kata-pattern-synthesis
description: >
  Synthesize a system-level pattern from a corpus of open obstacle, experiment,
  and PR items via grounded coding (open → axial → selective). Produces a
  proposition, a kata-spec, a kata-design, and a corpus map that closes the loop
  on the items that fed it. Run when the corpus is large enough that ad-hoc
  per-item handling is reinventing the same repair moves. Improvement coach
  scope extension — owned by the coach, with explicit authorization to write
  spec and design via `kata-spec` and `kata-design` for this skill only.
---

# Pattern Synthesis from Backlog

A facilitation skill for the improvement coach. The coach reads the open corpus
of obstacle and experiment issues and the PRs that touch them, codes the corpus
to surface the system-level pattern those items collectively name, and turns
that pattern into a single spec + design that addresses the meta-trigger,
instruments the binding constraint, and codifies the repair moves the team has
already invented case by case. The coach then closes the loop on every corpus
item that fed the synthesis.

This skill is the only path through which the coach writes specs or designs.
The general "facilitation only" constraint in
[`improvement-coach.md`](../../agents/improvement-coach.md) still applies to
every other context.

## When to Use

- A storyboard meeting Q3 surfaces ≥3 obstacles whose repair moves visibly
  rhyme (e.g., multiple "redefine the metric without tampering" patterns).
- A producer-orphaning event lands on `main` (skill removed, renamed, or split)
  and a metric loses its producer — immediate trigger.
- An RFC issue routes through `obstacle` because a richer channel was
  unavailable (e.g., `gh discussion create` failed) and the same RFC shape has
  appeared more than once.
- A user explicitly requests a backlog synthesis run.

Do **not** run when the corpus is small (under ~10 open obstacle+experiment
items) or when fewer than 3 distinct repair-adjacent moves appear. Premature
synthesis manufactures patterns where there is only noise.

## Triggers (queryable thresholds)

```sh
# Corpus size (open obstacles + experiments)
gh issue list --label obstacle,experiment --state open --limit 100 \
  --json number | jq 'length'   # ≥10 → eligible
```

```sh
# Producer-orphaning events on main since last synthesis
gh search commits 'PR #715' --repo "$REPO" --json sha,commit \
  --jq '.[] | select(.commit.message | test("remove|delete")) | .sha'
```

```sh
# Distinct repair-adjacent moves in recent obstacles (open + last 30 days)
gh issue list --label obstacle --state all --search "updated:>$(date -d '30 days ago' +%F)" \
  --json title,body --jq '[.[] | .body | scan("sidecar|dual-record|stock|recast|phase|rehom|habit|RFC")] | unique | length'
# ≥3 → eligible
```

The synthesis runs at most once per ISO week unless a producer-orphaning event
forces it.

## Checklists

<read_do_checklist goal="Hold the synthesis boundary before coding the corpus">

- [ ] Confirm at least one trigger threshold is met. Record which.
- [ ] Close the corpus before coding begins; later items do not bias the codes.
- [ ] Memos and codes are written to a scratch location, not to the wiki, until
      the proposition is selected.
- [ ] No claim enters the spec or design without an issue/PR number anchor.
- [ ] The synthesis stops at one core category. If two compete, stop and route
      to a coaching session — the corpus is two patterns, not one.

</read_do_checklist>

<do_confirm_checklist goal="Verify synthesis quality before opening artifacts">

- [ ] Every corpus item has a memo (3–5 sentences max).
- [ ] Every memo has at least one in-vivo or descriptive code.
- [ ] Codes group into 3–7 axial categories with stated relations.
- [ ] One core category is named; storyline paragraph reads end-to-end without
      referencing the codes table.
- [ ] One-sentence theoretical proposition is recorded.
- [ ] Spec drafted via `kata-spec` with verifiable success criteria (no HOW).
- [ ] Design drafted via `kata-design` (≤200 lines, each decision rejects an
      alternative).
- [ ] Corpus map records, for every original item, one of: directly addressed,
      binding-constraint instrumented, repair-move codified, or out of scope.
- [ ] Closure broadcast posted on every addressed item; **out-of-scope items
      not tagged**.

</do_confirm_checklist>

## The Eight Phases

The synthesis runs as a sequence. Output of each phase is the input to the
next; nothing is invented without an anchor in the prior phase.

### 1 — Corpus gather

Define topic keywords (default: `obstacle`, `experiment`, plus PRs that
reference any of those issues). Search by label, then by keyword, then dedupe.
Persist issue/PR bodies to a scratch file under `/tmp/`. The corpus is closed
before phase 2.

### 2 — Field memos (one per item)

3–5 sentences each: the central incident, the in-vivo language the author
used, what the case adds. One file collecting all memos. Brevity is a
discipline — long memos overweight verbose authors.

### 3 — Open coding

Tag each incident with one or more codes. Prefer in-vivo (`HABIT_TO_POLICY`,
`MERGE_AS_APPROVAL_SIGNAL`) over descriptive. Build an `incident → code` table.

### 4 — Axial coding

Group codes into 3–7 categories. For each: sub-codes, relations, causal
condition, consequence. Stop when a new code lands cleanly in an existing
category.

### 5 — Selective coding

Identify the core category that integrates the others. Write a one-paragraph
storyline and a one-sentence theoretical proposition. The proposition is the
architectural target.

### 6 — Spec via `kata-spec`

WHAT/WHY only. Problem section grounds every claim in a `#NNN` anchor. Scope
(in) names specific files; Scope (out) names what is deferred. Success
criteria are verifiable. Stop after `spec.md`.

### 7 — Design via `kata-design`

WHICH/WHERE only. ≤200 lines. Each decision names a rejected alternative.
Mermaid for relationships and flows. Stays inside spec scope.

### 8 — Map back to corpus and broadcast

Re-read the corpus. Classify every item as **directly addressed**,
**binding-constraint instrumented**, **repair-move codified**, or **out of
scope**. Update the PR body with an "Addresses" section listing only the first
three buckets. Comment once on each addressed item with a back-reference to
the PR. **Do not touch out-of-scope items** — signal hygiene matters; the
items not addressed should not be tagged into the synthesis PR's notification
graph.

## Mapping back to corpus — categories

| Category | Trigger | Comment shape |
| --- | --- | --- |
| **Directly addressed** | The synthesis's meta-trigger; the spec resolves or absorbs the item. | "Spec NNN codifies `<move>` as a named move; the no-silent-amendment rule would have surfaced this when …" |
| **Binding-constraint instrumented** | The item flagged the binding constraint; the spec adds the metric that reads it. | "Spec NNN Success #N adds `<metric>` to canonical-11; the metric is the standing meter for the constraint this issue exemplifies." |
| **Repair-move codified** | The item invented or applied a move that the spec now names. | "Spec NNN names `<move>` in the typology; this issue is the cited precedent. Future runs file an MCD instead of restating the cohort context." |
| **Out of scope** | Spec's Scope (out) names the item or its category. | (no comment) |

## Stopping conditions

The skill stops and routes to a coaching session in these cases:

- Corpus splits into two competing core categories — file two coaching asks,
  one per category, and re-run synthesis on each subset later.
- Open coding produces a category with one code and one incident — the corpus
  is too small for that category to be a pattern.
- Phase 6 cannot draft a spec whose Problem section grounds every claim in a
  cited issue — the proposition is unsupported; return to phase 4.

## Cross-skill dependencies

| Phase | Skill invoked | Owner |
| --- | --- | --- |
| 6 | `kata-spec` | improvement-coach (this skill only) |
| 7 | `kata-design` | improvement-coach (this skill only) |
| 8 (broadcast) | direct GitHub MCP / `gh` | improvement-coach |

The coach's general "no writing specs or fix PRs" constraint
([`improvement-coach.md`](../../agents/improvement-coach.md)) is extended here
because the synthesis is observation-as-architecture, not domain work — the
spec is a write-up of what the team has already implicitly decided across the
corpus, not a new feature.

## Memory: what to record

Append to the current week's coach log
(`wiki/improvement-coach-$(date +%G-W%V).md`):

- **Trigger** — Which threshold fired, with the count and date.
- **Corpus** — Item numbers gathered (e.g., "12 obstacles, 14 experiments,
  4 PRs").
- **Core category** — The one selected, plus the rejected alternative if more
  than one was considered.
- **Proposition** — The one-sentence proposition.
- **Spec / design / PR** — Numbers and links.
- **Corpus map** — A table of corpus item → category. Out-of-scope items are
  recorded here even though they receive no comment.
- **Metrics** — Append one row per run to `wiki/metrics/{skill}/`
  per `references/metrics.md`. See KATA.md § Metrics for the
  recording-eligibility rule.

## Coordination Channels

This skill produces these non-wiki outputs (per
[coordination-protocol.md](../../agents/references/coordination-protocol.md)):

- **PR body** — The synthesis spec/design PR carries the Addresses overview.
- **Issue comment** — One per addressed item; never on out-of-scope items.
- **Storyboard headline** — The next storyboard meeting after a synthesis run
  surfaces the synthesis PR as a Q1 target-condition reference.

If two storyboard meetings pass without the spec PR being approved, the coach
files an obstacle (the synthesis PR is itself subject to the binding-
constraint metric the spec proposed).
