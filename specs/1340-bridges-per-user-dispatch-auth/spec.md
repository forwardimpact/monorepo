# Spec 1340: Bridges dispatch under the requester's GitHub identity

**Persona / job:** Teams Using Agents —
[Run a continuously improving agent team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team).
When a human asks the agent team to act, the team should act with *that human's*
authority — so they can trust it and so GitHub enforces their permissions.

**Depends on:** Spec 1320 (`services/oauth` + `services/ghauth`). 1320 builds
the per-user token capability; 1340 makes the two existing bridges consume it.
1340 cannot be implemented until 1320 has merged.

## Problem

`msbridge` and `ghbridge` relay a human's chat message to the Kata Agent Team
by firing `kata-dispatch` via `workflow_dispatch`. Today that dispatch runs
under a **single shared GitHub token**, never the identity of the person who
asked:

- `msbridge` constructs its `Dispatcher` with `getGithubToken` returning a
  static configured token (`ghToken`).
- `ghbridge` constructs its `Dispatcher` with `getGithubToken` returning the
  Kata Agent **Team** App installation token. The same installation credential
  also backs `ghbridge`'s reply and reaction posting.

Consequences (the same gap Spec 1320 describes, now on the consumer side):

- **No per-user authorization.** Anyone who can post in the channel triggers a
  dispatch carrying the team's full privileges; GitHub never enforces whether
  *that requester* may run the workflow on the repo.
- **No attribution.** The workflow run is traceable only to the shared
  identity, not the human who initiated it.

The bridges capture only the **conversation originator's** surface identity, set
once when the discussion context is created. `ghbridge` records the discussion
author and never updates it for a later comment, so a dispatch triggered by a
*commenter* would resolve to the wrong human. `msbridge` records the first
sender even though a later message in the thread may come from someone else.
Neither bridge records who triggered *this* dispatch, neither resolves a
per-user token, and the shared dispatch primitive in `libbridge` takes one
token fixed when it is constructed.

Spec 1320 delivers a per-user token query keyed by `(surface, surface_user_id)`
that returns either a usable token (a `string`) or a typed `LinkRequired` /
`ReAuthRequired` result, and distinguishes those from a transient failure.
Nothing consumes it yet.

## Proposal

Both bridges acquire the dispatch token **per requester** from `ghauth`, keyed
by the surface and the human who triggered the current dispatch, and handle the
absent-token cases by prompting on the channel instead of dispatching.

| Change area | What changes (WHAT, not how) |
| ----------- | ---------------------------- |
| Triggering-user capture | Each bridge identifies and records, on the discussion context, the human who triggered *this* dispatch — the comment author for `ghbridge` comment events, the message sender for `msbridge` — rather than only the conversation originator. |
| `libbridge` dispatch path | The dispatch path acquires the token for the recorded triggering requester from `ghauth`; when no usable token comes back, it does not fire `workflow_dispatch` and instead yields the `LinkRequired` / `ReAuthRequired` / transient-failure outcome to the bridge. |
| Prompt-back | On `LinkRequired`, the bridge posts the authorize URL to the channel; on `ReAuthRequired`, it posts a re-link prompt; on a transient failure, it reports a transient error — and in all three cases fires no `workflow_dispatch`. |
| Resume redispatch | A suspended conversation that resumes redispatches under the **recorded triggering requester's** token (resumes have no fresh sender), reusing the identity captured for the dispatch that entered recess. |
| Acknowledgement on no-dispatch | The "received" acknowledgement is not left dangling when a dispatch is declined for a link/re-auth/transient outcome. |
| Configuration | Each bridge gains a `ghauth` client binding so the dispatch path can reach the query. |

The `surface` passed to `ghauth` is each bridge's existing channel constant
(`msbridge` → `msteams`, `ghbridge` → `github-discussions`); the
`surface_user_id` is the triggering user's native id. The resolved per-user
token is used **only on the dispatch path** — `ghbridge`'s reply and reaction
posting continue to use the Team App installation credential.

This supersedes the bridges' construction-time fixed-token integration: the
token value is still a `string` as 1320 commits, but it is now acquired per
dispatch from the triggering requester rather than held once at construction.

## Scope

**In scope:**

- `services/msbridge/` — triggering-sender capture per message; per-user token
  acquisition on the dispatch path; the link/re-auth/transient prompt-back.
- `services/ghbridge/` — the same, with triggering-user capture distinguishing
  the comment author from the discussion author; reply/reaction path unchanged.
- `libbridge` — the shared dispatch path acquiring the token for the recorded
  triggering requester and yielding the typed link/re-auth/transient outcome;
  resume redispatch reusing the recorded requester; no dangling acknowledgement
  on the no-dispatch path.
- Configuration: a `ghauth` client binding for each bridge.

**Out of scope (explicit):**

- `services/oauth/` and `services/ghauth/` themselves (Spec 1320).
- The linking flow a user follows after seeing the prompt (lives in
  `oauth` + `ghauth`).
- Claude Chat and `services/kata` / `services/mcp`; this spec does not
  generalize the dispatch path for that future surface.
- `ghbridge`'s reply and reaction posting (stays on the installation credential).
- Rate limiting and the recess/resume *trigger* semantics, which are unchanged
  apart from the redispatch-token reuse named above.

## Success criteria

Each criterion is an observable behaviour (whether the workflow-dispatch call
fired, and what the channel received); the named test is where it is asserted.

| # | Observable behaviour | Asserted in |
| - | -------------------- | ----------- |
| 1 | A `msbridge` message from sender S causes a `ghauth` query keyed by `(msteams, S)`; a later message from a different sender T in the same thread queries `(msteams, T)`, not S. | `services/msbridge/test/dispatch-auth.test.js` |
| 2 | A `ghbridge` comment by author A on a discussion opened by B causes a query keyed by `(github-discussions, A)`; a top-level discussion by B queries `(github-discussions, B)`. | `services/ghbridge/test/dispatch-auth.test.js` |
| 3 | Given a `LinkRequired` result, the channel receives a message containing the authorize URL and the workflow-dispatch call is never invoked. | both bridges' `dispatch-auth.test.js` |
| 4 | Given a `ReAuthRequired` result, the channel receives a re-link prompt and the workflow-dispatch call is never invoked. | both bridges' `dispatch-auth.test.js` |
| 5 | Given a transient `ghauth` failure, the channel receives a transient-error message and the workflow-dispatch call is never invoked. | both bridges' `dispatch-auth.test.js` |
| 6 | Given a usable token, the workflow-dispatch call is invoked with that token and not with the static/installation token. | both bridges' `dispatch-auth.test.js` |
| 7 | After a declined dispatch (criteria 3–5), no "received" acknowledgement remains pending for that message. | `libraries/libbridge/test/dispatcher.test.js` |
| 8 | A resume redispatch invokes the `ghauth` query keyed by the requester recorded for the dispatch that entered recess, not a fresh sender. | `libraries/libbridge/test/resume-scheduler.test.js` |
| 9 | `ghbridge` reply and reaction posting still goes through the installation credential after the change. | `services/ghbridge/test/reply-path.test.js` |
| 10 | Each bridge fails to start when its `ghauth` client binding is absent from configuration. | `services/msbridge/test/startup.test.js`, `services/ghbridge/test/startup.test.js` |
