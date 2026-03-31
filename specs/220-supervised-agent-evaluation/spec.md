# Spec 220 — Agent Execution and Supervised Evaluation

## Problem

We need two things:

1. **A single-agent runner.** Today our CI workflows shell out to the `claude`
   binary, pipe prompts through stdin, and capture stream-json output via shell
   scripting. This works but is fragile — the GitHub action hardcodes a specific
   Claude Code version, constructs CLI flags with string interpolation, and uses
   `fit-eval tee` as a post-processor. The `claude` binary is an implementation
   detail that should not leak into workflow definitions. We need a single CLI
   command that takes a task, runs an agent via the Claude Agent SDK, and
   produces a structured trace — replacing both the `claude` binary and the
   shell glue around it.

2. **A supervised runner.** We need a way to give an agent an open-ended task —
   "read the Forward Impact website and try to set up the Guide product" — and
   have a second agent supervise the process: watching what the agent does,
   answering questions it gets stuck on, nudging it when it goes off track, and
   deciding when the task is complete.

Sequential CLI invocations cannot solve the supervision case. Each invocation is
independent — the agent loses context between steps and cannot learn from its
own prior actions. If the agent gets stuck or has a question, there is no way to
respond. Real evaluation requires an adaptive supervisor that can observe and
intervene.

The single-agent case is simpler but equally important: every CI workflow that
runs a Claude agent should use the same `fit-eval` CLI rather than
reimplementing agent invocation in shell scripts.

### Prerequisites

The Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) must be added as a
dependency of `@forwardimpact/libeval`. This SDK provides the `query()` function
that manages agent sessions, tool permissions, and context loading from the
working directory. The monorepo currently has no Agent SDK dependency — it
invokes Claude Code via the `claude` binary.

## Solution

Add two subcommands to the `fit-eval` CLI that share a common structure:

### `fit-eval run` — Single Agent

Runs one Claude Agent SDK session to completion. Takes a task file, a working
directory, and an optional agent profile. Produces an NDJSON trace to stdout (or
a file). This is the direct replacement for the `claude` binary + shell
scripting in CI workflows.

The agent receives the task, works autonomously, and the command exits when the
agent is done. The output is the agent's trace — raw Claude Code stream-json
events, compatible with TraceCollector without filtering.

### `fit-eval supervise` — Supervised Agent

Runs two Claude Agent SDK sessions in a relay loop:

- An **agent** that receives a task and works on it autonomously — fetching
  docs, installing packages, running commands, writing files. When it finishes a
  turn of work or gets stuck, it reports back.
- A **supervisor** that observes the agent's output after each turn and makes a
  judgement call: let the agent continue, provide guidance, answer a question,
  or declare the evaluation complete.

The agent drives its own exploration. The supervisor does not dictate steps — it
watches, nudges, and evaluates. This models how a senior engineer might observe
a junior developer working through an unfamiliar setup: they don't hand-hold
every step, but they're available when things go sideways.

The supervisor and agent may use different agent profiles, allowing distinct
personas (e.g. a `security-engineer` supervisor observing a general-purpose
agent).

### Shared Design

Both commands share the same structure:

- Task file as input (read once at startup)
- Working directory for the agent
- Optional agent profile (from `.claude/agents/`)
- NDJSON trace as output
- Model and max-turns configuration
- Agent context from CLAUDE.md at the working directory

All scenario-specific intelligence lives in CLAUDE.md files and agent profiles
at each agent's working directory. The orchestration is generic — it knows
nothing about Guide, website docs, or npm packages. To evaluate a different
scenario, point the agents at different directories with different context.

### Directory Roles

Each agent's working directory determines what context it loads. The SDK reads
`CLAUDE.md`, `.claude/settings.json`, and `.claude/skills/` from the working
directory.

**Supervisor cwd** — Where the supervisor runs. Can be an existing project like
the monorepo root, giving it access to all skills, settings, and project
context. Or it can be a purpose-built directory with a custom `CLAUDE.md` that
encodes scenario-specific judgement rules.

**Agent cwd** — Where the agent works. Typically a fresh directory for
evaluation scenarios (simulating a new developer), but can also be an existing
project. The agent's `CLAUDE.md` and `.claude/settings.json` at this path
control its persona and tool permissions.

**Task file** — The task given to the agent on the first turn. A plain text or
markdown file read once at startup and passed to the agent as its initial
prompt. Task files live in `.github/tasks/` for CI workflows and in scenario
directories for supervised evaluations.

### Interaction Model

The agent works. The supervisor watches and decides what to do next.

```
Agent receives task, works autonomously
  ↓
Agent completes a turn of work (or gets stuck, or asks a question)
  ↓
Supervisor observes agent's output, decides:
  CONTINUE  → "Keep going." (agent continues where it left off)
  NUDGE     → "Try checking the CLI reference page." (guidance)
  ANSWER    → "The data dir is ./data/pathway/." (direct answer)
  DONE      → Evaluation complete, emit final assessment
  ↓
Agent receives supervisor response, resumes work
  ↓
... repeats until DONE or maxTurns reached
```

Both agents retain full conversation history via session resumption. The agent
remembers every action it took across all turns. The supervisor remembers every
observation and intervention it made.

The supervisor's response becomes the agent's next prompt. The relay is text
passing between two persistent sessions. All intelligence — what "done" means,
what kind of nudges to give, when to intervene — lives in the supervisor's
context (CLAUDE.md, agent profile, skills).

### Output Format

**`fit-eval run`** emits raw Claude Code stream-json NDJSON — the same format
TraceCollector already processes. No wrapper fields, no filtering needed. This
is a drop-in replacement for `claude --output-format stream-json`.

**`fit-eval supervise`** emits an interleaved NDJSON stream. Each line from
either agent's SDK stream is tagged with a `source` and `turn` field:

| Source         | What it contains                                          |
| -------------- | --------------------------------------------------------- |
| `agent`        | Full SDK event stream — tool calls, text, token usage     |
| `supervisor`   | Lighter stream — mostly text decisions, few/no tool calls |
| `orchestrator` | Final summary line with aggregate turns and success       |

Filter by `source=="agent"` to extract a standard trace compatible with
TraceCollector, `fit-eval output`, and `fit-eval tee`.

### CI Integration

The `.github/actions/claude/` action is replaced with a
`.github/actions/fit-eval/` action that calls `fit-eval run` or
`fit-eval supervise` depending on inputs. No `claude` binary installation, no
shell-script flag construction — just `bunx fit-eval run --task=...`.

Workflows declare _what_ to run, not _how_ to invoke Claude. Task files in
`.github/tasks/` replace inline prompt strings. Agent profiles previously
selected via the `agent:` input continue to work via the `--agent` flag.

### Agent Profile Migration

The four existing agent profiles (`security-engineer`, `product-manager`,
`release-engineer`, `improvement-coach`) in `.claude/agents/` are unchanged. The
`--agent` flag on both `run` and `supervise` replaces the action's `agent:`
input. The `supervise` command accepts separate flags for the supervisor and
agent profiles, since they may need different personas.

The seven CI workflows that currently use `.github/actions/claude` migrate to
`.github/actions/fit-eval`. Each workflow's inline `prompt:` string moves to a
task file in `.github/tasks/`. The `agent:` input maps to the `--agent` flag.

## Scope

### In scope

1. **`fit-eval run` subcommand** — Accepts a task file, working directory, and
   optional agent profile. Runs a single agent via the SDK. Produces raw
   stream-json NDJSON compatible with TraceCollector.

2. **`fit-eval supervise` subcommand** — Accepts a task file, supervisor cwd,
   agent cwd, and optional agent profiles for each. Runs the supervisor ↔ agent
   relay using session resumption.

3. **AgentRunner class** — Runs a single agent session. Follows the OO+DI
   pattern (constructor injection, factory function). Used directly by `run` and
   composed into the Supervisor for `supervise`.

4. **Supervisor class** — The generic relay loop. Composes an AgentRunner for
   the agent side. Manages session resumption, enforces turn limits, emits
   interleaved NDJSON.

5. **Command handlers** — Parse CLI args, validate paths, wire real
   dependencies, run the appropriate class, and write output.

6. **`.github/actions/fit-eval/` action** — Replaces `.github/actions/claude/`.
   All seven existing workflows migrate to this action.

7. **Task files** — `.github/tasks/` directory with one markdown task file per
   CI workflow, replacing inline prompt strings.

8. **Guide setup scenario** — A supervised scenario demonstrating the pattern. A
   task file and CLAUDE.md context that encode a Guide product setup evaluation.
   Custom supervisor context with explicit judgement rules.

9. **Guide onboarding scenario** — A supervised scenario using the existing
   `product-manager` agent profile as the supervisor. Tests the end-to-end user
   journey: visit the website, follow getting-started docs, install fit-guide,
   and run real prompts. The product-manager evaluates from a product quality
   perspective.

### Out of scope

- Parallel agents (single agent per run).
- Nested supervision (two layers only).
- MCP server integration (built-in Claude Code tools only).
- Changes to TraceCollector's event schema.

## Example: Guide Setup Scenario

The first scenario demonstrates the pattern. The supervisor runs from the
monorepo root (inheriting all skills and project context). The agent starts in a
fresh temp directory.

**Task:** Go to www.forwardimpact.team, find the Guide product, read the
documentation, and try to install and configure it in a fresh project. Do not
clone the monorepo — install from npm. Write notes about your experience in
`./notes/`.

**Supervisor context:** Inherits the monorepo's full CLAUDE.md and skills,
giving it deep product knowledge — it knows what `fit-pathway init` does, what
packages exist, what the correct setup steps are.

**Agent context:** Minimal. A CLAUDE.md that says "work independently, read
docs, troubleshoot errors, write notes."

**Supervisor judgement rules** (encoded in scenario context):

- Intervene when the agent is stuck in a loop, going down a dead end, or asks a
  question. Let the agent continue when making progress or troubleshooting.
- Completion criteria: agent has installed @forwardimpact packages, initialized
  framework data, run `fit-map validate`, and written an assessment.

## Success Criteria

**`fit-eval run` (single agent):**

- `AgentRunner` follows the OO+DI pattern — constructor injection, factory
  function, tests bypass factory and inject mocks directly
- `fit-eval run` works end-to-end with any combination of flags
- NDJSON output is raw stream-json, directly compatible with TraceCollector
- Produces the same trace quality as the current `claude` binary +
  `fit-eval tee` pipeline
- Agent profiles work via `--agent` flag

**`fit-eval supervise` (supervised agent):**

- `Supervisor` composes `AgentRunner` — does not duplicate its logic
- `fit-eval supervise` works end-to-end with any combination of flags
- NDJSON output is filterable to a standard TraceCollector-compatible trace
  (filter by `source=="agent"` to strip `source`/`turn` wrapper fields)
- Turn limits are enforced
- The supervisor terminates cleanly via DONE rather than hitting maxTurns
- Supervisor and agent can use different agent profiles

**CI migration:**

- `.github/actions/fit-eval/` action replaces `.github/actions/claude/`
- All seven existing workflows work with the new action
- No `claude` binary or `@anthropic-ai/claude-code` installation in CI
- Task files in `.github/tasks/` replace inline prompt strings
- Agent profile selection preserved via `--agent` flag

**Guide setup scenario (custom supervisor context):**

- The agent discovers Guide from the website without being told specific URLs
- The agent installs `@forwardimpact` packages from npm
- The agent initializes framework data and attempts job/agent generation
- The agent produces notes with specific documentation feedback
- The supervisor intervenes only when the agent is genuinely stuck

**Guide onboarding scenario (product-manager supervisor):**

- The product-manager agent profile works as a supervisor without modification
- The agent follows website documentation to install and run fit-guide
- The agent runs at least three different fit-guide prompts
- The agent produces notes evaluating the onboarding experience
- The product-manager nudges based on its product knowledge, not custom rules
- The scenario reveals documentation gaps and product quality issues
