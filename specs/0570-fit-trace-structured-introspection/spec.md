# Spec 0570 — fit-trace Structured Introspection

## Problem

Agents analyzing execution traces with fit-trace repeatedly fall back to raw
`grep` over NDJSON files because the tool lacks structured access to data
present in the raw trace stream. This was documented during a real root-cause
investigation (issue #408) where a human contributor diagnosed why two agent
runs executed without their profiles applied. Of the 10 gaps identified, 7
forced the investigator out of fit-trace and into raw NDJSON parsing — losing
the structured query interface that makes fit-trace valuable.

### Evidence

The investigator needed to answer: "which agent profile was intended, what task
was given, and why did the agent ignore its profile?" fit-trace could not answer
any of these directly:

1. **Init event invisible.** The `system/init` event carries the `agents` list,
   `cwd`, `memory_paths`, `claude_code_version`, `slash_commands`, and
   `permissionMode` — the single most diagnostic message for root-cause work.
   `overview` surfaces only a curated subset (`model`, `tools`,
   `permissionMode`). To see the full init, the investigator ran
   `grep '"subtype":"init"' trace.ndjson`.

2. **Task prompt missing.** Agent runs receive their task as the first user
   message. `overview` does not surface it. The investigator needed it to
   explain why the agent said "my domain is ambiguous" — the task text was the
   critical context. Required: `grep '"role":"user"' trace.ndjson`.

3. **`head` skips opening context.** The trace collector stores only assistant
   messages and tool results as turns; system events (init, hooks) and user text
   messages (including the task prompt) are discarded during collection. As a
   result, `head` cannot return the opening sequence — hook events, init, first
   user prompt, first assistant response — because those events never reach the
   structured trace. The investigator wanted this timeline for comparative
   analysis. Required: grep for each event type separately in raw NDJSON.

4. **No structured filter by type.** `search` matches regex on text content, but
   the investigator needed structural queries: "every tool_result that was an
   error," "every system/hook event," "every assistant turn with no text block."
   Required: piping NDJSON through grep with JSON-aware patterns.

5. **Thinking signatures dominate output.** Every `head` call returned kilobytes
   of base64 `thinking.signature` blobs embedded in assistant turn content
   blocks. The collector passes thinking blocks through to the structured trace
   without filtering. The investigator scrolled past them to reach the actual
   thinking text and tool calls.

6. **No single-turn access.** Citing a specific turn in a report required
   `batch N 1` — a workaround using range semantics for what is conceptually a
   single-item lookup.

7. **Search match descriptions are truncated.** The `search` query returns full
   turn objects alongside match descriptions, but the match descriptions use a
   fixed excerpt window (~40 characters on each side of the match). For long
   assistant messages or tool outputs, the investigator had to read the full
   turn separately to understand the match context. The match descriptions alone
   were insufficient for interpreting results without a second lookup.

Each gap added friction that compounded across the investigation. The
investigator estimated that half the analysis time was spent working around
fit-trace rather than working with it.

### Who is affected

Agents running `kata-trace` are the primary consumers. The improvement coach
uses fit-trace for every grounded theory analysis and invariant audit. The
product manager references traces when auditing spec quality. Any contributor
debugging agent behavior starts with `fit-trace download` and then hits these
same walls.

## Proposal

Add structured introspection and noise control capabilities to fit-trace so that
agents can complete a full trace analysis without falling back to raw NDJSON
parsing.

### Capabilities to add

**Structured introspection:**

- **Full init access.** Surface the complete `system/init` event — including
  `agents`, `cwd`, `memory_paths`, `claude_code_version`, and `slash_commands` —
  not just the curated metadata subset.

- **Task prompt in overview.** Extract the first user message text and include
  it as a top-level `taskPrompt` field in overview output.

- **Opening-context-aware head.** `head` should return the first N messages
  regardless of role — system, user, assistant, tool_result. Today the trace
  collector discards system events and user text messages during collection, so
  they never reach the query layer. This capability requires the structured
  trace format to expand to include these event types.

- **Type-based filtering.** Support filtering turns by structural properties:
  role (system, user, assistant, tool_result), tool name, error status. This
  complements `search` (which filters by text content) with structural queries.

- **Single-turn access.** Retrieve a single turn by its index without range
  semantics.

**Noise control:**

- **Thinking signature suppression.** Strip or truncate `thinking.signature`
  base64 blobs from output by default. Provide an opt-in flag to include them
  when needed.

**Query quality:**

- **Wider search excerpts.** The search query returns full turn objects, but
  match description strings use a narrow excerpt window. Provide an option to
  widen the excerpt or emit the full content block containing the match, so
  investigators can interpret results without a second lookup.

## Scope

### Included

- The fit-trace trace collector, query engine, and CLI command handlers in
  `@forwardimpact/libeval` — all three layers are affected because some
  capabilities require expanding what the collector stores, not just what the
  query layer exposes
- New or extended commands for the 7 capabilities listed above
- Updates to the `kata-trace` skill references if command signatures change

### Excluded

- **Cross-trace comparison** (issue #408 gap 6) — comparing two traces is a
  separate feature with different design trade-offs. Will be a follow-up spec if
  needed.
- **Workflow provenance lookup** (issue #408 gap 7) — `fit-trace info <runId>`
  is a GitHub API convenience wrapper with minimal connection to the query
  engine. Separate concern.
- **Per-turn token/cost in timeline** (issue #408 gap 10) — enhancement to an
  existing view, not a structural gap. Can be addressed independently.
- **Behavioral soft-checks** (issue #408 nits) — detecting behavioral failures
  (e.g., agent ignoring its profile) is analysis logic, not querying. Separate
  feature.
- **Upstream SDK changes** (e.g., adding `agent_type` to the init event) —
  outside this repository's control.

## Success Criteria

1. `fit-trace overview <trace>` output includes the first user message text (the
   task prompt) as a top-level field when one exists.
2. The full `system/init` event fields — including `agents`, `cwd`,
   `memory_paths`, `claude_code_version`, and `slash_commands` — are accessible
   via a fit-trace command without requiring raw NDJSON access.
3. `fit-trace head <trace> 5` returns the first 5 messages regardless of role,
   including system and user events when present in the trace.
4. A type-based filter query (e.g., filtering by role or tool name) returns
   structured JSON without requiring regex or raw NDJSON access.
5. Retrieving a single turn by index uses a direct command or argument, not
   `batch N 1`.
6. Default output from any command does not contain `thinking.signature` base64
   blobs; an explicit flag restores them.
7. Search results support a mode where match descriptions include the full
   content block rather than the default narrow excerpt window.
8. `bun run check` and `bun run test` pass with no regressions in existing
   fit-trace functionality.
