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

`kata-dispatch` lands STATUS rows and PR-side comments; those are bodies on
in-scope surfaces, so apply § Citation integrity before propagating them.

## Citation integrity

Agent-authored bodies are consumed by downstream agents as evidence. A body
that cites a commit SHA which does not resolve on the repository the citation
references reads as authoritative and propagates unchallenged. Before an
authoring path publishes a body on an in-scope surface — an Issue body, a PR
body, an Issue or PR comment body, or wiki file content — it holds to three
properties.

1. **Resolution against the referenced repository.** Every SHA-shaped token the
   body asserts as existing resolves on the repository its citation references.
   Repository context is per-citation: one body may cite commits on more than
   one repository, and each token is judged against the repository its
   surrounding text references. A token whose surrounding text references no
   repository is judged against the repository hosting the body's surface. That
   host is the host repository for an Issue, PR, or comment, or the wiki
   repository for wiki file content. **Negative citations are exempt:** a token the body explicitly
   cites as non-resolving (a forensic correction, a quoted block record, an
   audit finding) is not required to resolve.
2. **No publish on failure, loud to the author.** A body with a token that
   fails this check is not published on the surface by the authoring path. The
   block is surfaced to the authoring agent so it can correct the citation and
   republish. Silently dropping the body is not a conforming outcome. On the
   wiki surface this binds the content the authoring path commits (authored
   landings); transient publication of working-tree state by session-sync
   infrastructure operates outside the authoring path and is out of scope.
3. **Audit-readable block record.** Every block emits a record carrying at
   minimum the offending token, the repository it was checked against, the
   originating authoring path (skill or profile routine), an identifier of the
   blocked body's surface, the block time, and enough of the citation's
   surrounding context to re-judge it later. The record is durable.

**Resolution procedure.** For each SHA-shaped token the body asserts as
existing, infer the referenced repository from the citation's surrounding
context, then resolve the token via the host's commit-lookup capability:

- For the host repository and any other hosted repository, query
  `gh api repos/{owner}/{repo}/commits/{sha}` — a non-2xx response is
  non-resolution.
- For wiki file content, check the wiki repository with
  `git -C wiki cat-file -e {sha}^{commit}` — a non-zero exit is non-resolution.

A token that does not resolve blocks the publish and emits the record from
property 3. A token citing a repository the installation cannot reach is
recorded rather than blocked. The commands above are illustrative of the
capability; the discriminator that recognizes a SHA-shaped token and the marker
that distinguishes a negative citation are an authoring-path detail, not fixed
here.

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
   explicit negative: "no fix in flight as of this comment." Closure and
   routing comments are rescopes: a comment that closes a thread or routes a
   decision or disposition to a named owner redefines actionable scope even
   though it reads as terminal, so it carries the same marker and reminds the
   routed owner to announce at PR-open. A rescope is a
   latest-state beacon; silence reads as an open invitation.

A PR body may repeat a decision, never replace it.

## Cross-agent escalation

Address another agent by name in plain text — "Hello Product Manager,
can you take a look?" `kata-dispatch` infers the addressee and routes the
response. Do **not** use `@`-mentions: agents have no GitHub accounts, so
`@product-manager` either pings an unrelated user or resolves to nothing.
Do not write to another agent's wiki summary — they read their own.

## Claim → probe → create

Opening any `fix/` or `spec/` PR — inside a skill procedure or on the
skill-less `fix/` path — follows this order. Without it, two concurrent
runs can ship the same target: neither sees the other until something
lands where the next reader looks.

1. **Claim** before the first code write, atomically with the wiki push —
   procedure in
   [memory-protocol.md § Active Claims](memory-protocol.md#active-claims).
2. **Probe** the remote of record for prior or in-flight work on the
   target. A claim-row cell, a local ref, or a search-index read is each
   point-in-time and can false-negative against a moving origin — none is
   sufficient absence evidence alone, and a false "nothing exists" mints
   duplicate work with no concurrency required:
   - **Branch existence:** `git ls-remote origin "refs/heads/<branch>"` —
     exact ref only; glob refspecs fail silent on a miss.
   - **PR existence:** `gh pr list --head <branch> --state all` — catches
     a branch pushed before its PR opens, the costliest duplicate window.
   - **Topic search:** `gh pr list --search "<issue#>" --state all`.
     `--state all` is load-bearing — a merged or closed PR on the target
     changes the route as much as an open one does.
   Run the probes twice: at implementation start, and again immediately
   before `gh pr create` — the search index lags by minutes, and minutes
   are exactly the collision window. The probe complements the claim
   handshake; it never replaces it.
3. **Create** the PR, then announce it on the coordinating issue per the
   fix-in-flight marker rule.

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
