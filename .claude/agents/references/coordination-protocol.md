# Coordination Protocol

Pick the channel by what the output **is**, not where context happens to be.
Wiki cadence and structure are governed by
[memory-protocol.md](memory-protocol.md); this protocol covers every other
output an agent produces.

## Channel by output type

| Output                                          | Channel           |
| ----------------------------------------------- | ----------------- |
| Settled decision; weekly progress; agent state  | Wiki              |
| Time-series measurement                         | Metrics CSV       |
| Open question, RFC, cross-product policy debate | Discussion        |
| Reply tied to one PR or one issue               | PR / issue thread |
| Experiment or obstacle PDSA state               | Labeled issue     |
| Mechanical fix or vulnerability patch           | `fix/` branch PR  |
| Structural finding requiring design             | `spec/` branch PR |
| Specialized work needed mid-run                 | Sub-agent         |

## Agent labels on experiment issues

Experiment issues carry an `agent:{name}` label so agents find their work
during [on-boot routing](memory-protocol.md#on-boot-routing):

```sh
gh issue list --state open --label experiment --label "agent:staff-engineer"
```

Valid labels: `agent:staff-engineer`, `agent:product-manager`,
`agent:release-engineer`, `agent:security-engineer`, `agent:technical-writer`.

## Approval signal

Phase artifacts (specs, designs, plans, implementations) are gated into `main`
by `kata-release-merge` against `wiki/STATUS.md`. See
[`approval-signals.md`](approval-signals.md) for the full signal catalogue,
trust rule, and write protocol. `kata-dispatch` is the bridge from PR-side
signals (labels, comments, reviews) to STATUS — it never originates approvals,
only propagates signals already expressed by a trusted human.

**Approval is not phase progression.** A STATUS row at `{phase} approved`
authorizes merge; it does not advance the phase. The next phase begins only
when the prior phase's artifact is on `main`.

## Measurement-system changes

Changes to a canonical-11 metric — skill removal, rename, split, definition
change, sidecar opening, denominator redefinition, rule-semantics challenge —
follow one of eight named repair moves and ship with a redefinition file.

| Move | One-sentence definition | Falsifier-set kind |
|---|---|---|
| `producer-rehoming` | Reassign a metric's producing skill when the original is removed/split/renamed; tag continuity on the first row under the new producer. | "structural-zero rows after rehoming" |
| `mode-restriction` | Narrow recording to one activation mode of a multi-mode skill so the series is unimodal. | "post-restriction series remains bimodal" |
| `historical-phasing` | Annotate a Phase boundary; XmR windows on Phase 1; no CSV backfill. | "Phase 1 cannot reach `predictable`" |
| `sidecar-pre-flight` | Record a candidate to a sibling CSV while the canonical metric continues; no denominator change until ratification. | "sidecar diverges from canonical" |
| `stock-vs-flow-recast` | Replace a flow-rate metric with a stock metric when burst architecture trips XmR by construction. | "stock series fires `xRule1` post-recast" |
| `event-driven-recast` | Replace per-day cadence with per-activation ("no row, no event"). | "per-activation series stays `insufficient_data`" |
| `rule-semantics-rfc` | Challenge an XmR rule's blocking effect via Discussion RFC; quorum required. | "RFC quorum not reached by horizon" |
| `habit-to-policy` | Promote a defensive habit into a `SKILL.md` check after a defect surfaces. | "post-promotion defect of same shape recurs" |

The list is closed; extensions land via the spec/design/plan/implement chain.

### Redefinition shape

Each canonical-11 change ships `wiki/redefinitions/{YYYY-MM-DD}-{slug}.md` in
the same PR — YAML front-matter plus a one-paragraph prose body:

```yaml
---
move: <one of the eight>
affected_metrics: [{skill: <skill>, metric: <metric>}]
falsifier_set: [<predicate>]
verdict_horizon: <YYYY-MM-DD>
cohort_readout: <YYYY-MM-DD>      # >= verdict_horizon
denominator_effect: none | sidecar | conditional-amend | amend
links: { obstacle_issue: <issue-ref>?, experiment_issue: <issue-ref>?, pr: <pr-ref>? }
---
```

`verdict_horizon ≤ cohort_readout` is the only ordering constraint.
`denominator_effect`: `none` for sidecars and rule-semantics challenges;
`sidecar` for a parallel CSV pending verdict; `conditional-amend` for a
denominator change ratified at the cohort read-out; `amend` for unconditional.

### No-silent-redefinition rule

> No change to the canonical-11 denominator lands without a redefinition file
> at `wiki/redefinitions/{YYYY-MM-DD}-{slug}.md` whose `denominator_effect` is
> non-`none`, a cohort read-out date on or before the storyboard meeting at
> which the change takes effect, and a linked storyboard headline.

KATA.md § Metrics links to this section; no other file restates the rule.

### Detection

Any commit touching a canonical-11 edge must add or modify
`wiki/redefinitions/*.md` in the same commit. Canonical-11 edges:
`wiki/storyboard-*.md`, `.claude/skills/*/references/metrics.md`, and this
section.

## Decision questions

When an output could fit multiple channels, ask in order:

1. Is the answer **settled**? No → Discussion. Yes → continue.
2. Is it **tied to one artifact**? Yes → comment there. No → continue.
3. Is it **mechanical or structural**? Mechanical → `fix/`. Structural →
   `spec/`.
4. Otherwise → wiki.

A finding can require **multiple channels in parallel** — e.g., a CVE raising
a policy question is both a `fix/` PR and a Discussion. `fix/` and `spec/`
branches never share a PR, but either may run alongside a Discussion.

## Cross-agent escalation

Address another agent by name in plain text — "Hello Product Manager,
can you take a look?" `kata-dispatch` infers the addressee and routes the
response. Do **not** use `@`-mentions: agents have no GitHub accounts, so
`@product-manager` either pings an unrelated user or resolves to nothing.
Do not write to another agent's wiki summary — they read their own.

## Inbound: unclear addressed comments

If a comment addressed to you is ambiguous, reply with one specific
clarifying question. Do not act on inferred intent.

## Discussion ownership and termination

The author owns termination — closing the Discussion, linking to the
resulting spec or wiki note, or reassigning ownership. A Discussion older
than **14 days** without a terminal event is a mis-routing; the invariant
audit checks for stale open Discussions.

## Trust at run-time

`kata-dispatch` verifies the author is a trusted contributor before engaging
any participant — LLM judgement, scoped per run. Untrusted authors get an
acknowledgement; no participant agent files a `fix/` or `spec/` branch on
their behalf.

## Channels this protocol does NOT cover

- **Wiki reads/writes** — see [memory-protocol.md](memory-protocol.md).
- **Storyboard inputs** — record to metrics CSV; `fit-xmr` reads CSV.
- **Sub-agent invocation** — owned by individual skill procedures.

## Citation format

Cite every non-wiki output in the wiki log so the deliberation trail stays
linked. Format: `<Channel> <ref>: <one-line topic> (<URL>)`.

## Creating outputs (gh CLI)

`gh` is the authorized tool for every non-wiki output. Capture the returned
URL for the citation format above.

- **Issue comment:** `gh issue comment <N> --body "<text>"`
- **PR comment:** `gh pr comment <N> --body "<text>"`
- **New Discussion:**
  `gh api graphql -f query='mutation { createDiscussion(input: {...}) {...} }'`
- **Discussion comment:**
  `gh api graphql -f query='mutation { addDiscussionComment(input: {...}) {...} }'`
  — pass `replyToId` to thread.

## `## Coordination Channels` block in a skill

A skill carries this block when its procedure produces non-wiki, non-fix/spec
outputs needing cross-agent or external visibility — typically PR comments,
issue comments, or Discussions. Skills whose only outputs are wiki appends
and fix/spec branches don't need the block; this file plus
`memory-protocol.md` govern routing for those.
