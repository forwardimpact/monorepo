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

Experiment issues carry an `agent:{name}` label identifying the owning agent so
agents can find their assigned work during
[on-boot routing](memory-protocol.md#on-boot-routing):

```sh
gh issue list --state open --label experiment --label "agent:staff-engineer"
```

Valid labels: `agent:staff-engineer`, `agent:product-manager`,
`agent:release-engineer`, `agent:security-engineer`, `agent:technical-writer`.

## Approval signal

Phase artifacts (specs, designs, plans, implementations) are gated into `main`
by `kata-release-merge`. Approval state is recorded in `wiki/STATUS.md` — a
markdown page in the wiki wrapping a tab-separated body, one row per spec:
`{id}\t{phase}\t{status}`. STATUS is the canonical approval record; see
[`approval-signals.md`](approval-signals.md) for the full signal catalogue
and write protocol.

Signals from any source below feed STATUS:

- `<phase>:approved` label applied to the PR (human or `/ship-it`)
- `gh pr review --approve` by a trusted account
- Approval comment ("approve", "LGTM", "ship it") from a trusted contributor
- Direct user message in an interactive coding session (trusted user)
- `kata-plan` panel-clean (`staff-engineer`, plans only)

**Trust rule.** Spec and design approvals must originate from a trusted human.
Agents never autonomously originate `spec approved` or `design approved`; they
only propagate signals already expressed by a trusted human. Plans may be
approved by `staff-engineer` after `kata-plan` review.

`kata-dispatch` is the bridge from PR-side signals (labels, comments, reviews)
to STATUS — it validates trust (using the same gate as `kata-release-merge`)
and writes the matching STATUS row. The facilitator does **not** apply any
approval label or submit an APPROVED review on behalf of any contributor; it
only propagates signals already expressed by trusted humans into STATUS.

**Approval is not phase progression.** A STATUS row at `{phase} approved`
authorizes `kata-release-merge` to merge that PR; it does not by itself advance
the phase. Phase progression is derived only from `main`: the next phase begins
when the prior phase's artifact (`specs/NNN/spec.md`, `design-a.md`,
`plan-a.md`) is on `main` — i.e. the prior phase's PR has been merged. An
approved-but-unmerged PR does not unblock the next phase.

**Labels remain as input signals**, not as gates. Humans may apply
`<phase>:approved` labels for PR UI visibility; the label fires `kata-dispatch`
which validates trust and writes STATUS.

## Measurement-system changes

Changes to a canonical-11 metric — skill removal, rename, split, definition
change, sidecar opening, denominator redefinition, rule-semantics challenge —
follow one of eight named repair moves and ship with a redefinition file.

| Move | Definition (one sentence) | Falsifier-set kind |
|---|---|---|
| `producer-rehoming` | Reassign a metric's producing skill when the original is removed/split/renamed; record a continuity tag on the first row under the new producer. | "structural-zero rows present after rehoming run" |
| `mode-restriction` | Narrow recording to one activation mode of a multi-mode skill so the series is unimodal. | "post-restriction series remains bimodal under XmR" |
| `historical-phasing` | Annotate a series with a Phase boundary; XmR analysis windows on Phase 1; no CSV backfill. | "Phase 1 cannot reach `predictable` after horizon" |
| `sidecar-pre-flight` | Record a candidate metric to a sibling CSV while the canonical metric continues; no denominator change until ratification. | "sidecar diverges from canonical at horizon" |
| `stock-vs-flow-recast` | Replace a flow-rate metric with a stock metric on the same axis when burst architecture trips XmR by construction. | "stock series fires `xRule1` or `mrRule1` post-recast" |
| `event-driven-recast` | Replace per-day cadence with per-activation ("no row, no event"). | "per-activation series remains `insufficient_data` at horizon" |
| `rule-semantics-rfc` | Challenge an XmR rule's blocking effect on `predictable` via Discussion RFC; quorum required. | "RFC quorum not reached by horizon" |
| `habit-to-policy` | Promote an undocumented defensive habit into a `SKILL.md` check after a defect surfaces. | "post-promotion defect of the same shape recurs" |

The list is closed; extensions land via the spec/design/plan/implement chain.

### Redefinition shape

Each canonical-11 change ships a `wiki/redefinitions/{YYYY-MM-DD}-{slug}.md`
file in the same PR. The file is YAML front-matter plus a brief prose body:

```yaml
---
move: producer-rehoming | mode-restriction | historical-phasing |
      sidecar-pre-flight | stock-vs-flow-recast | event-driven-recast |
      rule-semantics-rfc | habit-to-policy
affected_metrics:
  - {skill: <skill>, metric: <metric>}
falsifier_set:
  - <predicate>
verdict_horizon: <YYYY-MM-DD>
cohort_readout: <YYYY-MM-DD>      # >= verdict_horizon
denominator_effect: none | sidecar | conditional-amend | amend
links:
  obstacle_issue: <issue-ref>?
  experiment_issue: <issue-ref>?
  pr: <pr-ref>?
---

# Redefinition — <human-readable title>

<one-paragraph context: what changed, why this move, what the cohort ratifies>
```

`verdict_horizon ≤ cohort_readout` is the only ordering constraint.
`denominator_effect` enum: `none` for sidecars and rule-semantics challenges
that don't move the denominator; `sidecar` for a parallel CSV pending verdict;
`conditional-amend` for a denominator change ratified at the cohort read-out;
`amend` for an unconditional denominator change.

### No-silent-redefinition rule

> No change to the canonical-11 denominator (additions, removals, conditional
> or unconditional redefinitions) lands without a redefinition file at
> `wiki/redefinitions/{YYYY-MM-DD}-{slug}.md` whose `denominator_effect` is
> non-`none`, a cohort read-out date on or before the storyboard meeting at
> which the change takes effect, and a linked storyboard headline.
>
> This single statement lives in `coordination-protocol.md` § Measurement-system
> changes. KATA.md § Metrics links to it; no other file restates it.

### Worked example — sidecar pre-flight

```yaml
---
move: sidecar-pre-flight
affected_metrics:
  - {skill: kata-trace, metric: findings_count}
falsifier_set:
  - sidecar diverges from canonical at verdict horizon
verdict_horizon: YYYY-MM-DD
cohort_readout: YYYY-MM-DD
denominator_effect: none
links:
  obstacle_issue: "<issue-ref>"
  experiment_issue: "<issue-ref>"
  pr: null
---

# Redefinition — sidecar pre-flight (inline example)

One paragraph context: a sidecar CSV opened to evaluate the
`findings_count` recasting; the cohort ratifies at the next read-out.
```

### Detection

Any commit touching a canonical-11 metric edge must, in the same commit, add or
modify a `wiki/redefinitions/*.md` file. The canonical-11 edges are
`wiki/storyboard-*.md`, `.claude/skills/*/references/metrics.md`, and
`coordination-protocol.md` § Measurement-system changes. Cross-repo enforcement
between this monorepo and the wiki repo is the follow-on CI workstream.

```sh
# Commits that edit canonical-11 edges but do NOT touch wiki/redefinitions/.
for c in $(git log --format=%H --since="<date>" -- \
    'wiki/storyboard-*.md' \
    '.claude/skills/*/references/metrics.md' \
    '.claude/agents/references/coordination-protocol.md'); do
  git diff-tree --no-commit-id --name-only -r "$c" \
    | grep -q '^wiki/redefinitions/' || echo "$c missing redefinition"
done
```

## Decision questions

When an output could fit multiple channels, ask in order:

1. Is the answer **settled**? No → Discussion. Yes → continue.
2. Is it **tied to one artifact**? Yes → comment there. No → continue.
3. Is it **mechanical or structural**? Mechanical → `fix/`. Structural →
   `spec/`.
4. Otherwise → wiki.

A finding can require **multiple channels in parallel** — e.g., a CVE that also
raises a policy question lands as both a `fix/` branch (the patch) **and** a
Discussion (the policy question). `fix/` and `spec/` branches never share a PR,
but either may run alongside a Discussion.

## Cross-agent escalation

To pull another agent into a thread, address them by name in plain text — e.g.
"Hello Product Manager," or "Hey Staff Engineer, can you take a look at the
trust check?" The `kata-dispatch` facilitator infers the addressee and routes the
response. Do **not** use `@`-mentions for agents: agents don't have GitHub user
accounts, so `@product-manager` would either ping an unrelated GitHub user with
that handle or resolve to nothing. Do not write to another agent's wiki summary
— they read their own.

## Inbound: unclear addressed comments

If a comment addressed to you is ambiguous — unclear ask, missing context, or
could be interpreted multiple ways — reply asking one specific clarifying
question. Do not act on inferred intent.

## Discussion ownership and termination

The author of a Discussion owns its termination — closing it, linking to the
resulting spec or wiki note, or reassigning ownership to another agent or human
in a comment. A Discussion older than **14 days** without a terminal event is a
mis-routing; the invariant audit (KATA.md § Invariants) checks for stale open
Discussions.

### Runtime mechanism

Discussion events reach the agent team via `services/ghbridge`, not directly
via the dispatch workflow. The bridge stores per-thread state (history,
participants, open RFCs, lead) in `libindex` JSONL and re-dispatches the
workflow when a recess trigger fires. RFC long-running coordination is
expressed via the libeval `discuss` mode's `Recess` and `RequestForComment`
tools — the agent team should treat a Discussion the same way regardless of
whether it spans one workflow run or 14 days of recesses.

## Trust at run-time

The `kata-dispatch` facilitator verifies the author is a trusted contributor
before engaging any participant — LLM judgement, scoped per run. Untrusted
authors receive an acknowledgement; no participant agent files a `fix/` or
`spec/` branch on their behalf.

## Channels this protocol does NOT cover

- **Wiki reads/writes** — see [memory-protocol.md](memory-protocol.md).
- **Storyboard inputs** — record to metrics CSV; the storyboard reads CSV via
  `fit-xmr`.
- **Sub-agent invocation** — owned by individual skill procedures.

## Citation format

Cite every non-wiki output back in the wiki log so the deliberation trail stays
linked. Format: `<Channel> #<N>: <one-line topic> (<URL>)`.

```
Discussion: should fit-pathway support nested levels?
(https://github.com/forwardimpact/monorepo/discussions/<N>)
PR: docs(kata): document kata-dispatch workflow
(https://github.com/forwardimpact/monorepo/pull/<N>)
Issue: clarify proficiency scale for expert tier
(https://github.com/forwardimpact/monorepo/issues/<N>)
```

## Creating outputs (gh CLI)

`gh` is the authorized tool for every non-wiki output. Capture the returned URL
for the citation format above.

- **Issue comment:** `gh issue comment <N> --body "<text>"`
- **PR comment:** `gh pr comment <N> --body "<text>"`
- **New Discussion:**
  `gh api graphql -f query='mutation { createDiscussion(input: { repositoryId, categoryId, title, body }) { discussion { url } } }'`
- **Discussion comment:**
  `gh api graphql -f query='mutation { addDiscussionComment(input: { discussionId, body }) { comment { url } } }'`
  — pass `replyToId` to thread the reply

## When skills declare a `## Coordination Channels` block

A skill carries a `## Coordination Channels` block when its procedure produces
**non-wiki, non-fix/spec outputs** that need cross-agent or external visibility
— typically PR comments, issue comments, or Discussions. Skills whose only
outputs are wiki appends and fix/spec branches don't need the block; routing for
those is governed by this file plus `memory-protocol.md` directly.

## Common mis-routings

The most frequent failure modes this protocol prevents — watch for these:

- **Open questions stranded as wiki TODOs.** A finding that needs input from
  another agent or a human is not a settled note — it's a Discussion. If a wiki
  entry contains "?", "decide whether", or "needs review", open a Discussion and
  link from the wiki note.
- **Cross-cutting comments lost in PR threads.** A policy question raised on one
  PR but applicable to many should escalate to a Discussion, not stay buried in
  PR review.
- **Agent-to-agent memos sent via direct edits to another summary.** Use
  `fit-wiki memo --from <you> --to <recipient> --message "<text>"` so the
  bullet lands under the recipient's `## Message Inbox` marker. Never
  hand-edit another agent's summary — `fit-wiki memo` is the only supported
  write path.
