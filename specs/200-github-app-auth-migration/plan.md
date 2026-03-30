# Plan 200: GitHub App Authentication Migration

## Approach

Replace the PAT-based authentication with a GitHub App that generates
short-lived installation tokens per workflow run. Use the official
`actions/create-github-app-token` action (already permitted under the
CONTRIBUTING.md policy — it is a first-party `actions/*` action).

The migration has three phases: create the App, update the composite action, and
update documentation.

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

Add a token-generation step at the beginning and update the git identity.

**New inputs:**

```yaml
inputs:
  app-id:
    description: GitHub App ID for authentication
    required: true
  app-private-key:
    description: GitHub App private key (PEM)
    required: true
```

**New step** (before "Configure Git identity"):

```yaml
- name: Generate installation token
  id: app-token
  uses: actions/create-github-app-token@<SHA> # v1
  with:
    app-id: ${{ inputs.app-id }}
    private-key: ${{ inputs.app-private-key }}
```

**Updated step** — "Configure Git identity":

```yaml
- name: Configure Git identity
  shell: bash
  env:
    APP_SLUG: forward-impact-ci
    APP_ID: ${{ inputs.app-id }}
  run: |
    git config user.name "${APP_SLUG}[bot]"
    git config user.email "${APP_ID}+${APP_SLUG}[bot]@users.noreply.github.com"
```

**Token propagation** — The generated token must replace `GH_TOKEN` everywhere
it is used:

1. **Wiki clone URL** (line 58): Change `${GH_TOKEN}` to use the generated token
   from `${{ steps.app-token.outputs.token }}`. Since composite actions cannot
   set environment variables for other steps, pass it as an input or expose it
   as a step output.
2. **Claude Code `GH_TOKEN` env var**: The composite action does not set this
   directly — it is set by the calling workflow. The calling workflows will pass
   the App token instead (see §2.2).

**Expose the token as output:**

```yaml
outputs:
  token:
    description: Generated installation token for use in subsequent steps
    value: ${{ steps.app-token.outputs.token }}
```

However, since the composite action both needs the token internally (wiki clone)
and the calling workflow needs it for the `GH_TOKEN` env var, a cleaner approach
is:

- The composite action generates the token and uses it for wiki operations.
- The composite action exposes it so the caller can reference it, OR the caller
  generates its own token separately.

**Recommended design**: Generate the token in the composite action. Use it
internally for wiki and git operations. The calling workflow passes `app-id` and
`app-private-key` as inputs, and the composite action handles everything — no
`GH_TOKEN` env var needed from the workflow level.

To accomplish this, the composite action should set `GH_TOKEN` itself:

```yaml
- name: Run Claude Code
  shell: bash
  env:
    GH_TOKEN: ${{ steps.app-token.outputs.token }}
    PROMPT: ${{ inputs.prompt }}
    # ... rest unchanged
```

This keeps the token lifecycle entirely within the composite action.

### 2.2 Workflow Files

Update all six agent workflows to replace `secrets.CLAUDE_GH_TOKEN` with the App
credentials.

**Before** (same pattern in all six):

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
    uses: actions/create-github-app-token@<SHA> # v1
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
      prompt: "..."
```

**Why generate the token in the workflow rather than the composite action?** The
`actions/checkout` step runs before the composite action and needs the token to
clone the repository (so pushes trigger downstream workflows). Generating the
token at the workflow level and passing it through is simpler than splitting the
composite action.

This supersedes the "recommended design" in §2.1 — generate the token at the
workflow level, pass it to both `actions/checkout` and the composite action via
`GH_TOKEN`. The composite action's internal wiki operations already read
`GH_TOKEN` from the environment, so no composite action input changes are needed
for the token itself.

**Composite action changes (revised):**

- Update git identity to use App bot name/email (via new `app-id` and `app-slug`
  inputs, or hardcoded if the App slug is stable).
- Remove: no new token-generation step needed in the composite action.

**Files to update:**

| File                                      | Change                                   |
| ----------------------------------------- | ---------------------------------------- |
| `.github/workflows/dependabot-triage.yml` | Replace `CLAUDE_GH_TOKEN` with App token |
| `.github/workflows/product-backlog.yml`   | Replace `CLAUDE_GH_TOKEN` with App token |
| `.github/workflows/release-readiness.yml` | Replace `CLAUDE_GH_TOKEN` with App token |
| `.github/workflows/release-review.yml`    | Replace `CLAUDE_GH_TOKEN` with App token |
| `.github/workflows/improvement-coach.yml` | Replace `CLAUDE_GH_TOKEN` with App token |
| `.github/workflows/security-audit.yml`    | Replace `CLAUDE_GH_TOKEN` with App token |
| `.github/actions/claude/action.yml`       | Update git identity to App bot           |

### 2.3 SHA Pinning

Per CONTRIBUTING.md § Security, `actions/create-github-app-token` must be pinned
to a full SHA hash with a version comment:

```yaml
uses: actions/create-github-app-token@<full-sha> # v1
```

Look up the current latest stable release SHA before implementing.

### 2.4 Security Audit Workflow

The `security-audit` workflow currently uses `contents: read` and does not pass
a token to `actions/checkout` (it uses the default `GITHUB_TOKEN`). It still
needs `GH_TOKEN` for Claude Code to call the GitHub API.

Two options:

- **Option A**: Generate an App token for API access, keep `actions/checkout`
  using the default token. The workflow's `permissions: contents: read` block
  still constrains the `GITHUB_TOKEN`, and the App token is separately scoped.
- **Option B**: Generate the App token and use it everywhere, relying on the
  App's own permission scoping.

**Recommended: Option A** — consistent with the other workflows (App token for
`GH_TOKEN`), and the `actions/checkout` default token is sufficient for
read-only clone.

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
setup instructions for downstream installations:

**Option 1 — Use the pre-built Forward Impact CI App (recommended):**

1. Go to `https://github.com/apps/forward-impact-ci` (public App page).
2. Click **Install** and select your repository.
3. Add two repository secrets:
   - `CI_APP_ID`: shown on the App's settings page after installation.
   - `CI_APP_PRIVATE_KEY`: generate a private key from the App's settings.

Wait — for the pre-built public App, downstream users install the same App but
need their own private key. This does not work: private keys are per-App, not
per-installation. The App owner (Forward Impact) holds the private key.

**Corrected model for a shared public App:**

For a **public** GitHub App that downstream installations can use:

1. The downstream user installs the App on their repository (one-click from the
   App's public page).
2. The App owner (Forward Impact) provides the App ID publicly (it is not
   secret).
3. The **private key** is held by the App owner. Downstream users cannot
   generate their own private key for someone else's App.

This means a truly shared App requires the App owner to distribute the private
key — which defeats the purpose. Instead, the correct pattern is:

**Option 1 — Install the Forward Impact CI App (recommended for public forks):**

The Forward Impact organization publishes a public GitHub App. Downstream
repositories install it, and the Forward Impact team configures the app to
generate tokens for installed repositories. The `CI_APP_ID` and
`CI_APP_PRIVATE_KEY` secrets must be set by the Forward Impact team (or whoever
owns the App). This works when the downstream repository is in the same
organization or the App owner manages secrets for trusted installations.

**Option 2 — Create your own GitHub App (recommended for independent
installations):**

Organizations that want full control create their own GitHub App following the
permission table in §1.2, generate their own private key, and store `CI_APP_ID`
and `CI_APP_PRIVATE_KEY` as repository secrets.

**Practical recommendation:** Document both options. The pre-built App is
suitable for repositories within the Forward Impact organization and trusted
forks where the org manages secrets centrally. Independent installations should
create their own App.

### 3.4 README / Setup Guide

Add a section to the operations docs:

```markdown
## CI Agent Authentication

The continuous improvement agents authenticate using a GitHub App installation
token. This provides:

- **No expiry management** — installation tokens are generated fresh each run
- **Clear identity** — commits show `forward-impact-ci[bot]`, not a personal
  account
- **Least privilege** — permissions are declared on the App, not on a user

### Setup

1. [Install the Forward Impact CI App](https://github.com/apps/forward-impact-ci)
   on your repository, OR create your own App with the permissions listed in the
   spec.
2. Store `CI_APP_ID` and `CI_APP_PRIVATE_KEY` as repository secrets.
3. The workflows will automatically generate short-lived tokens per run.
```

## Ordering

1. Create the GitHub App (manual, outside the codebase).
2. Store `CI_APP_ID` and `CI_APP_PRIVATE_KEY` secrets (manual, GitHub UI).
3. Update `.github/actions/claude/action.yml` — git identity only.
4. Update all six workflow files — add token generation step, replace
   `CLAUDE_GH_TOKEN` references.
5. Update `CONTINUOUS_IMPROVEMENT.md`.
6. Update operations documentation.
7. Test: run each workflow via `workflow_dispatch` and verify:
   - Workflow completes successfully.
   - Commits show App bot identity.
   - Wiki clone/push works.
   - PR operations (create, merge, comment) work.
8. Remove the `CLAUDE_GH_TOKEN` secret from the repository (manual).

Steps 3-6 should be a single commit to avoid a state where some workflows use
the old secret and others use the new one.

## Blast Radius

- **Six workflow files** — mechanical find-and-replace of the secret reference.
- **One composite action** — git identity change only.
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

3. **Hardcode vs parameterize the App slug.** The bot identity (`{slug}[bot]`)
   could be an input to the composite action or hardcoded. If hardcoded,
   downstream installations with their own App would need to fork the composite
   action. **Recommendation: make it an input with a default value** so the
   composite action works for both the pre-built App and custom Apps.
