# Plan: Scheduling Agents

Re-architect Basecamp from scheduled tasks to scheduling agents who autonomously
decide what the next best action is.

## Problem

The current scheduler is a cron-style task runner. Each task has a fixed
schedule, a fixed skill, and a fixed prompt. The scheduler decides WHEN to run;
each task does exactly one thing. There is no observation, no decision-making,
no adaptation.

```
Daemon (checks time, runs due tasks)
  → Claude -p "Use skill X" (executes fixed task)
    → KB (reads/writes knowledge)
```

Three tasks run in sequence on independent timers:

1. `sync-apple-mail` — every 5 min
2. `sync-apple-calendar` — every 5 min
3. `extract-entities` — every 15 min

Each task is blind to the others. Entity extraction doesn't know whether mail
just synced. Mail sync doesn't know that a meeting is in 30 minutes and
extraction should be prioritized. No task ever decides "actually, something else
is more important right now."

## Solution

Replace tasks with agents. The scheduler still decides WHEN to wake an agent,
but the agent decides WHAT to do. Each agent observes KB state, decides the most
valuable action, and executes it.

```
Daemon (wakes agents on schedule)
  → claude --agent <name> -p "Observe and act" (autonomous agent)
    → Skills (executes chosen skill)
      → KB (reads/writes knowledge)
```

This uses Claude Code's native subagent system directly:

- Agent definitions are `.claude/agents/*.md` files in the KB
- Agents preload skills via the `skills:` frontmatter field
- Agents use `memory: project` for persistent state across invocations
- Agents can restrict tools via frontmatter
- The scheduler becomes a thin wake-up timer

## Architecture

### What Changes

| Component | Current | New |
|-----------|---------|-----|
| Config key | `tasks` | `agents` |
| Behavior definition | `scheduler.json` (prompt, skill) | `.claude/agents/*.md` (system prompt, skills, tools) |
| Decision-making | None (fixed skill per task) | Agent observes and decides each wake |
| State model | `{ status, lastRunAt, runCount, lastError }` | `{ status, lastWokeAt, lastAction, lastDecision, wakeCount, lastError }` |
| Execution | `claude --print -p "Use skill X"` | `claude --agent <name> --print -p "Wake: <context>"` |
| IPC messages | `{ tasks: {...} }` | `{ agents: {...} }` |
| CLI commands | `--run <task>` | `--wake <agent>` |

### What Stays

- **Skills** — unchanged. Still `.claude/skills/*/SKILL.md` files
- **KB structure** — unchanged. `knowledge/`, `CLAUDE.md`, `USER.md`
- **Cache** — unchanged. `~/.cache/fit/basecamp/`
- **Daemon loop** — still polls every 60s, still uses cron/interval/once schedules
- **Socket IPC** — same protocol structure (JSON lines over Unix socket)
- **posix_spawn** — same FFI for TCC inheritance
- **Settings** — same `.claude/settings.json` permissions
- **Template init** — same `--init` flow, copies template to new KB
- **Build & install** — same pipeline

## Detailed Design

### 1. Agent Definition Files

Agents are standard Claude Code subagent `.md` files with YAML frontmatter,
stored in the KB's `.claude/agents/` directory.

**Replace the three tasks with one agent:**

`template/.claude/agents/knowledge-curator.md`:

```markdown
---
name: knowledge-curator
description: >
  Maintains the personal knowledge base. Syncs data sources, extracts
  entities, and prepares contextual outputs. Woken on a schedule by the
  Basecamp scheduler.
model: sonnet
permissionMode: bypassPermissions
skills:
  - sync-apple-mail
  - sync-apple-calendar
  - extract-entities
  - draft-emails
  - meeting-prep
---

You are a knowledge curator agent. Each time you are woken by the scheduler,
you must observe, decide, and act.

## 1. Observe

Assess the current state of the knowledge base:

1. Read sync timestamps from `~/.cache/fit/basecamp/state/`:
   - `apple_mail_last_sync` — when email was last synced
   - `apple_calendar_last_sync` — when calendar was last synced
2. Run `python3 scripts/state.py check` from the extract-entities skill to
   find unprocessed files
3. Check calendar for meetings in the next 2 hours:
   `ls ~/.cache/fit/basecamp/apple_calendar/`
4. Check `drafts/` for pending email drafts

Build a status summary:
- Mail last synced: {timestamp} ({minutes} ago)
- Calendar last synced: {timestamp} ({minutes} ago)
- Unprocessed files: {count}
- Upcoming meetings (next 2h): {list}
- Pending drafts: {count}

## 2. Decide

Choose the single most valuable action. Priority order:

1. **Data sync** — if mail OR calendar not synced in last 10 minutes, sync the
   stalest source first
2. **Meeting prep** — if a meeting is within 2 hours AND no briefing exists
   for it yet
3. **Entity extraction** — if unprocessed synced files exist
4. **Draft emails** — if there are emails needing replies (detected during
   extraction)
5. **Nothing** — if everything is current, report "all current" and exit

Log your decision: what you observed, what you chose, and why.

## 3. Act

Execute the chosen action using the appropriate skill. Invoke the skill
with `/skill-name` or follow the skill's instructions directly.

After acting, report a one-line summary of what you did.
```

This single agent replaces all three scheduled tasks. It observes the full
picture and makes the best decision each wake cycle.

The `skills:` frontmatter preloads all five skill definitions into the agent's
context at startup, so it has full knowledge of each skill's inputs, outputs,
and procedures without needing to discover them.

The `permissionMode: bypassPermissions` is required because the agent runs
unattended. The existing `.claude/settings.json` deny rules still provide a
safety boundary (no curl, no sudo, no rm -rf, etc.).

### 2. Scheduler Config

**Current** `~/.fit/basecamp/scheduler.json`:

```json
{
  "tasks": {
    "sync-apple-mail": {
      "kb": "~/Documents/Personal",
      "schedule": { "type": "interval", "minutes": 5 },
      "enabled": true,
      "agent": null,
      "skill": "sync-apple-mail",
      "prompt": "Sync Apple Mail..."
    }
  }
}
```

**New** `~/.fit/basecamp/scheduler.json`:

```json
{
  "agents": {
    "knowledge-curator": {
      "kb": "~/Documents/Personal",
      "schedule": { "type": "interval", "minutes": 5 },
      "enabled": true
    }
  }
}
```

The config becomes minimal. It maps agent names to KB paths and schedules.
Everything else — behavior, skills, tools, model — is defined in the agent's
`.md` file inside the KB.

The agent name must match a file in `<kb>/.claude/agents/<name>.md`.

### 3. State Model

**Current** `~/.fit/basecamp/state.json`:

```json
{
  "tasks": {
    "sync-apple-mail": {
      "status": "finished",
      "lastRunAt": "...",
      "startedAt": null,
      "runCount": 42,
      "lastError": null
    }
  }
}
```

**New** `~/.fit/basecamp/state.json`:

```json
{
  "agents": {
    "knowledge-curator": {
      "status": "idle",
      "lastWokeAt": "2025-02-23T15:31:32.789Z",
      "lastAction": "sync-apple-mail",
      "lastDecision": "Mail not synced in 12 minutes, calendar synced 3 min ago",
      "wakeCount": 42,
      "startedAt": null,
      "lastError": null
    }
  }
}
```

Key changes:

- `lastRunAt` → `lastWokeAt` (agents are woken, not run)
- `runCount` → `wakeCount`
- Added `lastAction` — which skill the agent chose
- Added `lastDecision` — why the agent chose that action
- `status` values: `"idle"`, `"active"`, `"failed"`, `"never-woken"`

The `lastDecision` field captures the agent's reasoning. This is populated from
the agent's output — the scheduler parses the first line of stdout that starts
with `Decision:` or falls back to the first line of output.

### 4. Scheduler Code Changes (`src/basecamp.js`)

The scheduler is ~700 lines. The changes are mechanical replacements — same
structure, different vocabulary.

#### 4a. Config/state loading

```javascript
// Current
function loadConfig() {
  return readJSON(CONFIG_PATH, { tasks: {} });
}
function loadState() {
  const raw = readJSON(STATE_PATH, null);
  if (!raw || typeof raw !== "object" || !raw.tasks) {
    const state = { tasks: {} };
    saveState(state);
    return state;
  }
  return raw;
}

// New
function loadConfig() {
  return readJSON(CONFIG_PATH, { agents: {} });
}
function loadState() {
  const raw = readJSON(STATE_PATH, null);
  if (!raw || typeof raw !== "object" || !raw.agents) {
    const state = { agents: {} };
    saveState(state);
    return state;
  }
  return raw;
}
```

#### 4b. Scheduling logic

`shouldRun()` → `shouldWake()`. Same logic, same cron/interval/once support.
Only the parameter names change (`task` → `agent`, `taskState` → `agentState`).

#### 4c. Agent execution

`runTask()` → `wakeAgent()`. The core change:

```javascript
// Current
const prompt = task.skill
  ? `Use the skill "${task.skill}" — ${task.prompt}`
  : task.prompt;
const spawnArgs = ["--print"];
if (task.agent) spawnArgs.push("--agent", task.agent);
spawnArgs.push("-p", prompt);

// New
const spawnArgs = ["--agent", agentName, "--print", "-p", "Observe and act."];
```

The agent's behavior is defined in its `.md` file, so the scheduler just wakes
it. No skill name, no prompt to construct — the agent decides.

After execution, parse the agent's output for decision/action metadata:

```javascript
const lines = stdout.split("\n");
const decisionLine = lines.find((l) => l.startsWith("Decision:"));
const actionLine = lines.find((l) => l.startsWith("Action:"));

Object.assign(agentState, {
  status: "idle",
  startedAt: null,
  lastWokeAt: new Date().toISOString(),
  lastDecision: decisionLine ? decisionLine.slice(10).trim() : stdout.slice(0, 200),
  lastAction: actionLine ? actionLine.slice(8).trim() : null,
  lastError: null,
  wakeCount: (agentState.wakeCount || 0) + 1,
});
```

#### 4d. Main loop

```javascript
// Current
async function runDueTasks() {
  const config = loadConfig(), state = loadState(), now = new Date();
  for (const [name, task] of Object.entries(config.tasks)) {
    if (shouldRun(task, state.tasks[name] || {}, now)) {
      await runTask(name, task, config, state);
    }
  }
}

// New
async function wakeDueAgents() {
  const config = loadConfig(), state = loadState(), now = new Date();
  for (const [name, agent] of Object.entries(config.agents)) {
    if (shouldWake(agent, state.agents[name] || {}, now)) {
      await wakeAgent(name, agent, config, state);
    }
  }
}
```

#### 4e. CLI commands

| Current | New |
|---------|-----|
| `--run <task>` | `--wake <agent>` |
| `--status` shows tasks | `--status` shows agents |
| `--validate` checks task agents/skills | `--validate` checks agent `.md` files |

#### 4f. Full function rename map

| Current | New |
|---------|-----|
| `runTask()` | `wakeAgent()` |
| `runDueTasks()` | `wakeDueAgents()` |
| `shouldRun()` | `shouldWake()` |
| `computeNextRunAt()` | `computeNextWakeAt()` |
| `handleStatusRequest()` | unchanged (content changes) |

### 5. IPC Protocol Changes

#### Status response

```json
{
  "type": "status",
  "uptime": 3600,
  "agents": {
    "knowledge-curator": {
      "enabled": true,
      "status": "idle",
      "lastWokeAt": "2025-02-23T15:31:32.789Z",
      "nextWakeAt": "2025-02-23T15:36:32.789Z",
      "lastAction": "sync-apple-mail",
      "lastDecision": "Mail not synced in 12 minutes",
      "wakeCount": 42,
      "lastError": null
    }
  }
}
```

#### Wake request

```json
{ "type": "wake", "agent": "knowledge-curator" }
```

Replaces `{ "type": "run", "task": "sync-apple-mail" }`.

### 6. Validate Command

Current: checks that each task's `skill` and `agent` files exist.

New: checks that each configured agent has a corresponding `.md` file in the
KB's `.claude/agents/` directory.

```javascript
function validate() {
  const config = loadConfig();
  for (const [name, agent] of Object.entries(config.agents)) {
    const kbPath = expandPath(agent.kb);
    const agentFile = join(kbPath, ".claude", "agents", name + ".md");
    const found = existsSync(agentFile) ||
      existsSync(join(HOME, ".claude", "agents", name + ".md"));
    console.log(`  [${found ? "OK" : "FAIL"}]  ${name}: agent definition`);
  }
}
```

### 7. Status Command

Replace task-centric display with agent-centric:

```
Basecamp Scheduler
==================

Agents:
  + knowledge-curator
    KB: ~/Documents/Personal  Schedule: {"type":"interval","minutes":5}
    Status: idle  Last wake: 2/23/2025, 3:31:32 PM  Wakes: 42
    Last action: sync-apple-mail
    Last decision: Mail not synced in 12 minutes
```

### 8. Template Changes

#### New file: `template/.claude/agents/knowledge-curator.md`

The agent definition shown in section 1 above.

#### Delete: nothing from `template/.claude/skills/`

Skills remain exactly as they are. The agent preloads them via `skills:`
frontmatter. Skills are the agent's toolkit.

#### Update: `template/CLAUDE.md`

Replace the skills table's "Trigger" context with agent context:

```markdown
## Agent

This knowledge base is maintained by the **knowledge-curator** agent, defined
in `.claude/agents/knowledge-curator.md`. The agent is woken on a schedule by
the Basecamp scheduler. Each wake, it observes KB state, decides the most
valuable action, and executes using one of the available skills.
```

Remove the "Run this skill on a schedule" language from CLAUDE.md since the
agent handles scheduling decisions.

### 9. Default Config

`config/scheduler.json`:

```json
{
  "agents": {
    "knowledge-curator": {
      "kb": "~/Documents/Personal",
      "schedule": { "type": "interval", "minutes": 5 },
      "enabled": true
    }
  }
}
```

Replaces the three-task config with a single agent.

### 10. macOS App (Swift) Changes

The `DaemonConnection.swift` and `StatusMenu.swift` files reference `tasks` in
the IPC protocol responses. Update to read `agents` from the status JSON and
display agent state instead of task state.

- `requestRun(task:)` → `requestWake(agent:)`
- Status menu shows agent names, last action, last decision
- Run menu item becomes "Wake" menu item

### 11. Help Text

```
Basecamp — Schedule autonomous agents across knowledge bases.

Usage:
  fit-basecamp                     Wake due agents once and exit
  fit-basecamp --daemon            Run continuously (poll every 60s)
  fit-basecamp --wake <agent>      Wake a specific agent immediately
  fit-basecamp --init <path>       Initialize a new knowledge base
  fit-basecamp --validate          Validate agent definitions exist
  fit-basecamp --status            Show agent status
```

### 12. Package & Build

No structural changes. The build already copies `template/` into the app
bundle's Resources. The new `.claude/agents/` directory is just another
subdirectory of the template.

## File Change Summary

### Modified

| File | Change |
|------|--------|
| `src/basecamp.js` | Replace task model with agent model throughout |
| `config/scheduler.json` | Three tasks → one agent |
| `template/CLAUDE.md` | Add agent section, update skills context |
| `template/.claude/settings.json` | No changes needed |
| `macos/Basecamp/Sources/DaemonConnection.swift` | `tasks` → `agents` in IPC parsing |
| `macos/Basecamp/Sources/StatusMenu.swift` | Task display → agent display |
| `package.json` | Version bump |

### Added

| File | Purpose |
|------|---------|
| `template/.claude/agents/knowledge-curator.md` | Agent definition |

### Deleted

None. Skills stay. The old task config is replaced in-place, not kept alongside.

## Why This Is a Clean Break

1. **No coexistence.** The config has `agents`, not `tasks`. Old configs won't
   load — users update their `scheduler.json` (or re-init).
2. **No compatibility shims.** No `if (config.tasks) migrateTasks()`. The old
   model is gone.
3. **No wrapper functions.** `wakeAgent()` replaces `runTask()`. It's not a
   wrapper around it.
4. **All call sites updated.** CLI, daemon, IPC, status, validate — everything
   speaks agents.
5. **Delete immediately.** The `task.prompt`, `task.skill`, `task.agent` fields
   in the config are gone. The `runTask()`, `runDueTasks()`, `shouldRun()`
   functions are gone.

## Design Tradeoffs

### One agent vs. many agents

The default template ships one `knowledge-curator` agent that handles all KB
work. Users can add more agents for different concerns (e.g., a separate
`file-organizer` agent on a daily schedule). The config supports multiple agents
the same way it supported multiple tasks.

One agent is the right default because the whole point is autonomous decision-
making. An agent that sees the full picture (mail, calendar, entities, meetings)
makes better decisions than three agents that each see one slice.

### Agent output parsing

The scheduler extracts `Decision:` and `Action:` lines from agent stdout. This
is loose coupling — if the agent doesn't produce these lines, the scheduler
still works (it falls back to the first line of output). The agent's `.md` file
instructs it to produce these lines, but nothing breaks if it doesn't.

### permissionMode: bypassPermissions

Required for unattended execution. The `.claude/settings.json` deny list is
the safety boundary. This matches the current model — today's `claude --print`
invocations also run without interactive permission prompts.

### Preloaded skills vs. on-demand discovery

The agent preloads skills via `skills:` frontmatter. This means all skill
content is injected into the agent's context at startup. This is deliberate:
the agent needs to understand all available skills to make good decisions about
which one to invoke. The cost is context tokens; the benefit is informed
decision-making.

## Implementation Order

1. Add `template/.claude/agents/knowledge-curator.md`
2. Replace `config/scheduler.json` (three tasks → one agent)
3. Rewrite `src/basecamp.js` (tasks → agents throughout)
4. Update `template/CLAUDE.md` (add agent context)
5. Update Swift files (`DaemonConnection.swift`, `StatusMenu.swift`)
6. Update `package.json` version
7. Run `npm run check` and fix issues
