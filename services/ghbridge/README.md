# GitHub Discussions Bridge

<!-- BEGIN:description — Do not edit. Generated from package.json. -->

GitHub Discussions bridge — relay messages between GitHub Discussion threads and
the Kata agent team.

<!-- END:description -->

## Prerequisites

- A GitHub App with `discussions: write` permission and webhook subscription
  for `discussion` and `discussion_comment` events (this is the Kata App used
  elsewhere in the repo — see the kata-setup skill).
- An installation of that App on the target repository.
- A reachable public URL for the webhook endpoint (in development, a tunnel
  such as `cloudflared` produces a temporary hostname).

Configuration (loaded via `createServiceConfig("ghbridge")`):

| Env var | Purpose |
| --- | --- |
| `SERVICE_GHBRIDGE_PORT` | HTTP port (default `8080`) |
| `SERVICE_GHBRIDGE_GITHUB_REPO` | `owner/repo` target |
| `SERVICE_GHBRIDGE_CALLBACK_BASE_URL` | Public URL the workflow POSTs callbacks to |
| `SERVICE_GHBRIDGE_APP_ID` | Kata App numeric id |
| `SERVICE_GHBRIDGE_APP_PRIVATE_KEY` | PEM contents (multi-line) |
| `SERVICE_GHBRIDGE_APP_INSTALLATION_ID` | Installation id for the target repo |
| `SERVICE_GHBRIDGE_APP_WEBHOOK_SECRET` | Used to verify `X-Hub-Signature-256` |
| `STATE_DIR` | Local directory for JSONL state (default `/var/lib/ghbridge`) |

## Running

```sh
node services/ghbridge/server.js
```

In development, expose the port via a tunnel:

```sh
cloudflared tunnel --url http://localhost:8080 --protocol http2
```

Set the resulting hostname as the GitHub App's webhook URL
(`https://<tunnel-domain>/api/webhook`) and as `SERVICE_GHBRIDGE_CALLBACK_BASE_URL`.

## Smoke test

Open a new GitHub Discussion in the configured repository. The bridge:

1. Verifies the `X-Hub-Signature-256` against `app_webhook_secret`.
2. Persists a `DiscussionContext` record keyed by the discussion's `node_id`.
3. Dispatches `kata-dispatch.yml` via `workflow_dispatch`.
4. Adds an "EYES" reaction to the latest comment as a progress indicator.

The bridge then waits for the workflow's callback. When it arrives:

- If `verdict: "adjourned"` — each `reply` in `payload.replies` becomes a
  threaded comment via `addDiscussionComment`. The RFC is closed.
- If `verdict: "recessed"` — the bridge persists the trigger and re-dispatches
  the workflow with `resume_context` when the trigger fires.
- If `verdict: "failed"` — the summary is posted to the thread so the human
  sees the failure surface; no re-dispatch.
