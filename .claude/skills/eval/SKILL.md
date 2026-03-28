---
name: eval
description: Evaluate coding agents generated from the career framework. Use when running agent evaluations, assessing skill adherence, or identifying improvements to skills and agent definitions.
---

# Evaluate Coding Agents

Evaluate how well agents use the skills from the career framework. When skills
are not followed, or the agent struggles with steps in a skill, the goal is to
improve said skill in the Forward Impact Team monorepo.

## When to Use

- Evaluating whether an agent follows its assigned skills correctly
- Assessing skill quality by observing agent behaviour in practice
- Identifying improvements needed in skill checklists, instructions, or tools
- Running structured evaluation sessions across agents or disciplines

## Evaluation Goal

Evaluations are **not** about whether the agent produces a good app. They assess
whether the agent **uses the skills from the career framework** as intended.

Good evaluation answers:

1. Did the agent read the skill files it was told to read?
2. Did the agent follow the checklist items (read-then-do, do-then-confirm)?
3. Did the agent use the required tools specified in the skill?
4. Did the agent ask the user when checklist items say `ASK the user`?
5. Did the agent hand off to the correct next-stage agent?
6. Where did the agent struggle or deviate from the skill?

The output of an eval is **a list of skill improvements**, not a score.

## Setup

### 1. Discover Available Agents

```sh
npx fit-pathway agent --list
```

Output is `<shortname> <discipline> <track>`, one per line. The shortname (first
column) is used with `--agent`.

### 2. Explore Agent Skills

Agents are generated using skills derived from the career framework. Each agent
carries a different set of skills depending on its discipline and track. To see
which skills a given agent will use:

```sh
npx fit-pathway agent software_engineering --track=forward_deployed --skills
```

**Important:** Always use `--track=<id>` as a flag, not a positional argument.
The CLI rejects unexpected positional args.

Then study any individual skill in detail:

```sh
npx fit-pathway skill <name>
```

This is the fastest way to understand what an agent is expected to do before
generating files or running an evaluation.

### 3. Generate Agent Files

Run from the **monorepo root** (where `package.json` with workspaces lives):

```sh
cd /path/to/pathway-community
EVAL_DIR=$(mktemp -d)
npx fit-pathway agent <discipline> --track=<track> --output=$EVAL_DIR
```

This creates:

- `.github/agents/<shortname>-<stage>.agent.md` — Agent definitions per stage
- `.claude/skills/<skill-name>/SKILL.md` — Skill files agents must read
- `.claude/skills/<skill-name>/scripts/install.sh` — Install scripts (some)
- `.claude/skills/<skill-name>/references/REFERENCE.md` — References (some)

### 4. Verify Generated Files

```sh
ls $EVAL_DIR/.github/agents/
ls $EVAL_DIR/.claude/skills/
```

## Running an Evaluation

All copilot interactions use **pipes** for prompt delivery. This is more
reliable than `-p` for multi-line prompts.

### Start a Session

Single-line prompt:

```sh
cd $EVAL_DIR
echo "I want to build a RAG app" | copilot --allow-all --model=claude-opus-4.6 --agent=<shortname>
```

Multi-line prompt with heredoc:

```sh
cd $EVAL_DIR
cat <<'EOF' | copilot --allow-all --model=claude-opus-4.6 --agent=<shortname>
I want to build a RAG application that:
- Indexes PDF documents from a local folder
- Uses embeddings for semantic search
- Answers questions with source citations
EOF
```

### Continue the Session

The `--continue` flag resumes the most recent session. This is critical for
multi-turn evaluation — each call adds to the same conversation.

```sh
echo "Yes, use Python with FastAPI" | copilot --allow-all --continue
```

```sh
cat <<'EOF' | copilot --allow-all --continue
The documents are internal engineering guidelines.
Average size is 10-20 pages. About 200 documents total.
EOF
```

### Answer Agent Questions

Agents with well-written skills will ask questions (from `ASK the user`
checklist items). **Always answer these** — it's part of what you're evaluating.

```sh
echo "Use PostgreSQL with pgvector for storage. Here is my GITHUB_TOKEN: ..." | copilot --allow-all --continue
```

### Switch Stages via Handoff

The copilot CLI does **not** support agent handoffs the way VS Code does.
Handoff buttons in VS Code switch agents within a session, but the CLI has no
equivalent mechanism. To evaluate across stages, **start a new session** with
the next-stage agent and provide context through the files the previous stage
produced.

```sh
# Stage 1: specify — produces specs/feature/spec.md
cat <<'EOF' | copilot --allow-all --model=claude-opus-4.6 --agent=<shortname>-specify
<your prompt>
EOF

# Answer questions within the same session
echo "<answers>" | copilot --allow-all --continue

# Stage 2: plan — NEW session, different agent
# The plan agent reads spec.md from disk; no need to paste it.
cat <<'EOF' | copilot --allow-all --model=claude-opus-4.6 --agent=<shortname>-plan
Create plan.md based on the spec in specs/feature/spec.md.
EOF

# Stage 3: scaffold — NEW session, different agent
echo "Set up the dev environment based on plan.md" | copilot --allow-all --model=claude-opus-4.6 --agent=<shortname>-scaffold

# Stage 4: code — NEW session, different agent
echo "Implement the tasks in plan.md" | copilot --allow-all --model=claude-opus-4.6 --agent=<shortname>-code
```

**Key points:**

- Each stage runs as a **separate `copilot` invocation** with its own `--agent`.
- Use `--continue` only for multi-turn interaction _within_ the same stage.
- Context passes between stages via files on disk (spec.md, plan.md), not
  conversation history. This is by design — each agent reads the artefacts the
  previous stage wrote.
- Tell the new agent which files to read in the prompt so it picks up context.

## Evaluation Process

### Step 1: Choose What to Evaluate

Pick a discipline, track, and stage to evaluate. Start with `specify` or `code`
stages — they exercise skills most heavily.

```sh
# Example: evaluate the SE Platform specify agent
npx fit-pathway agent software_engineering --track=platform --output=$EVAL_DIR
```

### Step 2: Read the Skills Before Evaluating

Before running the agent, read the skill files yourself so you know what the
agent _should_ do. Start by listing the agent's skills and reviewing them:

```sh
npx fit-pathway agent <discipline> <track> --skills
npx fit-pathway skill <name> --agent
```

For each skill, check:

- The `<read_then_do_<stage>>` checklist — what should the agent do first?
- The `<do_then_confirm_<stage>>` checklist — what should the agent verify?
- The `<required_tools>` section — what tools must the agent use?
- The `instructions` section — what workflow should the agent follow?

### Step 3: Run the Agent with a Realistic Prompt

Give the agent a realistic task that exercises the skills. Good eval prompts:

- Are domain-appropriate (RAG app for data engineering, API service for SE)
- Require multiple skills to complete
- Have enough ambiguity that the agent should ask clarifying questions
- Include constraints that test checklist items (e.g., specific cloud provider)

### Step 4: Observe and Record

While the session runs, record observations. Write the eval report to
`tmp/eval/` using the naming convention:

```
tmp/eval/<date>-<shortname>-<stage>.md
```

For example: `tmp/eval/2026-02-17-se-forward-deployed-specify.md`

Use this structured format:

```markdown
## Eval: <shortname> — <date>

### Prompt
<what you asked>

### Skill Adherence
| Skill | Read? | Checklists followed? | Tools used? | Issues |
| ----- | ----- | -------------------- | ----------- | ------ |
| architecture-design | Yes/No | Partial/Full/None | Yes/No | ... |

### Questions Asked
- [ ] Did the agent ask about [expected question from checklist]?
- [ ] Did the agent ask about [another expected question]?

### Handoffs
- [ ] Did the agent suggest handoff to the correct next stage?
- [ ] Was the handoff prompt accurate?

### Skill Issues Found
1. **Skill**: issue description → proposed fix
2. **Skill**: issue description → proposed fix
```

### Step 5: Trace Failures Back to Skills

When the agent deviates, determine the root cause:

| Agent Behaviour                          | Likely Root Cause                              | Fix Location                                                                                  |
| ---------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Didn't read skill files                  | Agent definition missing skill reference       | Agent template or capability YAML                                                             |
| Skipped checklist items                  | Checklist too vague or too long                | Capability YAML `stages` section                                                              |
| Used wrong tools                         | `toolReferences` incorrect or missing          | Capability YAML `toolReferences`                                                              |
| Didn't ask the user                      | Missing `ASK the user` in checklist            | Capability YAML `readChecklist`                                                               |
| Poor workflow order                      | `instructions` unclear or missing              | Capability YAML `instructions`                                                                |
| Wrong handoff                            | Agent handoff prompt incorrect                 | Stage/handoff configuration                                                                   |
| Hallucinated approach                    | Missing `implementationReference`              | Capability YAML `implementationReference`                                                     |
| Wrote questions in doc instead of asking | `--no-ask-user` flag or non-interactive mode   | Ensure copilot runs without `--no-ask-user`; check skill checklists use `ASK the user` prefix |
| `--skills` output wrong                  | Track passed as positional arg, not `--track=` | Always use `--track=<id>` flag; CLI now rejects extra positional args                         |

### Step 6: Apply Improvements

Use the `improve-skill` skill to fix issues found. Skill data lives in:

- `data/pathway/capabilities/{id}.yaml`

After fixing, regenerate and re-evaluate:

```sh
EVAL_DIR=$(mktemp -d)
npx fit-pathway agent <discipline> --track=<track> --output=$EVAL_DIR
# Re-run the same eval prompt
```

## Eval Scenarios

### Quick Smoke Test (5 min)

Test that the agent reads skills and asks questions:

```sh
cd $EVAL_DIR
echo "I want to build a web app" | copilot --allow-all --model=claude-opus-4.6 --agent=<shortname>
```

Check: Did it read skill files? Did it ask clarifying questions?

### Single-Stage Deep Eval (15 min)

Run through one full stage with realistic multi-turn interaction:

1. Start with a detailed prompt
2. Answer all agent questions
3. Let the agent complete its stage output
4. Review against every checklist item in every relevant skill

### Multi-Stage Chain Eval (30 min)

Follow the full specify → plan → scaffold → code chain. Each stage is a
**separate copilot session** with its own `--agent` flag:

1. Run the specify agent with a feature request
2. Answer questions via `--continue` until the stage completes
3. Start a **new session** with the plan agent, pointing it at spec.md
4. Start a **new session** with the scaffold agent, pointing it at plan.md
5. Start a **new session** with the code agent, pointing it at plan.md
6. Check that each stage reads the artefacts from the previous stage
7. Verify each stage reads its own stage-specific checklists

## Private Evaluation Memory

Store private evaluation notes in `.claude/memory/eval.md` (gitignored):

- **Known skill issues** discovered during prior evaluations
- **Persistent agent problems** and root causes
- **Deferred fixes** and why they were deferred
- **Environment-specific quirks** (corporate proxy, etc.)
- **Next evaluation focus areas**

Do NOT store:

- Detailed action-by-action logs of everything the agent did
- Long dated journals or narrative histories
- Sensitive user details from evaluation prompts
- Secrets, tokens, or credentials
