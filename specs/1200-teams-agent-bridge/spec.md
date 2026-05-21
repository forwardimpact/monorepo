# Spec 1200 — Microsoft Teams Bridge for the Kata Agent Team

**JTBD:** Teams Using Agents / Run an Autonomous Development Team
(→ [Kata](../../KATA.md)). The Kata agent team is described in CLAUDE.md
as serving teams that "run an autonomous, continuously improving
development team that plans, ships, studies its own traces, and acts on
findings." This spec extends the team's reach to where engineering
conversations already happen.

## Problem

### Evidence — the agent team is unreachable from where work is discussed

The Kata agent team (agent-react.yml) responds to GitHub events: issues,
PRs, comments, discussions, and workflow_dispatch. Teams that discuss work
in Microsoft Teams cannot engage the agents without leaving the
conversation, creating a GitHub artifact, waiting for the response, and
manually relaying the result. This friction discourages adoption — the
agent team is powerful but inaccessible from the tool where conversations
already happen.

### Evidence — workflow_dispatch exists but has no return path

agent-react.yml accepts a free-form `prompt` via `workflow_dispatch`,
which routes to the facilitator without any GitHub artifact as context.
This proves the workflow can accept ad-hoc requests. But the response has
no return path — the facilitator's conclusion (verdict and summary) is
captured in the NDJSON trace and logged to stdout, but neither is exposed
to subsequent workflow steps or external systems. The workflow ends and
the conclusion is trapped in the run log.

### Evidence — the facilitate session already produces a structured conclusion

When the facilitator calls `Conclude`, the orchestration context captures
a verdict ("success" / "failure") and a free-text summary. The
`Facilitator` emits this as an NDJSON summary event of shape
`{type: "summary", verdict, summary, turns}`. This structured output is
the natural content for a response message — it just has no delivery
mechanism beyond the trace file today.

### Who is affected

- **Engineers whose daily work happens in Microsoft Teams** — they must
  context-switch to GitHub to ask the agent team anything, even a simple
  question.
- **Engineering leaders evaluating Kata adoption** — the gap between
  "where we talk" and "where agents live" is a barrier to demonstrating
  value.

## Proposal

A bridge service that connects Microsoft Teams directly to the Kata agent
team. Microsoft Teams and GitHub (issues, PRs, discussions) are two
parallel channels to the same agent team — the bridge does not tunnel
through GitHub artifacts.

### 1. Teams presence

Engineers invoke the Kata agent team from within a Microsoft Teams
conversation — group chats or channels — without leaving Teams. The bot
persona represents the Release Engineer (the facilitator of the agent
team).

### 2. Bidirectional message relay

Messages from Teams reach the agent team as facilitator tasks. The
facilitator's structured conclusion (verdict + summary) reaches the
originating Teams conversation after the facilitate session completes.
Microsoft Teams and GitHub remain independent channels — the bridge does
not create GitHub issues, discussions, or other artifacts as part of the
relay.

### 3. Response delivery from agent-react.yml

agent-react.yml currently has no mechanism to deliver the facilitator's
conclusion outside the workflow run. The bridge requires a return path:
when an external caller triggers a facilitate session, the workflow
delivers the conclusion to that caller after the session completes.

### 4. Conversation continuity

Follow-up messages in the same Teams conversation thread carry prior
exchange context so the facilitator can treat them as a continuing
conversation. Each thread maintains continuity independently.

### 5. Developer-local prototype

The prototype runs entirely on a developer's machine against a
developer/test Microsoft Teams tenant. No cloud hosting required.

## Scope

### Included

- A bridge service that runs locally and connects to a developer/test MS
  Teams instance.
- A Teams bot registration that engineers can invoke from group chats and
  channels.
- Triggering the Kata agent team with the user's message as a facilitator
  task.
- A return-path capability on agent-react.yml so the facilitator's
  conclusion reaches an external caller when one is specified.
- Posting the facilitator's response back to the originating Teams
  conversation thread.
- Conversation continuity across follow-up messages within a thread.
- Callback authentication via HMAC-SHA256 using the shared service secret
  (`SERVICE_SECRET`) and per-thread rate limiting.
- Setup instructions for the developer/test environment.

### Excluded

- Tunneling through GitHub Discussions, issues, or other GitHub artifacts
  as relay — Teams is a parallel channel, not a GitHub frontend.
- Changes to agent profiles or the fit-eval composite action.
- Changes to libeval's orchestration or agent-running logic (a small
  trace-reading utility is in scope).
- Production deployment (Azure, container hosting, managed identity).
- Multi-tenant support or organizational bot publishing.
- Rich message formatting (Adaptive Cards, images, file attachments) —
  plain text relay only.
- Authentication federation between Teams and GitHub identities.
- Message editing or deletion synchronization.
- Streaming partial responses during the facilitate session — the
  response is delivered after the session concludes.

## Success Criteria

1. An engineer invokes the bot in a Teams group chat or channel with a
   message. The Kata agent team's facilitate session fires with that
   message as the task. Verify: the GitHub Actions run log shows a
   workflow run triggered by the bridge containing the message text.

2. The facilitate session runs and the facilitator's conclusion (verdict +
   summary text) is delivered to the originating Teams conversation
   thread. Verify: a reply containing the facilitator's summary text
   appears in the same Teams thread where the message was sent, and the
   verdict is indicated.

3. A follow-up message in the same Teams thread triggers a new facilitate
   session whose task includes the prior exchange (at minimum, the
   original message and the prior response). Verify: the workflow run's
   prompt input contains text from both the original message and the
   prior facilitator summary; the response appears in the same thread.

4. The prototype runs on a developer machine with no cloud-hosted
   infrastructure beyond GitHub Actions and the Teams API. Verify: the
   bridge process starts on localhost, connects to a developer/test
   Teams tenant, and criteria 1–3 pass without any deployed cloud
   service.
