# Spec 1230 — Threaded discussion bridges

## Persona and job

Hired by **Teams Using Agents** to maintain a single agent team that engages
humans across multiple threaded channels — GitHub Discussions, Microsoft
Teams, and future channels — without the team owning channel-specific logic
inside the workflow that runs it.

Related JTBD: *Run an autonomous, continuously improving development team
that plans, ships, studies its own traces, and acts on findings.*

## Problem

Threaded channels are first-class places where humans coordinate with the
agent team. Today these channels are handled inconsistently.

| Channel | How it reaches the workflow today |
|---|---|
| Microsoft Teams | Dedicated service receives Bot Framework activities, dispatches the workflow via `workflow_dispatch`, and delivers replies asynchronously via a callback contract. |
| GitHub Discussions | Webhook events trigger `agent-react.yml` directly. The workflow composes Discussion-specific reply logic — including GraphQL mutation instructions for multi-addressee threads — inside the facilitator prompt. |

This split has three concrete consequences:

1. **The workflow is not channel-agnostic.** `agent-react.yml` carries
   Discussion-shaped composition logic that other channels cannot reuse.
   Adding a future channel duplicates the pattern in YAML.
2. **Reply delivery semantics drift.** Teams replies are validated,
   rate-limited, history-bounded, and rendered with typing indicators.
   Discussion replies have none of these properties because they are
   produced by a model prompt that synthesizes GraphQL mutation strings at
   runtime.
3. **Long-running coordination is impossible.** RFCs in Discussions can run
   for days — the coordination protocol allows a 14-day ownership horizon.
   The workflow must conclude within a single GitHub Actions run, so the
   agent team cannot orchestrate an RFC that awaits human responses across
   that horizon.

Additionally, the existing libeval orchestration modes (`supervise`,
`facilitate`) assume synchronous within-run coordination. Neither supports
the suspend-and-resume pattern that RFCs and the daily storyboard
(`kata-storyboard.yml`) need.

## Scope

### In scope

- A single bridge pattern for every threaded channel, expressed as a
  shared library plus per-channel adapter services.
- GitHub Discussions moves to the bridge pattern. The Kata GitHub App
  receives `discussion` and `discussion_comment` webhooks at the new
  GitHub bridge instead of at the workflow.
- Microsoft Teams moves to the bridge pattern by sharing the library,
  preserving its current contract with the workflow.
- The workflow becomes channel-agnostic. It accepts `workflow_dispatch`
  from the bridges with `(prompt, callback_url, correlation_id,
  discussion_id, resume_context?)` inputs.
- A new libeval orchestration mode for asynchronous, durable, resumable
  orchestration with humans-in-the-loop across threaded channels.
- A consolidated CLI surface — a single lead profile and lead model
  option — across `supervise`, `facilitate`, and the new mode.
- A resumption store for in-flight discussions and pending callbacks.
- Workflow renames that reflect the new responsibilities:
  `agent-react.yml` → `kata-dispatch.yml`; `agent-team.yml` →
  `kata-shift.yml`.

### Excluded

- Migrating issues, PRs, or PR-review handling out of the dispatch
  workflow — those are not threaded discussion channels.
- Changing the semantic role of GitHub Discussions in
  `coordination-protocol.md`. The RFC channel role remains.
- Adding any new channel beyond GitHub Discussions and Microsoft Teams.
- Hosting the bridge services in production infrastructure (handled
  outside this spec; tunnel-only is dev/testing).
- Removing the `supervise` or `facilitate` modes from libeval.

## Success criteria

| Claim | Verifies via |
|---|---|
| The dispatch workflow does not reference `discussion` or `discussion_comment` events. | `grep -E 'discussion(_comment)?' .github/workflows/kata-dispatch.yml` returns empty. |
| `kata-shift.yml` exists; `agent-team.yml` and `agent-react.yml` do not. | `ls .github/workflows/{agent-team,agent-react,kata-shift,kata-dispatch}.yml` — first two absent, last two present. |
| The Kata GitHub App's webhook subscription includes `discussion` and `discussion_comment` events and targets the GitHub bridge endpoint. | App configuration record under `services/ghbridge/`. |
| `services/ghbridge` and `services/msbridge` exist as siblings; `services/msteams` does not exist on `main`. | `ls services/{ghbridge,msbridge,msteams}` — first two present, last absent. |
| Both bridges depend on the shared bridge library. | `grep "@forwardimpact/libbridge" services/{gh,ms}bridge/package.json` returns matches in both. |
| Multi-addressee Discussion replies are posted from a structured callback payload, not from model-produced GraphQL strings. | `grep -E 'addDiscussionComment\|gh api graphql' .github/workflows/kata-dispatch.yml` returns empty. |
| libeval exposes a new orchestration mode parallel to `run`, `supervise`, `facilitate`, invoked as `fit-eval discuss`. | `fit-eval --help` lists the mode. |
| The new mode can suspend a run with a resumption trigger and continues correctly when the bridge re-dispatches the workflow with prior context. | An integration test posts a request-for-comment, suspends, is resumed by a follow-up webhook, and adjourns. |
| The lead role and model are configured by a single profile flag and a single model flag across all multi-agent modes; mode-specific equivalents do not exist. | `fit-eval supervise --help`, `facilitate --help`, `discuss --help` all show the consolidated flags and none of the legacy mode-specific flags. |
| Resumption state is persisted via libindex (not the wiki, not an external store). | `grep "@forwardimpact/libindex" libraries/libbridge` returns matches; nothing under `wiki/discussions/`. |
| Traces from multiple workflow runs of the same conversation are queryable as one discussion. | `fit-trace by-discussion <id>` returns all linked traces. |
| `coordination-protocol.md` still lists Discussions as the channel for RFCs and unsettled questions. | `grep -i 'discussion' .claude/agents/references/coordination-protocol.md` still returns the rows for RFCs and the "settled" routing question. |
