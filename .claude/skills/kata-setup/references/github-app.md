# GitHub App Setup

Create a GitHub App to authenticate Kata agent workflows. The App generates
short-lived installation tokens -- no long-lived PATs to rotate.

## Hosted Alternative

Teams using the Forward Impact-hosted control plane **skip this entire
page**. Instead of registering and self-hosting an App, install the
Forward Impact-owned App from its public install URL; the hosted
`services/oidc` mints repo-scoped installation tokens at workflow run time
from a GitHub Actions OIDC identity, so no `KATA_APP_ID` /
`KATA_APP_PRIVATE_KEY` secret is configured in the consuming repository.
Set only the `FIT_OIDC_URL` repository variable and the `ANTHROPIC_API_KEY`
secret. See [TRUST.md](https://github.com/forwardimpact/monorepo/blob/main/TRUST.md) for the hosted trust model and
[`services/oidc/README.md`](https://github.com/forwardimpact/monorepo/blob/main/services/oidc/README.md)
for the exchange contract. The rest of this page is the **self-hosted**
path.

## Register the App

1. Go to **Settings > Developer settings > GitHub Apps > New GitHub App**
   (organization-owned recommended, user-owned also works).
2. Name it (e.g., `kata-agent-team`). The slug becomes the git commit author.
3. Enable the webhook. **Webhook URL** = `${GHBRIDGE_PUBLIC_URL}/api/webhook`.
   **Webhook secret** = a random 32-byte hex string (also set as
   `SERVICE_GHBRIDGE_APP_WEBHOOK_SECRET` on the ghbridge process). Discussion
   events are served by `services/ghbridge`; other events still reach GitHub
   Actions via their own triggers and need no webhook URL.
4. Under **Permissions**, set the **repository permissions** below.
5. Under **Subscribe to events**, check the events listed below.
6. Set "Where can this GitHub App be installed?" to "Only on this account."
7. Click **Create GitHub App**.

Deploy `services/ghbridge` before flipping the App webhook URL to point at
it -- the bridge must be reachable at `${GHBRIDGE_PUBLIC_URL}/api/webhook`
when GitHub starts delivering events. See
[`services/ghbridge/README.md`](https://github.com/forwardimpact/monorepo/blob/main/services/ghbridge/README.md)
for deployment, tunnel, and configuration steps.

## Repository Permissions

| Permission        | Access       | Why                                                 |
| ----------------- | ------------ | --------------------------------------------------- |
| **Contents**      | Read & write | Checkout, commit, push to fix/spec/release branches |
| **Pull requests** | Read & write | Open, comment, merge PRs                            |
| **Issues**        | Read & write | Triage, label, comment, create, close issues        |
| **Discussions**   | Read & write | Reply to discussions and discussion comments        |
| **Workflows**     | Read & write | Token-driven pushes re-trigger downstream workflows |
| **Metadata**      | Read-only    | Required by GitHub for all Apps                     |

## Event Subscriptions

The App delivers two event families through different channels. Subscribe to
the events below on the App, and both channels will fire when their respective
events arrive.

### App Webhook (served by `services/ghbridge`)

Discussion events reach `agent-dispatch` only through the App webhook URL
configured above:

- **Discussion** -- a new discussion is created, edited, or closed
- **Discussion comment** -- a reply lands on a discussion thread

### GitHub Actions Triggers (no webhook URL needed)

PR and issue events reach `agent-dispatch` via workflow triggers in
`.github/workflows/agent-dispatch.yml`; the App webhook URL is not consulted
for these:

- **Issues** -- new issues and routing/approval labels
- **Issue comment** -- triggers on PR and issue comments
- **Pull request** -- routing/approval labels and merges
- **Pull request review** -- submitted reviews (the payload carries every inline
  comment, so no separate review-comment trigger is needed)

## Webhook Events

The App webhook URL receives the two Discussion subscriptions listed above.
`services/ghbridge` verifies the `X-Hub-Signature-256` header against the
shared secret, persists thread state, and dispatches `agent-dispatch` via
`workflow_dispatch`. See
[`services/ghbridge/README.md`](https://github.com/forwardimpact/monorepo/blob/main/services/ghbridge/README.md)
for the full request/response shape, callback verdicts (`adjourned`,
`recessed`, `failed`), and resume-trigger contract.

## Install the App

1. From the App's settings page, click **Install App**.
2. Select the repository (or repositories) where Kata will run.
3. Grant the requested permissions.

## Configure Secrets

After installation, note the **App ID** (visible on the App's General page) and
generate a **private key** (PEM file).

Add three repository secrets (**Settings > Secrets and variables > Actions**):

| Secret                 | Value                         |
| ---------------------- | ----------------------------- |
| `KATA_APP_ID`          | The numeric App ID            |
| `KATA_APP_PRIVATE_KEY` | Full contents of the PEM file |
| `ANTHROPIC_API_KEY`    | Your Anthropic API key        |

Verify with:

```sh
gh secret list
```

All three must appear before running any agent workflow.
