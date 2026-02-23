# Plan: Multi-Agent Scheduling

Re-architect Basecamp from scheduled tasks to a team of scheduling agents that
proactively assist the user with email, calendar, meeting prep, priorities, and
task tracking.

## Problem

The current scheduler is a cron-style task runner. Three tasks run on
independent timers — mail sync, calendar sync, entity extraction — each
executing a fixed skill with a fixed prompt. There is no observation, no
decision-making, no adaptation, and no proactive assistance.

```
Daemon (checks time, runs due tasks)
  → Claude -p "Use skill X" (executes fixed task)
    → KB (reads/writes knowledge)
```

The user gets raw infrastructure (synced files, extracted entities) but no
executive-level support. Nobody triages their inbox. Nobody warns them about an
unprepped meeting in 30 minutes. Nobody tracks commitments that are slipping.
Nobody gives them a morning briefing of what matters today.

A single omniscient agent (the previous plan's `knowledge-curator`) can
technically do all of this, but it creates a monolithic decision tree that grows
with every new capability. More practically, it forces a single cadence for
work that naturally operates at very different frequencies — email triage every
few minutes, meeting prep on an event-driven basis, daily briefings twice a day.

## Solution

Replace the three tasks with a team of four agents. Each agent owns a clear
domain, operates at its natural cadence, and communicates with the others
through the shared filesystem.

```
Daemon (wakes agents on schedule)
  → claude --agent inbox    -p "Observe and act."  (every 5 min)
  → claude --agent calendar -p "Observe and act."  (every 10 min)
  → claude --agent knowledge -p "Observe and act." (every 15 min)
  → claude --agent briefing -p "Observe and act."  (7am, 6pm)
```

Each agent follows the same loop:

1. **Observe** — read state files, sync timestamps, KB contents
2. **Decide** — choose the most valuable action given current state
3. **Act** — execute one skill, write results
4. **Report** — write a state file for other agents to read

The agents communicate through the shared knowledge base and cache directory.
No explicit messaging protocol — the filesystem is the message bus. The inbox
agent writes triage results; the briefing agent reads them. The calendar agent
writes an outlook; the briefing agent reads it. Each agent's output enriches
the context available to every other agent.

### What Changes

| Component | Current | New |
|-----------|---------|-----|
| Config key | `tasks` | `agents` |
| Default agents | 3 tasks (mail, cal, extract) | 4 agents (inbox, calendar, knowledge, briefing) |
| Behavior | Fixed skill per task | Agent observes and decides each wake |
| Communication | None between tasks | Shared state files in cache |
| Proactive output | None | Triage, briefings, prep alerts |
| State model | `{ status, lastRunAt, runCount }` | `{ status, lastWokeAt, lastAction, lastDecision, wakeCount }` |
| Execution | `claude --print -p "Use skill X"` | `claude --agent <name> --print -p "Observe and act."` |

### What Stays

- **Skills** — unchanged. Still `.claude/skills/*/SKILL.md` files
- **KB structure** — unchanged. `knowledge/`, `CLAUDE.md`, `USER.md`
- **Cache** — unchanged. `~/.cache/fit/basecamp/`
- **Daemon loop** — still polls every 60s, still uses cron/interval schedules
- **Socket IPC** — same protocol structure (JSON lines over Unix socket)
- **posix_spawn** — same FFI for TCC inheritance
- **Settings** — same `.claude/settings.json` permissions
- **Template init** — same `--init` flow, copies template to new KB
- **Build & install** — same pipeline

## Agent Team Design

### Skill Assignment

| Agent | Skills | Interactive Skills |
|-------|--------|--------------------|
| **Inbox** | sync-apple-mail, draft-emails | — |
| **Calendar** | sync-apple-calendar, meeting-prep, process-hyprnote | — |
| **Knowledge** | extract-entities, organize-files | — |
| **Briefing** | _(none — reads and writes only)_ | — |
| **User (manual)** | — | create-presentations, doc-collab |

`create-presentations` and `doc-collab` remain interactive skills — the user
invokes them directly through the KB. They are not assigned to any scheduled
agent.

### Agent 1: Inbox

**Domain:** Email — sync, triage, draft, track.

**Schedule:** Every 5 minutes.

**File:** `template/.claude/agents/inbox.md`

```markdown
---
name: inbox
description: >
  Manages the email channel. Syncs mail, triages new messages, drafts replies,
  and tracks threads awaiting response. Woken on a schedule by the Basecamp
  scheduler.
model: sonnet
permissionMode: bypassPermissions
skills:
  - sync-apple-mail
  - draft-emails
---

You are the inbox agent — the user's email gatekeeper. Each time you are woken
by the scheduler, you sync mail, triage what's new, and take the most valuable
action.

## 1. Sync

Check `~/.cache/fit/basecamp/state/apple_mail_last_sync`. If mail was synced
less than 3 minutes ago, skip to step 2.

Otherwise, run the sync-apple-mail skill to pull in new email threads.

## 2. Triage

Scan email threads in `~/.cache/fit/basecamp/apple_mail/`. Compare against
`drafts/drafted` and `drafts/ignored` to identify unprocessed threads.

For each unprocessed thread, classify:

- **Urgent** — deadline mentioned, time-sensitive request, escalation, VIP
  sender (someone with a note in `knowledge/People/` who the user interacts
  with frequently)
- **Needs reply** — question asked, action requested, follow-up needed
- **FYI** — informational, no action needed
- **Ignore** — newsletter, marketing, automated notification

Also scan `drafts/drafted` for emails the user sent more than 3 days ago where
no reply has appeared in the thread — these are **awaiting response**.

Write triage results to `~/.cache/fit/basecamp/state/inbox_triage.md`:

```
# Inbox Triage — {YYYY-MM-DD HH:MM}

## Urgent
- **{subject}** from {sender} — {reason}

## Needs Reply
- **{subject}** from {sender} — {what's needed}

## Awaiting Response
- **{subject}** to {recipient} — sent {N} days ago

## Summary
{total} unread, {urgent} urgent, {reply} need reply, {awaiting} awaiting response
```

## 3. Act

Choose the single most valuable action:

1. **Draft replies** — if there are urgent or actionable emails without drafts,
   use the draft-emails skill for the highest-priority thread
2. **Nothing** — if no emails need attention, report "all current"

After acting, output exactly:

```
Decision: {what you observed and why you chose this action}
Action: {what you did, e.g. "draft-emails for thread 123"}
```
```

---

### Agent 2: Calendar

**Domain:** Calendar, meeting preparation, post-meeting processing.

**Schedule:** Every 10 minutes.

**File:** `template/.claude/agents/calendar.md`

```markdown
---
name: calendar
description: >
  Manages the calendar and meeting preparation. Syncs events, creates meeting
  briefings before upcoming meetings, and processes meeting transcriptions
  afterward. Woken on a schedule by the Basecamp scheduler.
model: sonnet
permissionMode: bypassPermissions
skills:
  - sync-apple-calendar
  - meeting-prep
  - process-hyprnote
---

You are the calendar agent — the user's scheduling assistant. Each time you are
woken, you ensure the calendar is current, prepare for upcoming meetings, and
process completed meeting recordings.

## 1. Sync

Run the sync-apple-calendar skill to pull in calendar events.

## 2. Observe

Assess the current state:

1. List upcoming meetings from `~/.cache/fit/basecamp/apple_calendar/`:
   - Meetings in the next 2 hours (urgent — need prep)
   - All meetings today (for the outlook)
   - Tomorrow's first meeting (for awareness)
2. For each upcoming meeting, check whether a briefing exists:
   - Search `knowledge/People/` for notes on each attendee
   - A meeting is "prepped" if the user has recent notes on all key attendees
3. Check for unprocessed Hyprnote sessions:
   - Look in `~/Library/Application Support/hyprnote/sessions/`
   - Check each session's `_memo.md` against
     `~/.cache/fit/basecamp/state/graph_processed`

Write the calendar outlook to `~/.cache/fit/basecamp/state/calendar_outlook.md`:

```
# Calendar Outlook — {YYYY-MM-DD HH:MM}

## Next Meeting
**{title}** at {time} with {attendees}
Prep: {ready / needs briefing}

## Today's Schedule
- {time}: {title} ({attendees}) — {prep status}
- {time}: {title} ({attendees}) — {prep status}

## Unprocessed Meetings
- {session title} ({date}) — transcript available

## Summary
{count} meetings today, next in {N} min, {prep_count} need prep,
{unprocessed} transcripts to process
```

## 3. Act

Choose the single most valuable action:

1. **Meeting prep** — if a meeting is within 2 hours and key attendees lack
   recent notes, use the meeting-prep skill to create a briefing
2. **Process transcript** — if unprocessed Hyprnote sessions exist, use the
   process-hyprnote skill
3. **Nothing** — if all meetings are prepped and no transcripts pending

After acting, output exactly:

```
Decision: {what you observed and why you chose this action}
Action: {what you did, e.g. "meeting-prep for 2pm with Sarah Chen"}
```
```

---

### Agent 3: Knowledge

**Domain:** Knowledge graph maintenance, entity extraction, file organization.

**Schedule:** Every 15 minutes.

**File:** `template/.claude/agents/knowledge.md`

```markdown
---
name: knowledge
description: >
  Maintains the knowledge graph. Processes synced data into structured notes,
  extracts entities, and keeps the knowledge base organized. Woken on a
  schedule by the Basecamp scheduler.
model: sonnet
permissionMode: bypassPermissions
skills:
  - extract-entities
  - organize-files
---

You are the knowledge agent — the user's librarian. Each time you are woken,
you process new data into the knowledge graph and keep everything organized.

## 1. Observe

Assess what needs processing:

1. Check for unprocessed synced files (mail and calendar data):

       python3 scripts/state.py check

   (Run from the extract-entities skill directory:
   `.claude/skills/extract-entities/`)

2. Count existing knowledge graph entities:

       ls knowledge/People/ knowledge/Organizations/ knowledge/Projects/ knowledge/Topics/ 2>/dev/null | wc -l

Write your digest to `~/.cache/fit/basecamp/state/knowledge_digest.md`:

```
# Knowledge Digest — {YYYY-MM-DD HH:MM}

## Pending Processing
- {count} unprocessed synced files

## Knowledge Graph
- {count} People / {count} Organizations / {count} Projects / {count} Topics

## Summary
{unprocessed} files to process, graph has {total} entities
```

## 2. Act

Choose the most valuable action:

1. **Entity extraction** — if unprocessed synced files exist, use the
   extract-entities skill (process up to 10 files)
2. **Nothing** — if the graph is current

After acting, output exactly:

```
Decision: {what you observed and why you chose this action}
Action: {what you did, e.g. "extract-entities on 7 files"}
```
```

---

### Agent 4: Briefing

**Domain:** Daily synthesis, priorities, commitment tracking.

**Schedule:** Cron — `0 7 * * *` (7:00 AM) and `0 18 * * *` (6:00 PM).

**File:** `template/.claude/agents/briefing.md`

```markdown
---
name: briefing
description: >
  The user's chief of staff. Creates daily briefings that synthesize email,
  calendar, and knowledge graph state into actionable priorities. Woken at
  key moments (morning, evening) by the Basecamp scheduler.
model: sonnet
permissionMode: bypassPermissions
---

You are the briefing agent — the user's chief of staff. You create daily
briefings that synthesize everything happening across email, calendar, and the
knowledge graph into a clear picture of what matters.

## 1. Gather Intelligence

Read the state files from other agents:

1. **Inbox:** `~/.cache/fit/basecamp/state/inbox_triage.md`
   - Urgent emails, items needing reply, threads awaiting response
2. **Calendar:** `~/.cache/fit/basecamp/state/calendar_outlook.md`
   - Today's meetings, prep status, unprocessed transcripts
3. **Knowledge:** `~/.cache/fit/basecamp/state/knowledge_digest.md`
   - Pending processing, graph size

Also read directly:

4. **Calendar events:** `~/.cache/fit/basecamp/apple_calendar/*.json`
   - Full event details for today and tomorrow
5. **Open items:** Search `knowledge/` for unchecked items `- [ ]`
6. **Pending drafts:** List `drafts/*_draft.md` files

## 2. Determine Briefing Type

Check the current time:

- **Before noon** → Morning briefing
- **Noon or later** → Evening briefing

## 3. Create Briefing

### Morning Briefing

Write to `knowledge/Briefings/{YYYY-MM-DD}-morning.md`:

```
# Morning Briefing — {Day, Month Date, Year}

## Today's Schedule
- {time}: {meeting title} with {attendees} — {prep status}
- {time}: {meeting title} with {attendees} — {prep status}

## Priority Actions
1. {Most urgent item — email reply, meeting prep, or deadline}
2. {Second priority}
3. {Third priority}

## Inbox
- {urgent} urgent, {reply} needing reply, {awaiting} awaiting response
- Key: **{subject}** from {sender} — {why it matters}

## Open Commitments
- [ ] {commitment} — {context: for whom, by when}
- [ ] {commitment} — {context}

## Heads Up
- {Deadline approaching this week}
- {Email thread gone quiet — sent N days ago, no reply}
- {Meeting tomorrow that needs prep}
```

### Evening Briefing

Write to `knowledge/Briefings/{YYYY-MM-DD}-evening.md`:

```
# Evening Summary — {Day, Month Date, Year}

## What Happened Today
- {Meeting with X — key decisions, action items}
- {Emails of note — replies received, threads resolved}
- {Knowledge graph updates — new contacts, projects}

## Still Outstanding
- {Priority items from morning not yet addressed}
- {New urgent items that came in today}

## Tomorrow Preview
- {First meeting: time, attendees}
- {Deadlines this week}
- {Items to prepare}
```

## 4. Report

```
Decision: {morning/evening} briefing — {key insight about today}
Action: Created knowledge/Briefings/{YYYY-MM-DD}-{morning|evening}.md
```
```

---

## Inter-Agent Communication

Agents communicate through three mechanisms, all file-based:

### 1. State Files (Agent → Agent)

Each scheduled agent writes a structured markdown file to the cache state
directory after every wake. Other agents read these files for cross-domain
awareness.

```
~/.cache/fit/basecamp/state/
├── apple_mail_last_sync        # existing — sync timestamp
├── apple_calendar_last_sync    # existing — implicit from sync
├── graph_processed             # existing — processed files TSV
├── inbox_triage.md             # NEW — inbox agent's last triage
├── calendar_outlook.md         # NEW — calendar agent's last outlook
└── knowledge_digest.md         # NEW — knowledge agent's last digest
```

State files are overwritten on each wake (not appended). They represent the
latest snapshot, not a history. The scheduler's `state.json` tracks the
history (wake count, last action, last decision).

### 2. Knowledge Base (Agent → User → Agent)

The knowledge graph in `knowledge/` is the primary shared data store. Agents
write notes, briefings, and drafts. The user reads them. Other agents read them
for context.

```
knowledge/
├── People/          # knowledge agent writes, all agents read
├── Organizations/   # knowledge agent writes, all agents read
├── Projects/        # knowledge agent writes, all agents read
├── Topics/          # knowledge agent writes, all agents read
└── Briefings/       # briefing agent writes, user reads
    ├── 2026-02-23-morning.md
    └── 2026-02-23-evening.md

drafts/              # inbox agent writes, user reads
├── {id}_draft.md
├── drafted
└── ignored
```

### 3. Cache Directory (Agent → Agent)

Synced raw data lives in `~/.cache/fit/basecamp/`. The inbox agent syncs email
there; the knowledge agent reads it for entity extraction. The calendar agent
syncs events there; the briefing agent reads them for daily schedules.

```
~/.cache/fit/basecamp/
├── apple_mail/       # inbox agent writes, knowledge agent reads
├── apple_calendar/   # calendar agent writes, briefing/knowledge agent reads
└── state/            # all agents read/write their own state files
```

### No Explicit Messaging

There is no message queue, no pub/sub, no inter-process communication between
agents. The filesystem is the message bus. This is deliberate:

- **Observable:** Every piece of inter-agent state is a readable file
- **Debuggable:** `cat ~/.cache/fit/basecamp/state/inbox_triage.md`
- **Resilient:** If one agent fails, others continue with stale-but-valid state
- **Simple:** No coordination infrastructure to build or maintain

## Agent Execution Model

### Sequential, Priority-Ordered

When multiple agents are due in the same wake cycle, the scheduler runs them
sequentially in config order. Config order determines priority:

```json
{
  "agents": {
    "inbox": { ... },      // runs first — syncs mail for others
    "calendar": { ... },   // runs second — syncs calendar for others
    "knowledge": { ... },  // runs third — processes synced data
    "briefing": { ... }    // runs last — reads all state files
  }
}
```

This ordering ensures:

1. Data sources are synced before processing (inbox/calendar before knowledge)
2. State files are fresh before synthesis (all agents before briefing)
3. No filesystem conflicts (one agent writes at a time)

### Cadence Interaction

With the default schedules, a typical hour looks like:

```
:00  inbox → calendar → knowledge
:05  inbox
:10  inbox → calendar
:15  inbox → knowledge
:20  inbox → calendar
:25  inbox
:30  inbox → calendar → knowledge
:35  inbox
:40  inbox → calendar
:45  inbox → knowledge
:50  inbox → calendar
:55  inbox
```

Briefing runs at 7:00 AM and 6:00 PM only, after all other due agents.

The scheduler processes agents in config order for each 60-second poll. If
inbox is due at :05 and calendar is not, only inbox runs. If both are due at
:10, inbox runs first, then calendar. The existing `shouldWake()` logic handles
this — it checks each agent independently against its schedule and last wake
time.

## Scheduler Architecture

The scheduler changes from the existing plan apply directly. The infrastructure
supports multiple agents the same way it supported multiple tasks. Below is a
summary; the mechanics are the same as the previous plan with `tasks` → `agents`
vocabulary throughout.

### Config

`~/.fit/basecamp/scheduler.json`:

```json
{
  "agents": {
    "inbox": {
      "kb": "~/Documents/Personal",
      "schedule": { "type": "interval", "minutes": 5 },
      "enabled": true
    },
    "calendar": {
      "kb": "~/Documents/Personal",
      "schedule": { "type": "interval", "minutes": 10 },
      "enabled": true
    },
    "knowledge": {
      "kb": "~/Documents/Personal",
      "schedule": { "type": "interval", "minutes": 15 },
      "enabled": true
    },
    "briefing": {
      "kb": "~/Documents/Personal",
      "schedule": { "type": "cron", "expression": "0 7,18 * * *" },
      "enabled": true
    }
  }
}
```

The config maps agent names to KB paths and schedules. Everything else —
behavior, skills, model, permissions — is defined in the agent's `.md` file
inside the KB's `.claude/agents/` directory.

### State Model

`~/.fit/basecamp/state.json`:

```json
{
  "agents": {
    "inbox": {
      "status": "idle",
      "lastWokeAt": "2026-02-23T10:05:32.789Z",
      "lastAction": "draft-emails for thread 456",
      "lastDecision": "3 urgent emails, drafted reply to contract deadline thread",
      "wakeCount": 42,
      "startedAt": null,
      "lastError": null
    },
    "calendar": {
      "status": "idle",
      "lastWokeAt": "2026-02-23T10:00:15.123Z",
      "lastAction": "meeting-prep for 2pm with Sarah Chen",
      "lastDecision": "Meeting in 2h, no briefing exists for Sarah Chen",
      "wakeCount": 18,
      "startedAt": null,
      "lastError": null
    },
    "knowledge": {
      "status": "idle",
      "lastWokeAt": "2026-02-23T09:45:08.456Z",
      "lastAction": "extract-entities on 7 files",
      "lastDecision": "7 unprocessed synced files, graph has 142 entities",
      "wakeCount": 6,
      "startedAt": null,
      "lastError": null
    },
    "briefing": {
      "status": "idle",
      "lastWokeAt": "2026-02-23T07:00:02.100Z",
      "lastAction": "Created knowledge/Briefings/2026-02-23-morning.md",
      "lastDecision": "Morning briefing — 4 meetings today, 3 urgent emails",
      "wakeCount": 2,
      "startedAt": null,
      "lastError": null
    }
  }
}
```

Status values: `"idle"`, `"active"`, `"failed"`, `"never-woken"`.

The scheduler parses `Decision:` and `Action:` lines from agent stdout to
populate `lastDecision` and `lastAction`. Falls back to the first 200
characters of output if markers are absent.

### Code Changes (`src/basecamp.js`)

The same mechanical replacements as the previous plan:

| Current | New |
|---------|-----|
| `loadConfig()` returns `{ tasks: {} }` | `loadConfig()` returns `{ agents: {} }` |
| `loadState()` checks `raw.tasks` | `loadState()` checks `raw.agents` |
| `runTask(name, task, config, state)` | `wakeAgent(name, agent, config, state)` |
| `runDueTasks()` | `wakeDueAgents()` |
| `shouldRun(task, taskState, now)` | `shouldWake(agent, agentState, now)` |
| `computeNextRunAt()` | `computeNextWakeAt()` |

The execution function changes from constructing a prompt with a skill name to
invoking a named agent:

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

Output parsing for state tracking:

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

### IPC Protocol

Status response:

```json
{
  "type": "status",
  "uptime": 3600,
  "agents": {
    "inbox": {
      "enabled": true,
      "status": "idle",
      "lastWokeAt": "2026-02-23T10:05:32.789Z",
      "nextWakeAt": "2026-02-23T10:10:32.789Z",
      "lastAction": "draft-emails for thread 456",
      "lastDecision": "3 urgent emails, drafted reply",
      "wakeCount": 42,
      "lastError": null
    }
  }
}
```

Wake request: `{ "type": "wake", "agent": "inbox" }`

### Validate Command

Checks that each configured agent has a corresponding `.md` file:

```javascript
for (const [name, agent] of Object.entries(config.agents)) {
  const kbPath = expandPath(agent.kb);
  const agentFile = join(kbPath, ".claude", "agents", name + ".md");
  const found = existsSync(agentFile) ||
    existsSync(join(HOME, ".claude", "agents", name + ".md"));
  console.log(`  [${found ? "OK" : "FAIL"}]  ${name}: agent definition`);
}
```

### Status Display

```
Basecamp Scheduler
==================

Agents:
  + inbox
    KB: ~/Documents/Personal  Schedule: {"type":"interval","minutes":5}
    Status: idle  Last wake: 10:05 AM  Wakes: 42
    Last action: draft-emails for thread 456
    Last decision: 3 urgent emails, drafted reply to contract deadline

  + calendar
    KB: ~/Documents/Personal  Schedule: {"type":"interval","minutes":10}
    Status: idle  Last wake: 10:00 AM  Wakes: 18
    Last action: meeting-prep for 2pm with Sarah Chen
    Last decision: Meeting in 2h, no briefing exists

  + knowledge
    KB: ~/Documents/Personal  Schedule: {"type":"interval","minutes":15}
    Status: idle  Last wake: 9:45 AM  Wakes: 6
    Last action: extract-entities on 7 files
    Last decision: 7 unprocessed synced files

  + briefing
    KB: ~/Documents/Personal  Schedule: {"type":"cron","expression":"0 7,18 * * *"}
    Status: idle  Last wake: 7:00 AM  Wakes: 2
    Last action: Created morning briefing
    Last decision: 4 meetings today, 3 urgent emails
```

### CLI Commands

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

## Template Changes

### New Files

| File | Purpose |
|------|---------|
| `template/.claude/agents/inbox.md` | Inbox agent definition |
| `template/.claude/agents/calendar.md` | Calendar agent definition |
| `template/.claude/agents/knowledge.md` | Knowledge agent definition |
| `template/.claude/agents/briefing.md` | Briefing agent definition |
| `template/knowledge/Briefings/.gitkeep` | Empty directory for daily briefings |

### Modified Files

| File | Change |
|------|--------|
| `src/basecamp.js` | Replace task model with agent model throughout |
| `config/scheduler.json` | Three tasks → four agents |
| `template/CLAUDE.md` | Add agent team section, update skills context |
| `macos/Basecamp/Sources/DaemonConnection.swift` | `tasks` → `agents` in IPC |
| `macos/Basecamp/Sources/StatusMenu.swift` | Task display → agent display |
| `package.json` | Version bump |

### Updated: `template/CLAUDE.md`

Add a section describing the agent team:

```markdown
## Agents

This knowledge base is maintained by a team of agents, each defined in
`.claude/agents/`. They are woken on a schedule by the Basecamp scheduler.
Each wake, they observe KB state, decide the most valuable action, and execute.

| Agent | Domain | Schedule | Skills |
|-------|--------|----------|--------|
| **inbox** | Email triage and drafts | Every 5 min | sync-apple-mail, draft-emails |
| **calendar** | Meeting prep and transcripts | Every 10 min | sync-apple-calendar, meeting-prep, process-hyprnote |
| **knowledge** | Knowledge graph maintenance | Every 15 min | extract-entities, organize-files |
| **briefing** | Daily briefings and priorities | 7am, 6pm | _(reads all state)_ |

Agent state files are in `~/.cache/fit/basecamp/state/`:
- `inbox_triage.md` — latest email triage
- `calendar_outlook.md` — today's calendar outlook
- `knowledge_digest.md` — knowledge graph status

Daily briefings are in `knowledge/Briefings/`.
```

### macOS App (Swift)

Same changes as the previous plan:

- `struct TaskStatus` → `struct AgentStatus`
- `requestRun(task:)` → `requestWake(agent:)`
- Status menu shows agent names, last action, last decision
- "Run Now" → "Wake Now"

## Design Tradeoffs

### Why four agents, not one?

The single-agent design (previous plan's `knowledge-curator`) works but has
three problems that grow with capability:

1. **Monolithic decision tree.** One agent choosing between mail sync, calendar
   sync, entity extraction, meeting prep, email drafting, file organization,
   and daily briefings creates a priority chain that's hard to reason about and
   tune. Adding a new capability means rethinking the entire priority order.

2. **Single cadence.** Email triage should happen every 5 minutes. Entity
   extraction can wait 15 minutes. Daily briefings happen twice a day. A single
   agent on a 5-minute timer wastes tokens on capabilities that don't need that
   frequency. A single agent on a 15-minute timer misses urgent emails.

3. **Context bloat.** Preloading all skills into one agent's context is
   expensive. The inbox agent needs sync-apple-mail and draft-emails (2 skills).
   Loading all 7+ skills into every invocation wastes context on skills the
   agent won't use.

Four agents solve all three: each has a short, clear decision tree; each runs
at its natural cadence; each loads only its relevant skills.

### Why not more agents?

A dedicated sync agent (just mail + calendar sync) was considered but rejected.
Sync is a prerequisite for triage/prep, and bundling them in the same agent
avoids a wasted wake cycle (sync runs, then next cycle the triage agent reads
the results). The inbox agent syncs and triages in the same wake — lower
latency.

A dedicated "follow-up tracker" agent was considered but rejected. Follow-up
tracking is part of inbox triage (awaiting response) and briefing synthesis
(open commitments). Creating a separate agent would fragment email awareness.

### Why cron for briefing, not interval?

Briefings are time-anchored — a morning briefing at 10 AM is less useful than
one at 7 AM. Cron schedules (`0 7,18 * * *`) ensure briefings arrive at the
right time. Interval schedules would drift and produce briefings at random
hours.

### Why no inter-agent messaging?

Direct messaging (queues, signals, events) adds infrastructure complexity with
marginal benefit. The filesystem provides eventual consistency — the inbox
agent writes `inbox_triage.md`, and the briefing agent reads it on its next
wake. The delay is at most one briefing cycle (12 hours), which is acceptable
because briefings are daily summaries, not real-time alerts.

If real-time coordination is needed in the future (e.g., "inbox agent detects
urgent email → immediately wake briefing agent"), the scheduler can support
`{ "type": "signal", "from": "inbox", "to": "briefing" }` IPC messages. But
this is premature today.

### Why the briefing agent has no skills

The briefing agent reads files and writes markdown. It doesn't sync data,
draft emails, or extract entities — those are other agents' jobs. Giving it
skills would blur domain boundaries and create the same monolithic design we're
avoiding.

The briefing agent's value is synthesis, not action. It reads the outputs of
all other agents and produces a human-readable summary. This is a fundamentally
different kind of work.

### Cost profile

| Configuration | Invocations/hour | Notes |
|--------------|-----------------|-------|
| Current (3 tasks) | 36 | 3 tasks × 12 wakes/hour |
| Single agent (prev plan) | 12 | 1 agent × 12 wakes/hour |
| Multi-agent | ~22 | inbox(12) + calendar(6) + knowledge(4) + briefing(~0) |

Multi-agent uses fewer invocations than the current system. Each invocation is
more efficient because agents load only their relevant skills. The net token
cost is comparable to the single-agent design because smaller contexts offset
higher invocation counts.

## File Change Summary

### Added

| File | Purpose |
|------|---------|
| `template/.claude/agents/inbox.md` | Inbox agent |
| `template/.claude/agents/calendar.md` | Calendar agent |
| `template/.claude/agents/knowledge.md` | Knowledge agent |
| `template/.claude/agents/briefing.md` | Briefing agent |
| `template/knowledge/Briefings/.gitkeep` | Briefings directory |

### Modified

| File | Change |
|------|--------|
| `src/basecamp.js` | tasks → agents throughout |
| `config/scheduler.json` | 3 tasks → 4 agents |
| `template/CLAUDE.md` | Add agent team section |
| `macos/.../DaemonConnection.swift` | tasks → agents |
| `macos/.../StatusMenu.swift` | task display → agent display |
| `package.json` | version bump |

### Deleted

None. Skills stay. Config is replaced in-place.

## Why This Is a Clean Break

1. **No coexistence.** Config has `agents`, not `tasks`. Old configs won't load.
2. **No compatibility shims.** No `if (config.tasks) migrateTasks()`.
3. **No wrapper functions.** `wakeAgent()` replaces `runTask()`.
4. **All call sites updated.** CLI, daemon, IPC, status, validate.
5. **Delete immediately.** `task.prompt`, `task.skill`, `runTask()` are gone.

## Implementation Order

1. Create `template/.claude/agents/` with all four agent `.md` files
2. Create `template/knowledge/Briefings/.gitkeep`
3. Replace `config/scheduler.json` (three tasks → four agents)
4. Rewrite `src/basecamp.js` (tasks → agents throughout)
5. Update `template/CLAUDE.md` (add agent team section)
6. Update Swift files (`DaemonConnection.swift`, `StatusMenu.swift`)
7. Update `package.json` version
8. Run `npm run check` and fix issues
