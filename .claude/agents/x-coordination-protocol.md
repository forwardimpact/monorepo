# Coordination Protocol

Pick the channel by what the output **is**. Ignore where the context sits.
[work-definition.md](x-work-definition.md) defines each output type and how to
classify a finding into one. This protocol routes each type to its channel.
[memory-protocol.md](x-memory-protocol.md) governs wiki cadence and structure.
This protocol covers every other output an agent produces.

## Channel by output type

Each channel names an
[abstract operation](x-work-trackers.md#abstract-operations) (or a non-tracker
surface). Its concrete per-tracker shape lives in the
[matrix](x-work-trackers.md#the-matrix).

| Output                                          | Channel                                  |
| ----------------------------------------------- | ---------------------------------------- |
| Settled decision; weekly progress; agent state  | Wiki                                     |
| Time-series measurement                         | Metrics CSV                              |
| Open question, RFC, cross-product policy debate | `create-discussion` / `comment-discussion` |
| Reply tied to one change or one issue           | `comment`                                |
| Experiment or obstacle PDSA state               | `create-issue` + `label`                 |
| Mechanical fix or vulnerability patch           | `open-change` (`fix/` branch)            |
| Structural finding that needs design            | `open-change` (`spec/` branch)           |
| Specialized work needed mid-run                 | Sub-agent                                |

## Agent labels on experiment issues

Experiment issues carry an `agent:{name}` label so agents find their work during
[on-boot routing](x-memory-protocol.md#on-boot-routing). `list` open issues
filtered to the `experiment` and `agent:{self}` labels.

Valid labels: `agent:staff-engineer`, `agent:product-manager`,
`agent:release-engineer`, `agent:security-engineer`, `agent:technical-writer`.

## Approval signal

`kata-release-merge` gates phase artifacts into `main` against
`wiki/STATUS.md`. [`approval-signals.md`](x-approval-signals.md) holds the
signal catalogue, trust rule, and write protocol. `kata-dispatch` bridges
PR-side signals (labels, comments, reviews, merges) to STATUS. It never
originates approvals. It only propagates what a trusted human expressed.

**Approval is not phase progression.** A STATUS row at `{phase} approved`
authorizes merge. It does not advance the phase. The next phase begins only
when the prior phase's artifact is on `main`.

**A human merge is both.** It approves the change and lands it. Record both
the approval and the progression
([`approval-signals.md`](x-approval-signals.md) § Merge as approval). The
separation above never implies a merged change went unapproved.

STATUS rows and PR-side comments `kata-dispatch` lands are in-scope bodies.
Apply § Citation integrity before you propagate them.

## Citation integrity

An in-scope surface is an Issue, PR, or comment body, or wiki file content.
Before an authoring path publishes a body on one, every existence-asserting
SHA-shaped token it cites must resolve on its referenced repository. An
unresolved token blocks the publish loudly. The block appends a record to
`wiki/citation-blocks.md`. The three properties and the resolution procedure
live in [citation-integrity.md](x-citation-integrity.md).

## Decision questions

When an output could fit multiple channels, ask in order:

1. Is the answer **settled**? No → Discussion. Yes → continue.
2. Is it **tied to one artifact**? Yes → comment there. No → continue.
3. Is it **mechanical or structural**? Mechanical → `fix/`. Structural →
   `spec/`. (Apply the test in
   [work-definition.md § Classification tests](x-work-definition.md#classification-tests).)
4. Otherwise → wiki.

A finding can require **multiple channels in parallel**. A CVE that raises a
policy question is both a `fix/` change and a Discussion. `fix/` and `spec/`
never share a change, but either may run alongside a Discussion.

## Fix-in-flight marker

A change carries the diff. The coordinating issue coordinates it. An in-run
decision is not coordinated until it lands where the next reader looks. A route
decision that lives only in a change body is invisible to a parallel run that
reads the issue. That run re-implements the rejected route:

1. **Announce at `open-change`.** Comment on the coordinating issue at or before
   `open-change`. Give the change link, branch, and any in-run route decision.
2. **Close alternatives where they were opened.** When an issue thread poses
   routes A/B, land the selection on that thread. Name the rejected route
   ("took A, not B"). A later reader then knows the run rejected B. B is not
   unexplored.
3. **Rescopes name in-flight state.** A comment that redefines an issue's
   actionable scope states what is in flight (claim, branch, or change). It can
   instead state the explicit negative: "no fix in flight as of this comment."
   Closure and routing comments are rescopes too. They read as terminal but
   redefine scope. So they carry the same marker and remind the routed owner to
   announce at `open-change`. A rescope is a latest-state beacon. Silence reads
   as an open invitation.

A change body may repeat a decision. It never replaces one.

## Cross-agent escalation

Address another agent by name in plain text: "Hello Product Manager, can you
take a look?" `kata-dispatch` infers the addressee and routes the response. Do
**not** use `@`-mentions. Agents have no GitHub accounts, so `@product-manager`
pings an unrelated user or nothing.
Do not write to another agent's wiki summary. Each agent reads its own.

## Claim → probe → create

Open any `fix/` or `spec/` PR in this order, inside a skill procedure or on the
skill-less `fix/` path. Without it, two concurrent runs can ship the same
target. Neither run sees the other until something lands where the next reader
looks.

1. **Claim** before the first code write, atomically with the wiki push, per
   [memory-protocol.md § Active Claims](x-memory-protocol.md#active-claims).
2. **Probe** the remote of record for prior or in-flight work on the target. A
   claim-row cell, a local ref, or a search-index read is each point-in-time.
   Each can false-negative against an origin that moves. None is sufficient
   absence evidence alone. A false "nothing exists" mints duplicate work with
   no concurrency required. Change-existence probes use `list` (per-tracker
   shape in the [matrix](x-work-trackers.md#the-matrix)). Branch existence is a
   canonical-state read. No tracker operation covers it:
   - **Branch existence:** `git ls-remote origin "refs/heads/<branch>"` —
     exact ref only. Glob refspecs fail silent on a miss.
   - **Change existence:** `list` changes by head branch, across **all**
     states. This catches a branch pushed before its change opens, the
     costliest duplicate window.
   - **Topic search:** `list` changes that match the `<issue#>`, across **all**
     states. All-states is load-bearing. A merged or closed change on the target
     changes the route as much as an open one does.
   Run the probes twice: at implementation start, and again immediately
   before `open-change`. The search index lags by minutes, and minutes
   are exactly the collision window. The probe complements the claim
   handshake. It never replaces it.
3. **Create** the change (`open-change`). Announce it on the coordinating issue
   per the fix-in-flight marker rule.

## Inbound: unclear addressed comments

If a comment addressed to you is ambiguous, reply with one specific question to
clarify. Do not act on inferred intent.

## Discussion ownership and termination

The author owns termination. The author closes the Discussion, links to the
spec or wiki note that results, or reassigns ownership. A Discussion older
than **14 days** without a terminal event is a mis-routing. The invariant
audit checks for stale open Discussions.

## Trust at run-time

`kata-dispatch` verifies the author is a trusted contributor before it engages
any participant. That is LLM judgement, scoped per run. Untrusted authors
get an acknowledgement. No participant agent files a `fix/` or `spec/` branch
on their behalf.

## Channels this protocol does NOT cover

- **Wiki reads/writes** — see [memory-protocol.md](x-memory-protocol.md).
- **Storyboard inputs** — record to metrics CSV. `gemba-xmr` reads CSV.
- **Sub-agent invocation** — individual skill procedures own it.

## Citation format

Cite every non-wiki output in the wiki log so the deliberation trail stays
linked. Format: `<Channel> <ref>: <one-line topic> (<URL>)`.

## Creating outputs

Each non-wiki output names an operation: `comment`,
`create-discussion` / `comment-discussion`, `create-issue`, `open-change`. The
shape that realizes each on the active tracker lives in
[`work-trackers.md`](x-work-trackers.md). Capture the returned id/URL for the
citation above.

## `## Coordination Channels` block in a skill

A skill carries this block when its procedure produces non-wiki, non-fix/spec
outputs that need cross-agent visibility, typically `comment` on a change or
issue, or Discussions. Skills whose only outputs are wiki appends
and fix/spec branches don't need the block. This file plus
`memory-protocol.md` govern routing for those.
