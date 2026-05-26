# Spec 0540 — Readable Agent Workflow Logs

## Problem

Workflow logs are the primary surface humans use to study what Kata agents did —
unsupervised scheduled runs, supervised runs, and facilitated
storyboard/coaching sessions. The logs are produced by `TeeWriter` in
`libraries/libeval/src/tee-writer.js`, streamed to `stdout` of the `fit-eval`
step, and rendered by GitHub Actions in the workflow run view. Today that
surface is hard to read.

### Tool-call lines dump JSON input

`TeeWriter.flushTurns` prints every tool call as:

```
> Tool: Read {"file_path":"/home/runner/work/monorepo/monorepo/specs/STATUS","offset":0,"limit":2000}
```

The input object is `JSON.stringify`d and truncated at 200 chars
(`tee-writer.js:140-145`). A typical facilitated run emits hundreds of these
lines — braces, quotes, escaped paths, and schema keys (`file_path`, `pattern`,
`old_string`) crowd out the agent's actual text. The signal (what the agent
said) is drowned in the mechanics (how the tool was called). Readers scanning
the log for the agent's reasoning have to visually skip over JSON blobs on
almost every line.

### One agent's output is indistinguishable from another's

In `supervised` and `facilitate` modes, `TeeWriter` prefixes each line with
`[<source>]`:

```
[facilitator] I'll open the meeting with roll call.
[facilitator] > Tool: mcp__orchestration__RollCall {}
[staff-engineer] Starting review of open PRs.
[staff-engineer] > Tool: Bash {"command":"gh pr list --json number,title"}
[security-engineer] Checking dependabot alerts.
[product-manager] I'll triage open issues.
```

During a storyboard session five agents emit concurrently. The only visual
differentiator is the bracketed prefix, in the same color as every other line. A
human following a meeting cannot see at a glance which agent is talking —
especially when two agents write paragraph-length text blocks in succession and
the prefix falls above the fold. The
[kata-storyboard](../../.claude/skills/kata-storyboard/SKILL.md) protocol is
already hard to follow in real time; undifferentiated prose makes post-hoc study
of the run just as hard.

### Orchestrator events add ceremony without clarifying

`Facilitator.emitOrchestratorEvent` writes lifecycle events (`session_start`,
`agent_start`, `ask_received`, `ask_answered`, `redirect`, `summary`) into the
trace. `TeeWriter` currently ignores everything except the terminal `summary`
line, which renders as:

```
--- Evaluation completed after 42 turns ---
```

The other orchestrator events produce no human-visible output but still compete
with agent text in the raw NDJSON artifact. Readers get neither structure
markers nor quiet logs — the worst of both.

### Tool results are invisible — even failures

`TraceCollector` records tool results (`handleUser` in
`trace-collector.js:125-146`), but `TeeWriter.flushTurns` never renders them. A
`Bash` call that fails with `exit 1` and a multi-line stderr produces zero
visible output; the reader sees the agent make the call and then pivot, with no
indication of what the agent saw. Humans studying why an agent made a particular
decision need at least a hint of what came back.

### The format is a terminal log, not a document

The output is consumed in two places:

1. **GitHub Actions run view** — a web terminal that renders the standard ANSI
   SGR foreground-color codes. This is where humans actually read the logs.
2. **The `agent-trace` / `combined-trace` artifact** — raw NDJSON, kept for
   programmatic replay via `fit-eval output`. This is not a human surface.

The current formatter treats both as the same plain-text surface. There is no
use of color, no attempt to exploit the terminal medium for the one reader who
matters (a human in the GitHub UI), and no separation between "streamed human
log" and "machine-readable trace."

## Proposal

Reshape the human-facing log surface to be easier to scan, with less visual
noise, stable per-agent color coding, and brief evidence of tool activity. The
NDJSON trace artifact is unchanged — all new behaviour lives in the rendering
path (`TeeWriter` and its collaborators).

### Fewer lines, less punctuation

Remove JSON braces from the tool-call line. Each tool call renders as the tool
name plus a short human hint that makes the call identifiable without revealing
the full input object — e.g. the file path for a read/write, the first words of
a shell command, the search term for a grep. The hint is always one line,
bounded in width, and never contains `{` or `"` from the input. The raw input is
still available in the NDJSON trace.

Which hint to surface for a given tool is a design-level concern — the spec
requires only that every tool the agents actually invoke has a one-line hint,
and that the hint is meaningful for that tool type.

### Stable color per agent

Every participant in a run is assigned an ANSI foreground color rendered by the
GitHub Actions terminal. The assignment is a pure function of the participant's
profile name — same profile, same color, every time — so humans develop muscle
memory for "staff-engineer is blue." The facilitator / supervisor / coach gets a
color distinct from the domain agents. The available palette must cover at least
the largest concurrent cast in any existing workflow (today: five domain agents
plus facilitator, with red reserved for errors) with no collisions.

Color applies to the entire line the agent emits — agent text, tool-call lines,
and any per-agent markers — so a reader scanning a storyboard meeting sees color
bands rather than uniform prose. In single-agent `run` mode the color is still
applied (it costs nothing and keeps behaviour uniform across modes).

The source-prefix `[<name>]` is retained for readers whose terminal strips color
(accessibility, text search, grep over downloaded logs).

### One-line preview of each tool result

Every tool call is followed by exactly one preview line summarising what came
back — a short indicator of outcome (succeeded, with a minimal summary such as
size; or failed, with a short error indicator). Multi-line output is never
dumped into the log; the preview is strictly one line, bounded width. The
preview is visually tied to the preceding tool-call line so a reader can pair
call and result at a glance.

Errors use a reserved color (red) regardless of which agent ran them. This is
the one color override — a failed tool call is always visually distinct.

### Hide orchestrator lifecycle events

`session_start`, `agent_start`, `ask_received`, `ask_answered`, `redirect`, and
`summary` do not render to the human log. Readers infer the meeting structure
from the agent text itself (the facilitator's roll-call message, the agents'
replies, the facilitator's conclusion). The NDJSON trace still carries these
events for programmatic analysis via `fit-eval output` and the
[kata-trace](../../.claude/skills/kata-trace/SKILL.md) skill.

The `--- Evaluation completed after N turns ---` footer currently emitted by
`TeeWriter` is likewise dropped. The trailing result block rendered by
`TraceCollector.toText` at end-of-stream (turns, cost, duration) is the one
summary line humans want, and it stays.

### Simpler, not more formatted

No boxes, no banners, no separators, no emoji. The only visual devices are (a)
per-agent color on the line, (b) the existing `[<name>]` prefix in
multi-participant modes, (c) a visual tie between tool call and its result
preview, and (d) red for errors. Nothing else.

## Scope

### Affected

- `libraries/libeval/src/tee-writer.js` — rendering changes: tool-call
  formatting, per-agent color, tool-result preview line, orchestrator event
  suppression.
- `libraries/libeval/src/trace-collector.js` — `toText()` must produce output
  consistent with the live workflow log so `fit-eval output --format=text` is a
  faithful offline renderer.
- `libraries/libeval/src/commands/output.js` — no behaviour change, but its
  `--format=text` output inherits the new rendering.
- `libraries/libeval/test/` — text-rendering tests updated to cover the new
  behaviour (color assignment, tool-hint formatting, error-result styling,
  orchestrator-event suppression).

### Excluded

- **NDJSON trace format** — the raw trace emitted by `AgentRunner`,
  `Supervisor`, and `Facilitator` is unchanged. Every orchestrator and content
  event still lands in `trace.ndjson` and the uploaded artifacts.
- **Trace artifact splitting** — the `Split supervised trace` and
  `Split facilitated trace` steps in `.github/actions/kata-action/action.yml`
  keep producing `agent-trace.ndjson`, `supervisor-trace.ndjson`,
  `facilitator-trace.ndjson`, and per-agent traces.
- **Agent behaviour** — no agent profile, skill, or system prompt changes.
  Agents keep using tools exactly as they do now.
- **`fit-eval output --format=json`** — JSON rendering is unchanged.
- **Extra formatting** — no ASCII art, no section banners, no emoji, no progress
  bars.
- **Rendering beyond GitHub Actions** — local `bunx fit-eval run` inherits the
  new output, but supporting other log viewers (Slack, email, custom dashboards)
  is not in scope.

## Dependencies

- **Spec 0440** (`plan implemented`) — orchestration toolkit and facilitate mode;
  provides the `source` field this spec relies on for color selection.
- **Spec 0490** (`plan implemented`) — coach-as-facilitator; the storyboard
  session is the canonical multi-agent workload that exposes the readability
  problem.

No dependency on in-flight specs.

## Success Criteria

1. The rendering code exposes a pure, deterministic function from profile name
   to ANSI color code — given a profile name, it returns the same code every
   call, in every process, across every workflow. Distinct profile names map to
   distinct colors for at least the cast size of the largest existing workflow
   (five domain agents plus facilitator), and red is reserved for errors and
   never assigned to a profile.
2. No tool-call line for a **non-MCP** tool in the streamed log contains a `{`
   or `"` character from the tool's input object. Each non-MCP tool call
   renders as a tool name plus a single-line human-readable hint.
   **MCP-prefixed tools (`mcp__*`) are an explicit carve-out**: their tool-call
   line shows the simplified method name plus the full input rendered as
   compact single-line JSON (so `{` and `"` do appear). Readers of GitHub
   workflow logs need the full MCP payload to understand what was sent across
   the protocol.
3. Every **failed** tool call in the streamed log is followed by exactly one
   `Error:` preview line describing the failure, rendered in the reserved
   error color regardless of the calling agent's assigned color. Successful
   tool calls emit no preview line — the structured result is preserved in
   the NDJSON trace, but the streamed log stays scannable. Multi-line tool
   output never reaches the streamed log.
4. No line in the streamed log is produced by an orchestrator `session_start`,
   `agent_start`, `ask_received`, `ask_answered`, `redirect`, or `summary`
   event, and the `--- Evaluation … ---` footer previously emitted by
   `TeeWriter` is removed.
5. The NDJSON writers (`AgentRunner`, `Supervisor.emitLine`,
   `Facilitator.emitLine`, `emitOrchestratorEvent`, `emitSummary`) and the
   trace-splitting steps in `.github/actions/kata-action/action.yml` are
   unchanged by this spec; no rendering concern lives in the trace-write path.
6. Running `fit-eval output --format=text` over a captured trace produces output
   equal — ignoring ANSI escape sequences — to what that same trace produced in
   the live workflow log when it was captured. A committed fixture trace with a
   known expected rendering anchors this check.
7. `bun run check` and `bun run test` pass; new unit tests cover the pure
   profile-to-color function, tool-hint formatting for every tool the agents
   invoke, error-result styling, and orchestrator-event suppression.
