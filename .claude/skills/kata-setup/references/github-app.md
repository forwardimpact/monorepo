# GitHub App Setup

Create a GitHub App to authenticate Kata agent workflows. The App generates
short-lived installation tokens -- no long-lived PATs to rotate.

## Register the App

1. Go to **Settings > Developer settings > GitHub Apps > New GitHub App**
   (organization-owned recommended, user-owned also works).
2. Name it (e.g., `kata-agent-team`). The slug becomes the git commit author.
3. Disable the webhook (uncheck "Active") -- events are handled by GitHub
   Actions triggers, not webhook delivery.
4. Under **Permissions**, set the **repository permissions** below.
5. Under **Subscribe to events**, check the events listed below.
6. Set "Where can this GitHub App be installed?" to "Only on this account."
7. Click **Create GitHub App**.

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

Check these events so `kata-dispatch` fires on external activity:

- **Issue comment** -- triggers on PR and issue comments
- **Pull request review** -- triggers on submitted reviews
- **Pull request review comment** -- triggers on review thread replies
- **Discussion** -- triggers on new discussions
- **Discussion comment** -- triggers on discussion replies

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
