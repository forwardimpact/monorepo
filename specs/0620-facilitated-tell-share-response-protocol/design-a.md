# Design 0620 — Request–Response Primitives for libeval Orchestration

Spec: [`spec.md`](./spec.md).

## Components

Changes span the runtime (L1), one renamed skill (L6/L7), one workflow (L4), and
one reference (L7). Layer numbers per
[COALIGNED.md § The Layers](../../COALIGNED.md#the-layers).

| Layer | Component                                                                                                                                                        | Role                                                                                    |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| L1    | `OrchestrationToolkit` — tool-server factories, handler factories, `pendingAsks` context state                                                                   | Tool surface, pending-ask state, violation emission                                     |
| L1    | `Facilitator` / `Supervisor` — agent loop with turn-complete guard; domain-agnostic system prompts; `systemPromptAmend` / `taskAmend` pass-throughs; message bus | Runtime enforcement; generic system-prompt framing; consumer-controlled append surfaces |
| L6    | `kata-session/SKILL.md` (renamed from `kata-storyboard`)                                                                                                         | Mode-agnostic five-question procedure + Ask/Answer                                      |
| L7    | `kata-session/references/{team-storyboard,one-on-one}.md`                                                                                                        | Mode-specific overlays                                                                  |
| L4    | `.github/workflows/kata-coaching.yml` `task-text`                                                                                                                | Coaching framing into the facilitator                                                   |
| L7    | `kata-trace/references/invariants.md`                                                                                                                            | Two `protocol_violation` invariants (facil. + superv.)                                  |

## Architecture

### New primitive vocabulary

Both modes share one vocabulary. Asymmetric cardinality (1:1 vs 1:N) is handled
by the `to` parameter, not by distinct tools.

| Tool                     | Side                            | Semantics                                                                                           |
| ------------------------ | ------------------------------- | --------------------------------------------------------------------------------------------------- |
| `Ask(to?, question)`     | facilitator, supervisor         | Register pending-ask keyed by addressee; asker's turn ends; facilitator omits `to` → broadcast ask. |
| `Answer(message)`        | participant, supervised agent   | Resolve the pending-ask owed to the caller; delivers reply to the asker's queue.                    |
| `Announce(message)`      | both sides, both modes          | No-reply broadcast. Legitimate use of today's `Share`; never creates a pending-ask.                 |
| `Redirect(message, to?)` | facilitator, supervisor         | Unchanged: hard interrupt with replacement instructions.                                            |
| `Conclude(summary)`      | facilitator, supervisor         | Unchanged: close session.                                                                           |
| `RollCall()`             | facilitator, supervisor, agents | Unchanged: list participants.                                                                       |

`Tell`, `Share`, and the participant-side blocking `Ask` tool are removed — no
aliases. `ctx.pendingAsks: Map<addressee, {askId, askerName, question}>` lives
in the context built by `createOrchestrationContext()`.

**Rejected: keep `Tell`/`Share`, add `Ask`/`Answer` alongside.** Two
vocabularies re-introduce the "is this Tell a question or an announcement?"
ambiguity. **Rejected: distinct name for participant→facilitator Ask.**
Unnecessary asymmetry — the from/to arguments already distinguish roles.

### Pending-ask registry and turn-complete guard

The orchestrator's agent loop (in both `Facilitator` and `Supervisor`) is the
enforcement site: before emitting `lifecycle:turn_complete`, it consults
`ctx.pendingAsks`.

```mermaid
sequenceDiagram
    participant F as Facilitator
    participant R as agent loop
    participant P as Participant
    participant T as Trace

    F->>R: Ask(to=P, question)
    Note over R: pendingAsks.set(P, ask)
    R->>P: deliver as user turn
    P->>P: produce text, no Answer
    Note over R: turn ends; pendingAsks.has(P)?
    R->>P: synthetic reminder (once)
    P->>P: still no Answer
    R->>T: emit protocol_violation
    Note over R: allow turn_complete
    R-->>F: null Answer via messageBus
```

If the participant calls `Answer(message)`, the handler clears the entry, routes
the message to the asker via `messageBus`, and the runtime short-circuits the
reminder/violation path.

**Rejected:** block `turn_complete` forever (same deadlock); zero retries
(wastes a recoverable turn); unbounded retries (silent budget burn). One
reminder + one trace event is the bounded cost/signal balance.

### Supervisor parity

Supervision adopts the same vocabulary. The new tool surface:

- **Supervisor:** `Ask`, `Announce`, `Redirect`, `Conclude`, `RollCall`.
- **Supervised agent:** `Ask`, `Answer`, `Announce`, `RollCall`.

Either side can ask; either side must answer. The supervised-agent's historic
blocking `Ask` (which waited mid-tool-call for the supervisor's text) is
replaced at the toolkit layer by a non-blocking `Ask` that registers pending on
the supervisor; the supervisor's implicit text-relay reply becomes an explicit
`Answer`. Per-turn mechanics of `agent-runner.js` are unchanged (spec §
Excluded); replacement happens in the tool-server factories and the orchestrator
loop.

**Rejected: leave supervision untouched.** Two vocabularies across libeval is
worse than one. Skill-authoring cost of two vocabularies is large.

### System-prompt framing

All four prompts (`FACILITATOR_`, `FACILITATED_AGENT_`, `SUPERVISOR_`,
`AGENT_SYSTEM_PROMPT`) become descriptive, not enforcing. They name
`Ask`/`Answer`/`Announce` in one sentence each and set the conversational frame
("you are in a coaching session" / "a supervisor watches your work"). Every
"then Share", "stop making tool calls", and "do not proceed until" phrase is
removed — the runtime holds the contract now.

**Rejected: keep enforcement phrases as belt-and-suspenders.** Creates
contradiction risk when runtime and prompt disagree, and preserves the pattern
the spec set out to dismantle.

### Participant Protocol delivery

Libeval's four system prompts stay domain-agnostic (see § System-prompt
framing). Coaching-specific participant framing travels
`task-text → facilitator → libeval pass-through` to each participant's system
prompt:

- **`systemPromptAmend: string?`** on the `Facilitator` participant config —
  opaque addendum concatenated after `FACILITATED_AGENT_SYSTEM_PROMPT` before
  any `Ask` is delivered.
- **`taskAmend: string?`** on the `Facilitator`, `Supervisor`, and `AgentRunner`
  configs — promotes libeval's existing CLI-only `--task-amend` concatenation to
  a public config field; the CLI flag drives it. Same shape across all three
  orchestrators.

`taskAmend` (task-content level) and `systemPromptAmend` (system-prompt level)
form one naming family of consumer-controlled append surfaces.

**Rejected:** append the coaching protocol (or a `kata-session` pointer)
directly to `FACILITATED_AGENT_SYSTEM_PROMPT` (couples a generic library to a
specific skill); coach's first `Ask` (circular); agent-profile addendum (bleeds
into solo runs); synthetic bootstrap user message (pollutes the trace); bespoke
name unrelated to `taskAmend` (misses the harmonisation).

### Skill restructure: `kata-storyboard` → `kata-session`

Directory rename with content redistribution:

```text
kata-session/
  SKILL.md                          mode-agnostic: five questions + Ask/Answer
  references/team-storyboard.md     storyboard artifact, XmR, CSV, planning
  references/one-on-one.md          participant-trace overlay
  references/storyboard-template.md unchanged
  references/metrics.md             unchanged
```

Front-matter `name: kata-session`. KATA.md skills table, agent profiles,
workflows, and website internals update in lockstep.

**Rejected: keep the name, add a mode-agnostic section.** Compounds the
instruction-layer kludge this spec dismantles.

### Coaching workflow task-text

`kata-coaching.yml` `task-text` is the source of the coaching framing libeval's
generic prompts omit. Shape: mode, target participant, pointer to
`kata-session`, and the participant-side summary to pass through as
`systemPromptAmend`. Spec § Rewritten task-text and SC 7/SC 8 own the
constraints on what it may and may not contain.

### Protocol-violation invariants

`kata-trace/references/invariants.md` gains two entries under a new
`## Orchestrator traces` table, one per mode:

| Mode        | Evidence signature                                                                  |
| ----------- | ----------------------------------------------------------------------------------- |
| Facilitated | Count of `protocol_violation` events in combined trace == 0; `Conclude` count == 1. |
| Supervised  | Count of `protocol_violation` events in combined trace == 0; `Conclude` count == 1. |

Both reduce to the same evidence function over distinct trace shapes; the
invariant catalogue writes it once and parameterises on trace source.

**Rejected: infer violations from tool-call set differences.** No longer
necessary — the runtime emits structured events that are a direct match.

## Key Decisions

| Decision            | Chosen                                                                   | Rejected                                                           | Why                                                      |
| ------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------ | -------------------------------------------------------- |
| Primitive set       | `Ask` / `Answer` / `Announce` + Redirect/Conclude/RollCall, shared modes | Keep `Tell`/`Share`; add alongside; mode-specific names            | One vocabulary; contract encoded structurally            |
| Enforcement site    | Orchestrator turn-complete guard + `protocol_violation` event            | Prose in four prompt layers; auto-repair                           | Structural contract; violation stays loud                |
| Retry policy        | One synthetic reminder, then advance + trace event                       | Unbounded retry; no retry; block forever                           | Bounded, non-deadlocking, audible                        |
| Supervision parity  | Same vocabulary as facilitation                                          | Leave supervision's `Redirect`+`Conclude`+blocking-Ask             | One vocabulary across libeval                            |
| Prompt posture      | Descriptive only; generic language; no skill names or domain vocabulary  | Enforcement phrases; name `kata-session` in libeval                | Runtime owns the contract; libeval stays generic         |
| Participant framing | `task-text` → facilitator → libeval `systemPromptAmend` + `taskAmend`    | Append to libeval prompt; first-`Ask`; profile; bootstrap user msg | Library stays generic; one naming family for both amends |
| Skill name          | `kata-session`                                                           | `kata-storyboard` retained                                         | Name matches the skill's actual scope                    |
| Invariant source    | `protocol_violation` events from runtime                                 | Set-difference inference over Ask/Answer calls                     | Direct signal vs. inferred                               |
