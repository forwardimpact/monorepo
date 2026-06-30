# Coordination Protocol

Pick the channel by what the output **is**, not where context happens to be.
[work-definition.md](x-work-definition.md) defines each output type and how to
classify a finding into one; this protocol routes each type to its channel.
[memory-protocol.md](x-memory-protocol.md) governs wiki cadence and structure;
this protocol covers every other output an agent produces.

## Channel by output type

Each channel names an [abstract
operation](x-work-trackers.md#abstract-operations) (or a non-tracker surface); its
concrete per-tracker shape lives in the [matrix](x-work-trackers.md#the-matrix).

| Output                                          | Channel                                  |
| ----------------------------------------------- | ---------------------------------------- |
| Settled decision; weekly progress; agent state  | Wiki                                     |
| Time-series measurement                         | Metrics CSV                              |
| Open question, RFC, cross-product policy debate | `create-discussion` / `comment-discussion` |
| Reply tied to one change or one issue           | `comment`                                |
| Experiment or obstacle PDSA state               | `create-issue` + `label`                 |
| Mechanical fix or vulnerability patch           | `open-change` (`fix/` branch)            |
| Structural finding requiring design             | `open-change` (`spec/` branch)           |
| Specialized work needed mid-run                 | Sub-agent                                |

## Agent labels on experiment issues

Experiment issues carry an `agent:{name}` label so agents find their work
during [on-boot routing](x-memory-protocol.md#on-boot-routing): `list` open issues
filtered to the `experiment` and `agent:{self}` labels.

Valid labels: `agent:staff-engineer`, `agent:product-manager`,
`agent:release-engineer`, `agent:security-engineer`, `agent:technical-writer`.

## Approval signal

Phase artifacts are gated into `main`
by `kata-release-merge` against `wiki/STATUS.md`. See
[`approval-signals.md`](x-approval-signals.md) for the full signal catalogue,
trust rule, and write protocol. `kata-dispatch` is the bridge from PR-side
signals (labels, comments, reviews) to STATUS — it never originates approvals,
only propagates signals already expressed by a trusted human.

**Approval is not phase progression.** A STATUS row at `{phase} approved`
authorizes merge; it does not advance the phase. The next phase begins only
when the prior phase's artifact is on `main`. The STATUS rows and PR-side
comments `kata-dispatch` lands are bodies on in-scope surfaces, so apply
§ Citation integrity before propagating them.

## Citation integrity

Before an authoring path publishes a body on an in-scope surface — an Issue, PR,
or comment body, or wiki file content — every existence-asserting SHA-shaped
token it cites must resolve on the repository that citation references, or the
publish is blocked loudly and a record appended to `wiki/citation-blocks.md`.
The three properties and the resolution procedure live in
[citation-integrity.md](x-citation-integrity.md).

## Decision questions

When an output could fit multiple channels, ask in order:

1. Is the answer **settled**? No → Discussion. Yes → continue.
2. Is it **tied to one artifact**? Yes → comment there. No → continue.
3. Is it **mechanical or structural**? Mechanical → `fix/`. Structural →
   `spec/`. (Apply the test in
   [work-definition.md § Classification tests](x-work-definition.md#classification-tests).)
4. Otherwise → wiki.

A finding can require **multiple channels in parallel** — e.g., a CVE raising
a policy question is both a `fix/` change and a Discussion. `fix/` and `spec/`
branches never share a change, but either may run alongside a Discussion.

## Fix-in-flight marker

A change carries the diff; the coordinating issue coordinates it. An in-run
decision is not coordinated until it lands where the next reader looks — a
route decision that lives only in a change body is invisible to a parallel run
reading the issue, which re-implements the rejected route:

1. **Announce at `open-change`.** The implementing run comments on the
   coordinating issue at or before `open-change`: the change link, branch, and
   any route decision made in-run.
2. **Close alternatives where they were opened.** When an issue thread poses
   routes A/B, the selection lands on that thread naming the rejected route
   ("took A, not B") — so a later reader knows B is rejected, not unexplored.
3. **Rescopes name in-flight state.** A comment that redefines an issue's
   actionable scope states what is in flight (claim, branch, or change) — or the
   explicit negative: "no fix in flight as of this comment." Closure and
   routing comments are rescopes: a comment that closes a thread or routes a
   decision or disposition to a named owner redefines actionable scope even
   though it reads as terminal, so it carries the same marker and reminds the
   routed owner to announce at `open-change`. A rescope is a
   latest-state beacon; silence reads as an open invitation.

A change body may repeat a decision, never replace it.

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
   [memory-protocol.md § Active Claims](x-memory-protocol.md#active-claims).
2. **Probe** the remote of record for prior or in-flight work on the
   target. A claim-row cell, a local ref, or a search-index read is each
   point-in-time and can false-negative against a moving origin — none is
   sufficient absence evidence alone, and a false "nothing exists" mints
   duplicate work with no concurrency required:
   The change-existence probes are the `list` operation (concrete shape per
   tracker in the [matrix](x-work-trackers.md#the-matrix)); branch existence is a
   canonical-state read, not a tracker operation:
   - **Branch existence:** `git ls-remote origin "refs/heads/<branch>"` —
     exact ref only; glob refspecs fail silent on a miss.
   - **Change existence:** `list` changes by head branch, across **all**
     states — catches a branch pushed before its change opens, the costliest
     duplicate window.
   - **Topic search:** `list` changes searching the `<issue#>`, across **all**
     states. All-states is load-bearing — a merged or closed change on the
     target changes the route as much as an open one does.
   Run the probes twice: at implementation start, and again immediately
   before `open-change` — the search index lags by minutes, and minutes
   are exactly the collision window. The probe complements the claim
   handshake; it never replaces it.
3. **Create** the change (`open-change`), then announce it on the coordinating
   issue per the fix-in-flight marker rule.

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

- **Wiki reads/writes** — see [memory-protocol.md](x-memory-protocol.md).
- **Storyboard inputs** — record to metrics CSV; `fit-xmr` reads CSV.
- **Sub-agent invocation** — owned by individual skill procedures.

## Citation format

Cite every non-wiki output in the wiki log so the deliberation trail stays
linked. Format: `<Channel> <ref>: <one-line topic> (<URL>)`.

## Creating outputs

Each non-wiki output names an operation — `comment`,
`create-discussion` / `comment-discussion`, `create-issue`, `open-change`. The
shape realizing each on the active tracker lives in
[`work-trackers.md`](x-work-trackers.md); capture the returned id/URL for the
citation above.

## `## Coordination Channels` block in a skill

A skill carries this block when its procedure produces non-wiki, non-fix/spec
outputs needing cross-agent visibility — typically `comment` on a
change or issue, or Discussions. Skills whose only outputs are wiki appends
and fix/spec branches don't need the block; this file plus
`memory-protocol.md` govern routing for those.
