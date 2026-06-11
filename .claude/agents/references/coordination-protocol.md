# Coordination Protocol

Pick the channel by what the output **is**, not where context happens to be.
What each output type *is*, and how to classify a finding into one, is defined
in [work-definition.md](work-definition.md); this protocol routes each type to
its channel. Wiki cadence and structure are governed by
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

## Decision questions

When an output could fit multiple channels, ask in order:

1. Is the answer **settled**? No → Discussion. Yes → continue.
2. Is it **tied to one artifact**? Yes → comment there. No → continue.
3. Is it **mechanical or structural**? Mechanical → `fix/`. Structural →
   `spec/`. (Apply the test in
   [work-definition.md § Classification tests](work-definition.md#classification-tests).)
4. Otherwise → wiki.

A finding can require **multiple channels in parallel** — e.g., a CVE raising
a policy question is both a `fix/` PR and a Discussion. `fix/` and `spec/`
branches never share a PR, but either may run alongside a Discussion.

## Fix-in-flight marker

A PR body records a change; the coordinating issue coordinates it. An in-run
decision is not coordinated until it lands where the next reader looks — a
route decision that lives only in a PR body is invisible to a parallel run
reading the issue, which re-implements the rejected route:

1. **Announce at PR-open.** The implementing run comments on the coordinating
   issue at or before PR-open: PR link, branch, and any route decision made
   in-run.
2. **Close alternatives where they were opened.** When an issue thread poses
   routes A/B, the selection lands on that thread naming the rejected route
   ("took A, not B") — so a later reader knows B is rejected, not unexplored.
3. **Rescopes name in-flight state.** A comment that redefines an issue's
   actionable scope states what is in flight (claim, branch, or PR) — or the
   explicit negative: "no fix in flight as of this comment." A rescope is a
   latest-state beacon; silence reads as an open invitation.

A PR body may repeat a decision, never replace it.

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
