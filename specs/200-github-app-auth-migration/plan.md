# Plan 200: GitHub App Authentication Migration

## Approach

Replace the PAT-based authentication with a GitHub App that generates
short-lived installation tokens per workflow run. Use the official
`actions/create-github-app-token` action (already permitted under the
CONTRIBUTING.md policy — it is a first-party `actions/*` action).

Token generation happens at the workflow level, not inside the composite action.
The `actions/checkout` step runs before the composite action and needs the token
to clone the repository (so pushes trigger downstream workflows). Generating the
token once at the workflow level and passing it to both `actions/checkout` and
the composite action via `GH_TOKEN` is simpler than splitting responsibility.

The migration has three phases: create the App, update the workflows and
composite action, and update documentation.

## Prerequisites

Before implementation begins:

1. Look up the current latest stable release SHA for
   `actions/create-github-app-token` (v1) and record it. All workflow files must
   pin to this SHA per CONTRIBUTING.md § Security.

## Phase 1: Create the GitHub App

### 1.1 App Configuration

Create a public GitHub App named **Forward Impact CI** (or similar) under the
`forwardimpact` organization with these settings:

| Setting               | Value                                               |
| --------------------- | --------------------------------------------------- |
| **Homepage URL**      | `https://github.com/forwardimpact/monorepo`         |
| **Webhook**           | Disabled (no webhook URL needed — token-only usage) |
| **Public/Private**    | Public (so downstream installations can use it)     |
| **Repository access** | Only selected repositories (per installation)       |

### 1.2 Permissions

The App needs the same permissions the PAT currently provides, scoped to the
minimum each workflow requires:

| Permission        | Access     | Used by                                                           |
| ----------------- | ---------- | ----------------------------------------------------------------- |
| **Contents**      | Read/Write | All agent workflows (push commits, read code)                     |
| **Pull requests** | Read/Write | dependabot-triage, product-backlog, release-\*, improvement-coach |
| **Issues**        | Read/Write | improvement-coach (open issues for findings)                      |
| **Actions**       | Read       | improvement-coach (download trace artifacts)                      |
| **Metadata**      | Read       | All (granted by default)                                          |

The `security-audit` workflow uses `contents: read` — the App token is scoped by
the workflow's `permissions` block, so least privilege is preserved even though
the App has write access.

### 1.3 Install the App

1. Install the App on the `forwardimpact/monorepo` repository.
2. Note the **App ID** and generate a **private key**.
3. Store as repository secrets:
   - `CI_APP_ID` — the App's numeric ID
   - `CI_APP_PRIVATE_KEY` — the PEM-encoded private key

### 1.4 Bot Identity

When a GitHub App makes commits, it uses the identity:

```
{app-slug}[bot] <{app-id}+{app-slug}[bot]@users.noreply.github.com>
```

For example, if the App slug is `forward-impact-ci` and the ID is `123456`:

```
forward-impact-ci[bot] <123456+forward-impact-ci[bot]@users.noreply.github.com>
```

This identity replaces the current `github-actions[bot]` identity in the
composite action.

## Phase 2: Update Workflows and Composite Action

### 2.1 Composite Action (`.github/actions/claude/action.yml`)

The composite action receives the App token from the calling workflow via the
`GH_TOKEN` environment variable (already used for wiki clone). No
token-generation step is added to the composite action.

**New inputs** for git identity:

```yaml
inputs:
  app-slug:
    description: GitHub App slug for git identity
    required: false
    default: forward-impact-ci
  app-id:
    description: GitHub App ID for git identity email
    required: true
```

**Updated step** — "Configure Git identity":

```yaml
- name: Configure Git identity
  shell: bash
  env:
    APP_SLUG: ${{ inputs.app-slug }}
    APP_ID: ${{ inputs.app-id }}
  run: |
    git config user.name "${APP_SLUG}[bot]"
    git config user.email "${APP_ID}+${APP_SLUG}[bot]@users.noreply.github.com"
```

The `app-slug` input defaults to `forward-impact-ci` so the pre-built App works
out of the box. Downstream installations with their own App override it.

### 2.2 Workflow Files

Update all six agent workflows to replace `secrets.CLAUDE_GH_TOKEN` with the App
credentials.

**Before** (same pattern in five of six workflows):

```yaml
steps:
  - uses: actions/checkout@<SHA>
    with:
      token: ${{ secrets.CLAUDE_GH_TOKEN }}

  # ...

  - uses: ./.github/actions/claude
    env:
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      GH_TOKEN: ${{ secrets.CLAUDE_GH_TOKEN }}
      CLAUDE_CODE_USE_BEDROCK: "0"
    with:
      prompt: "..."
```

**After:**

```yaml
steps:
  - name: Generate installation token
    id: app-token
    uses: actions/create-github-app-token@<resolved-sha> # v1
    with:
      app-id: ${{ secrets.CI_APP_ID }}
      private-key: ${{ secrets.CI_APP_PRIVATE_KEY }}

  - uses: actions/checkout@<SHA>
    with:
      token: ${{ steps.app-token.outputs.token }}

  # ...

  - uses: ./.github/actions/claude
    env:
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      GH_TOKEN: ${{ steps.app-token.outputs.token }}
      CLAUDE_CODE_USE_BEDROCK: "0"
    with:
      app-id: ${{ secrets.CI_APP_ID }}
      prompt: "..."
```

### 2.3 Security Audit Workflow (different pattern)

The `security-audit` workflow currently uses `contents: read` and does not pass
a token to `actions/checkout` (it uses the default `GITHUB_TOKEN`). It still
needs `GH_TOKEN` for Claude Code to call the GitHub API.

For this workflow: generate an App token for API access (`GH_TOKEN`), but keep
`actions/checkout` using the default `GITHUB_TOKEN`. The workflow's
`permissions: contents: read` block constrains the default token, and the App
token is separately scoped for API calls only.

### 2.4 SHA Pinning

Per CONTRIBUTING.md § Security, `actions/create-github-app-token` must be pinned
to a full SHA hash with a version comment. The SHA is resolved during the
Prerequisites step and used consistently across all six workflow files.

### 2.5 Files to Update

| File                                      | Change                                                          |
| ----------------------------------------- | --------------------------------------------------------------- |
| `.github/workflows/dependabot-triage.yml` | Replace `CLAUDE_GH_TOKEN` with App token (standard pattern)     |
| `.github/workflows/product-backlog.yml`   | Replace `CLAUDE_GH_TOKEN` with App token (standard pattern)     |
| `.github/workflows/release-readiness.yml` | Replace `CLAUDE_GH_TOKEN` with App token (standard pattern)     |
| `.github/workflows/release-review.yml`    | Replace `CLAUDE_GH_TOKEN` with App token (standard pattern)     |
| `.github/workflows/improvement-coach.yml` | Replace `CLAUDE_GH_TOKEN` with App token (standard pattern)     |
| `.github/workflows/security-audit.yml`    | App token for `GH_TOKEN` only; `actions/checkout` keeps default |
| `.github/actions/claude/action.yml`       | Add `app-slug`/`app-id` inputs; update git identity to App bot  |

## Phase 3: Documentation

### 3.1 `CONTINUOUS_IMPROVEMENT.md`

Update the following sections:

- **Architecture** paragraph about the composite action: mention App-based
  authentication instead of PAT.
- **Least privilege** bullet: reference the App's permission model.
- Add a new section **Authentication** explaining the GitHub App token flow.

### 3.2 `CONTRIBUTING.md`

No changes needed — the security policies (SHA pinning, secret scanning) apply
equally to App secrets. The `CLAUDE_GH_TOKEN` secret name is not mentioned in
CONTRIBUTING.md.

### 3.3 Operations Documentation

Update `website/docs/internals/operations/index.md` (or create a sub-page) with
setup instructions for downstream installations covering two options:

**Option 1 — Forward Impact CI App (for repositories within the Forward Impact
organization and trusted forks):**

The Forward Impact organization publishes a public GitHub App. Repositories
within the org (or trusted forks where the org manages secrets centrally)
install the App and use the org-managed `CI_APP_ID` and `CI_APP_PRIVATE_KEY`
secrets. Private keys are per-App (not per-installation), so only the App owner
can generate and distribute them.

**Option 2 — Create your own GitHub App (for independent installations):**

Organizations that want full control create their own GitHub App following the
permission table in §1.2, generate their own private key, and store `CI_APP_ID`
and `CI_APP_PRIVATE_KEY` as repository secrets. They override the `app-slug`
input in the composite action to match their App's slug.

The documentation should describe both options, explain the private key
ownership model, and include the permission table for self-serve App creation.

## Ordering

1. Resolve the `actions/create-github-app-token` SHA (prerequisite).
2. Create the GitHub App (manual, outside the codebase).
3. Store `CI_APP_ID` and `CI_APP_PRIVATE_KEY` secrets (manual, GitHub UI).
4. Update `.github/actions/claude/action.yml` — add `app-slug`/`app-id` inputs,
   update git identity.
5. Update all six workflow files — add token generation step, replace
   `CLAUDE_GH_TOKEN` references, pass `app-id` to composite action.
6. Update `CONTINUOUS_IMPROVEMENT.md`.
7. Update operations documentation.
8. Test: run each workflow via `workflow_dispatch` and verify:
   - Workflow completes successfully.
   - Commits show App bot identity.
   - Wiki clone/push works.
   - PR operations (create, merge, comment) work.
9. Remove the `CLAUDE_GH_TOKEN` secret from the repository (manual).

Steps 4-7 should be a single commit to avoid a state where some workflows use
the old secret and others use the new one.

## Blast Radius

- **Six workflow files** — mechanical find-and-replace of the secret reference.
- **One composite action** — new inputs and git identity change.
- **Two documentation files** — additive changes.
- **No code changes** — no library, product, or test changes.
- **Rollback** — revert the commit and re-add `CLAUDE_GH_TOKEN` secret.

## Risks

| Risk                                          | Mitigation                                                  |
| --------------------------------------------- | ----------------------------------------------------------- |
| Token generation step fails                   | `workflow_dispatch` test before removing old PAT            |
| App permissions insufficient                  | Permission table derived from current PAT scopes            |
| Wiki push fails with App token                | Wiki clone already uses `GH_TOKEN` env var — same mechanism |
| Downstream installations break                | No downstream impact — they have their own secrets          |
| `actions/create-github-app-token` compromised | SHA-pinned per policy; Dependabot monitors updates          |

## Decisions

1. **Token generation at workflow level, not composite action.** The checkout
   step runs before the composite action and needs the token. Generating it once
   at the workflow level and passing it down is simpler.

2. **Public App with self-serve option.** The pre-built App covers the Forward
   Impact org and trusted forks. Independent installations create their own App
   — same permissions, their own key.

3. **App slug as input with default value.** The composite action accepts
   `app-slug` as an input defaulting to `forward-impact-ci`. Downstream
   installations with their own App override this value. This avoids requiring
   forks of the composite action while keeping the default zero-configuration
   for the Forward Impact org.
