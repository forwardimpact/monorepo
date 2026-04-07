---
name: product-evaluation
description: >
  Supervise a product evaluation session where an agent tries a product as a
  first-time external user. Guide the session, capture feedback, and create
  GitHub issues for actionable findings.
---

# Product Evaluation

You are the supervisor in a `fit-eval supervise` relay. The task describes what
product the agent should try. The agent works in an isolated workspace with no
access to the monorepo, skills, or internal documentation.

You run in the monorepo root with full access to skills, code, and project
context. Use this knowledge to judge the agent's progress and verify its
observations — but do not leak internal details. The agent should experience the
product as an external user would.

## When to Use

- You are supervising a product evaluation scenario via `fit-eval supervise`
- The task describes a product the agent should try as a first-time user

## LLM Availability

`LLM_TOKEN` and `LLM_BASE_URL` are always present in the shell environment —
`libconfig` reads them automatically. Products with LLM features (Guide,
Basecamp) should work without the agent configuring an API key. If the agent
hits authentication errors or is prompted to supply a token, that is a **bug**
worth filing — the product's zero-configuration promise is broken.

Do not tell the agent that the token is pre-configured. The agent should
discover that LLM features work out of the box, just as a real external user
would after setting their own `LLM_TOKEN`.

## Process

### Step 1: Brief the Agent

Your first response becomes the agent's initial prompt. Include:

- What product to try and where to start (e.g. a website URL, a package name)
- What tasks to complete (install, run commands, evaluate the experience)
- How to report findings (in their output, not written to files)
- That they should work independently and follow documentation as written

Keep the briefing clear and concise. Don't over-specify steps — the agent's
independent exploration is the signal.

### Step 2: Supervise the Session

Each turn, you see the agent's full output. Decide how to respond:

| Agent State              | Your Response                                |
| ------------------------ | -------------------------------------------- |
| Making progress          | "Keep going." or similar short encouragement |
| Stuck on a specific step | Answer the specific question                 |
| Going down a dead end    | Nudge toward the documented path             |
| Looping without progress | Provide targeted guidance                    |
| Asks a direct question   | Answer it directly                           |
| Completed all tasks      | Proceed to Step 3                            |

Guidelines:

- **Let the agent work.** Don't dictate steps — let them explore and
  troubleshoot. Their independent experience is the product feedback.
- **Don't fix problems** for the agent. If installation is confusing, that's a
  finding — not something to shortcut past.
- **Note friction** even when the agent eventually succeeds. Difficulty reaching
  success indicates a documentation or UX gap.
- **Use your monorepo access** to verify the agent's observations. If the agent
  says docs are missing, check if that's true. If they hit an error, read the
  source to understand the root cause.

### Step 3: Signal Completion

When the agent has adequately completed the tasks from the briefing, write
`EVALUATION_COMPLETE` in your response and **continue with post-evaluation work
in the same turn**. Do not stop after signaling — proceed immediately to Step 4.

### Step 4: Capture Product Feedback

Review the agent's output across all turns and identify distinct feedback items.
Each item should describe a single observation — don't merge unrelated feedback.

Use the `product-feedback` skill (Part 2) to:

1. **Extract** — Identify distinct feedback items from the agent's output
2. **Classify** — Categorize each item (bug, product-aligned, documentation, out
   of scope)
3. **Check duplicates** — Search existing open issues before creating new ones
4. **Create or comment** — File new issues or comment on existing ones
5. **Summarize** — Produce a summary table of all feedback items with actions

### Step 5: Report

Produce a final summary with:

- Whether the agent completed all tasks
- Key friction points observed during the session
- Summary table of feedback items and GitHub issues created or updated

## Memory: what to record

Append to the current week's log (see agent profile for the file path):

- **Scenario** — Which evaluation scenario was run (from the task)
- **Product tested** — Which product was evaluated
- **Completion status** — Whether the agent completed all tasks
- **Key friction points** — Where the agent struggled most
- **Issues created or updated** — Issue numbers and their categories
