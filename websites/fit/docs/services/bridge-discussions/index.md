---
title: Bridge GitHub Discussions to the Agent Team
description: Stand up the ghbridge service so a new discussion or comment dispatches a Kata session and the lead's replies post back to the same thread.
---

Engineers open RFCs in GitHub Discussions. The Kata agent team can engage,
deliberate over the 14-day coordination horizon, and post structured replies
back -- but only with a bridge between the Discussion webhook and the
`kata-dispatch` workflow. The `ghbridge` service is that bridge. A new
discussion or a follow-up comment in the configured repository fires a
webhook, the bridge verifies the signature, dispatches the workflow with the
prior thread history, and posts the lead's structured replies back to the
same thread when the workflow finishes.

This guide walks through the operational steps to stand up `ghbridge` for a
target repository: GitHub App permissions, credentials, tunnel + bridge
startup, App webhook configuration, and end-to-end verification.

For the library primitives `ghbridge` is built on, see
[Bridge a Threaded Channel to the Agent Team](/docs/libraries/bridge-channels/).
For the suspend/resume contract unique to ghbridge, see
[Resume a Recessed RFC When a Trigger Fires](/docs/services/bridge-discussions/resume-recessed/).

## Prerequisites

- The Kata Agent Team **GitHub App** with `discussions: write` permission
  and webhook subscriptions for `discussion` and `discussion_comment`
  events (kata-setup handles initial creation).
- An installation of that App on the target repository.
- A GitHub token with `actions:write` on the target repository.
  `libconfig` falls back to `gh auth token` when `GH_TOKEN` is not set in
  `.env`, so `gh auth login` is sufficient.
- The `cloudflared` CLI on the host (used by the tunnel sidecar).

## Architecture overview

`ghbridge` runs alongside a tunnel sidecar (`ghtunnel`) and connects three
ends — the App webhook for `discussion` and `discussion_comment` events,
the GitHub Actions workflow via `workflow_dispatch`, and the same
discussion thread for the replies posted back via the GraphQL
`addDiscussionComment` mutation:

```text
Discussion ──webhook── ghtunnel ── ghbridge ──dispatch──> kata-dispatch
     ▲                              │
     └────────── GraphQL ───────────┘
```

The service is built on `@forwardimpact/libbridge` — the channel-agnostic
intake skeleton, `Dispatcher` (the dispatch dance), `Acknowledgement`
(reaction lifecycle), `ResumeScheduler` (suspend/resume), callback
registry, rate limiter, history bound, prompt builder, durable thread
state, and trigger evaluator all come from the library. `ghbridge` owns
the GitHub-specific glue: webhook signature verification, App
installation token minting, and the GraphQL reaction and reply adapters.

## Configure credentials

Set the credentials and service parameters in `.env`. All are loaded via
`createServiceConfig("ghbridge")`:

| Env var                                  | Purpose                                                          |
| ---------------------------------------- | ---------------------------------------------------------------- |
| `SERVICE_GHBRIDGE_GITHUB_REPO`           | `owner/repo` target for workflow dispatch and GraphQL replies    |
| `SERVICE_GHBRIDGE_CALLBACK_BASE_URL`     | Public URL the workflow POSTs callbacks back to                  |
| `SERVICE_GHBRIDGE_APP_ID`                | Kata App numeric ID                                              |
| `SERVICE_GHBRIDGE_APP_PRIVATE_KEY`       | PEM contents (see § Private key format below)                    |
| `SERVICE_GHBRIDGE_APP_INSTALLATION_ID`   | Installation ID for the target repo                              |
| `SERVICE_GHBRIDGE_APP_WEBHOOK_SECRET`    | Shared secret used to verify `X-Hub-Signature-256`               |

Discussion context is persisted as JSONL under `data/bridges/ghbridge/`
through `libstorage`. The default `createStorage` path is used; no extra
env var is needed.

### Private key format

The PEM file must be entered as a single line with literal `\n` replacing
each line break, wrapped in double quotes:

```
SERVICE_GHBRIDGE_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n...\n-----END RSA PRIVATE KEY-----"
```

Convert a `.pem` file to this format with `awk`:

```sh
awk 'NR>1{printf "\\n"}{printf "%s",$0}' path/to/your-key.pem
```

Paste the output between double quotes after the `=`.

## Start the bridge

Add `ghtunnel` and `ghbridge` to `config/config.json` under
`init.services`, in that order, so restarting the bridge does not cycle
the tunnel.

Start both services:

```sh
just rc-start
```

The tunnel publishes a fresh `trycloudflare.com` hostname on every
restart. Read it from the tunnel log:

```sh
grep trycloudflare.com data/logs/ghtunnel/current
```

## Configure the App webhook

In the App settings
(`github.com/organizations/<org>/settings/apps/<app>`):

1. Under **Webhook**, check *Active*.
2. Set **Webhook URL** to `https://<tunnel-domain>/api/webhook`.
3. Set **Secret** to a shared value and save the same value as
   `SERVICE_GHBRIDGE_APP_WEBHOOK_SECRET` in `.env`.
4. Under **Permissions & events → Subscribe to events**, check
   *Discussions* and *Discussion comments*.
5. Save changes.

Set `SERVICE_GHBRIDGE_CALLBACK_BASE_URL` in `.env` to the tunnel domain
(no trailing path), then pick up the change without recycling the
tunnel:

```sh
bunx fit-rc restart ghbridge
```

The tunnel hostname survives bridge restarts because the tunnel is a
separate service that restarts independently.

## Verify

Open a new GitHub Discussion in the configured repository. The bridge:

1. Verifies the `X-Hub-Signature-256` header against the webhook secret.
2. Loads or creates a `DiscussionContext` record keyed by the
   discussion's `node_id` and persists it under `data/bridges/ghbridge/`
   via `libstorage`.
3. Hands the dispatch to `libbridge`'s `Dispatcher`, which registers a
   callback token, fires `kata-dispatch.yml` via `workflow_dispatch`,
   appends the user text to history, and flushes the store.
4. Adds an "EYES" reaction to the message that prompted the dispatch
   (the new discussion node, or a new comment node on follow-ups) via
   the `addReaction` GraphQL mutation — held for the duration of the
   workflow run.

When the workflow finishes, the bridge consumes the callback. For every
verdict it posts each `reply` in `payload.replies` as a threaded comment
via `addDiscussionComment`, appends those replies to history, and
removes the "EYES" reaction via `removeReaction`. The verdict then
decides what happens next:

| Verdict       | Effect                                                                                                            |
| ------------- | ----------------------------------------------------------------------------------------------------------------- |
| `adjourned`   | `ResumeScheduler.cancelRecess(...)` clears any open RFC and elapsed timer for this correlation id.                |
| `recessed`    | `ResumeScheduler.enterRecess(...)` persists the trigger on `open_rfcs[correlation_id]` and arms an elapsed timer if the trigger has an elapsed component. The bridge re-dispatches with `resume_context` when the trigger fires. |
| `failed`      | `ResumeScheduler.cancelRecess(...)` clears state and `payload.summary` is posted as an additional standalone comment on the thread. No re-dispatch. |

You have reached the outcome of this guide when:

- A new discussion in the configured repository receives an "EYES"
  reaction within seconds of being posted, and the reaction disappears
  once the workflow callback arrives.
- The Actions tab on the repository shows a fresh `kata-dispatch.yml`
  run triggered by the bridge dispatch.
- When the workflow returns an `adjourned` verdict, every `reply` in
  the callback payload appears as a threaded comment on the discussion.
- A follow-up comment on the same thread either fires a trigger (if an
  RFC is in `recessed` state and the trigger condition is met) or
  accumulates into the history without spawning a parallel workflow run.

If webhook delivery fails, confirm the App webhook log in the App
settings shows successful deliveries; a `401 Invalid signature`
response from the bridge usually means the webhook secret in `.env` and
in the App settings have drifted. If you are on a corporate VPN with
tenant restrictions, outbound calls to `api.github.com` may be blocked;
disconnect or allowlist the endpoint.

## What's next

<div class="grid">

<!-- part:card:resume-recessed -->

</div>
