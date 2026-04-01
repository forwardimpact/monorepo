# Spec 260: Improvement Coach Context Efficiency

## Problem

The improvement-coach agent wastes significant tokens (40-76K) and turns (97+)
launching Explore subagents to understand codebase architecture, even when
CLAUDE.md is already loaded in context and contains comprehensive system
documentation.

### Evidence (Run 23837300331)

| Metric          | Observed                                   |
| --------------- | ------------------------------------------ |
| Subagent tokens | ~76K (haiku) for codebase exploration      |
| Subagent cost   | $0.37                                      |
| Turns consumed  | 97 (turns 3-100) waiting for subagent      |
| Redundancy      | Subagent output restated CLAUDE.md content |
| Session outcome | `error_max_turns` (50 turns exhausted)     |

The traced session hit its 50-turn limit partly because nearly half the session
was spent on exploration that duplicated already-available context.

## Goal

Reduce the improvement-coach's turn and token consumption by 30-50% through
explicit context utilization instructions.

## Scope

### In Scope

- Modify `.claude/agents/improvement-coach.md` to instruct the agent to read
  CLAUDE.md before launching exploration subagents
- Add explicit guidance on when subagent exploration is warranted vs. when
  existing context suffices
- Document the "read first, explore second" pattern for other agents

### Out of Scope

- Changes to the Explore subagent itself
- Changes to other agent definitions (those should follow as separate work)
- Increasing max_turns (addresses symptom, not cause)

## Design

### Agent Definition Changes

Add to `.claude/agents/improvement-coach.md` under the Process section, before
Step 1:

```markdown
### Step 0: Establish Context

Before selecting a workflow run or launching any exploration:

1. **Read CLAUDE.md** — It contains comprehensive documentation of the agent
   system architecture, product relationships, skill groups, and key paths.
   This is faster and cheaper than launching an Explore subagent.

2. **Check what's already in context** — The system prompt includes contextual
   information. Read it before deciding you need more information.

3. **Only launch Explore subagents for**:
   - Specific implementation details not covered in CLAUDE.md
   - Finding files matching patterns (not understanding architecture)
   - Questions that require reading source code, not documentation

This reduces token usage by ~40K per run and prevents max_turns exhaustion.
```

### Pattern Documentation

Add to CONTRIBUTING.md under a new "Agent Context Efficiency" section:

```markdown
## Agent Context Efficiency

When writing agent definitions, follow the "read first, explore second" pattern:

1. **Instruct agents to read CLAUDE.md first** — It provides comprehensive
   system context that eliminates most exploration needs.

2. **Specify when exploration is appropriate** — Exploration subagents are
   expensive (~40-70K tokens). Reserve them for specific searches, not general
   understanding.

3. **Track context utilization in coaching** — The improvement coach should
   flag agents that launch exploration for information already in context.
```

## Alternatives Considered

### 1. Increase max_turns to 75

**Rejected.** This addresses the symptom (session exhaustion) but not the cause
(inefficient context utilization). The same wasted effort would occur, just with
more budget to spare.

### 2. Pre-populate agent context with CLAUDE.md

**Rejected.** CLAUDE.md is already included in system context via the CLAUDE.md
injection mechanism. The issue is that the agent doesn't read it before
launching subagents.

### 3. Remove Explore subagent access from improvement-coach

**Rejected.** Explore is legitimately useful for finding specific files or code
patterns. The issue is using it for architectural understanding, not its
existence.

## Implementation

1. Update `.claude/agents/improvement-coach.md` with Step 0 guidance
2. Add "Agent Context Efficiency" section to CONTRIBUTING.md
3. Verify the improvement-coach skill references the new pattern

## Testing

- Run improvement-coach on a trace and verify it reads CLAUDE.md before
  launching any subagents
- Measure turn consumption on the next coaching cycle; target <30 turns for the
  initial setup phase (down from 100)

## Success Criteria

- Improvement-coach sessions complete within 50 turns without max_turns errors
- Token consumption for initial context establishment <20K (down from 76K)
- No regression in analysis quality (findings should still be thorough)
