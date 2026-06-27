# Plan 1270 — Part 06: Hosted workflow templates

Adds hosted-path variants of every `kata-setup`-emitted workflow so
the hosted path carries no `KATA_APP_PRIVATE_KEY` reference and
instead calls `services/oidc` for credentials. Self-hosted variants
are unchanged. Depends on part 03 (`services/oidc`).

The `kata-setup` skill emits workflow YAML from three reference
documents: `.claude/skills/kata-setup/references/workflow-agent.md`
(scheduled `kata-{agent}.yml` workflows, one per agent),
`workflow-facilitate.md` (the two `Kata: Storyboard` /
`Kata: Coaching` workflows packaged together), and
`workflow-react.md` (the `Agent: React` workflow that responds to
`kata-dispatch` payloads). Each reference contains a fenced YAML
block. The hosted-path emission lives alongside, addressed by a new
mode flag.

## Step 1 — Open the STATUS sub-row

Append `1270/workflow-templates\tplan\tapproved` to `wiki/STATUS.md`.

## Step 2 — Inventory the `KATA_APP_PRIVATE_KEY` references

Read-only inventory captured in the PR body (no file change):

| Reference file | Workflow(s) emitted | Secret use |
|---|---|---|
| `references/workflow-agent.md` | `kata-{agent}.yml` (one per agent) | `app-private-key:` input to `forwardimpact/kata-action-agent@v1` |
| `references/workflow-facilitate.md` | `kata-storyboard.yml` + `kata-coaching.yml` | `app-private-key:` input to `kata-action-agent@v1` (×2) |
| `references/workflow-react.md` | `kata-dispatch.yml` (Agent: React) | `private-key:` input to `actions/create-github-app-token`, then token consumed by `forwardimpact/kata-action-eval@v1` |
| `references/github-app.md` | Documentation only — `KATA_APP_ID` / `KATA_APP_PRIVATE_KEY` setup instructions | Doc reference (updated in Step 7) |

The composite actions used today are `forwardimpact/kata-action-agent@v1`
and `forwardimpact/kata-action-eval@v1` (NOT
`forwardimpact/kata-agent@v1` — the latter is a sibling-repo from a
different point in time).

Verification: PR body carries the inventory table; `rg
"KATA_APP_PRIVATE_KEY" .claude/skills/kata-setup/references/`
returns matches only against the files in the inventory.

## Step 3 — Add the hosted-path fenced YAML block to each workflow reference

Modified files:
`.claude/skills/kata-setup/references/workflow-agent.md`,
`.claude/skills/kata-setup/references/workflow-facilitate.md`,
`.claude/skills/kata-setup/references/workflow-react.md`.

Each reference today contains one `## Template` section with one
fenced YAML block. Replace with two clearly-labeled subsections:
`## Template (self-hosted)` and `## Template (hosted)`. The
self-hosted block is the existing content unchanged. The hosted block
removes every `KATA_APP_PRIVATE_KEY` / `private-key` / `app-private-key`
reference and replaces it with an OIDC-mint step (Step 4 below).

Verification:
`rg "## Template" .claude/skills/kata-setup/references/workflow-*.md` returns
six matches (two per file);
`rg "KATA_APP_PRIVATE_KEY" .claude/skills/kata-setup/references/workflow-*.md`
returns zero matches inside the `## Template (hosted)` fenced blocks (any
text-prose matches outside the YAML are unaffected).

## Step 4 — Hosted OIDC-mint step

Each hosted template adds an OIDC token exchange step that calls
`services/oidc`'s `POST /token` endpoint (part 03 § Step 6 contract).
The GitHub Actions OIDC token is requested with the configured
audience `fit-ghserver`; the response carries the installation token
the rest of the job consumes.

```yaml
permissions:
  id-token: write
  contents: write
  # ... existing permissions (issues: write, discussions: write, etc.)

steps:
  - name: Mint installation token via Forward Impact OIDC
    id: mint
    env:
      OIDC_REQUEST_TOKEN: ${{ env.ACTIONS_ID_TOKEN_REQUEST_TOKEN }}
      OIDC_REQUEST_URL:   ${{ env.ACTIONS_ID_TOKEN_REQUEST_URL }}
      OIDC_HOST:          ${{ vars.FIT_OIDC_URL }}
    run: |
      set -euo pipefail
      # OIDC_REQUEST_URL already carries ?api-version=... — append &audience= safely.
      sep=$(printf '%s' "$OIDC_REQUEST_URL" | grep -q '?' && printf '&' || printf '?')
      ACT_TOKEN=$(curl -sf -H "Authorization: bearer $OIDC_REQUEST_TOKEN" \
        "${OIDC_REQUEST_URL}${sep}audience=fit-ghserver" | jq -r .value)
      RESP=$(curl -sf -X POST -H "Authorization: bearer $ACT_TOKEN" \
        "${OIDC_HOST}/token")
      INSTALL_TOKEN=$(printf '%s' "$RESP" | jq -r .installation_token)
      printf '::add-mask::%s\n' "$INSTALL_TOKEN"
      printf 'token=%s\n' "$INSTALL_TOKEN" >> "$GITHUB_OUTPUT"
```

The `sep` shell line guards the `?` / `&` query-string separator —
GitHub's `ACTIONS_ID_TOKEN_REQUEST_URL` carries `?api-version=...`
today, so the separator is `&`, but the guard keeps the template
correct if GitHub changes the URL shape. `::add-mask::` registers
the minted token with the Actions secret-masking layer so it never
appears in logs.

`FIT_OIDC_URL` is a repository **variable** (not a secret) — the
Forward Impact-operated `services/oidc` public URL. Setting it is a
prerequisite the hosted-setup README in Step 7 documents.

## Step 5 — Hosted-path action invocations

The mint step's `${{ steps.mint.outputs.token }}` replaces the
existing `KATA_APP_PRIVATE_KEY` reference in each hosted template:

| Template | Today's input | Hosted-path input |
|---|---|---|
| `workflow-agent.md` (`kata-action-agent@v1`) | `app-private-key: ${{ secrets.KATA_APP_PRIVATE_KEY }}` | `installation-token: ${{ steps.mint.outputs.token }}` |
| `workflow-facilitate.md` (both `kata-action-agent@v1`) | same | same |
| `workflow-react.md` (`actions/create-github-app-token` step) | step entirely removed; the mint step replaces it | the consuming `kata-action-eval@v1` step reads `${{ steps.mint.outputs.token }}` directly |

The sibling-repo composite actions `forwardimpact/kata-action-agent`
and `forwardimpact/kata-action-eval` must accept an
`installation-token` input as an alternative to
`app-private-key` / `app-id`. Sibling-side changes ship through
their own release procedure in
`.claude/skills/kata-release-cut/` and are documented in the PR
body of this part. The hosted templates assume the sibling acceptance
is live before the templates are emitted by `kata-setup --hosted`;
the part 06 PR body pins the minimum sibling SHAs.

Verification: `rg "KATA_APP_PRIVATE_KEY|app-private-key|private-key"
.claude/skills/kata-setup/references/workflow-*.md` returns zero
matches inside any `## Template (hosted)` block; `rg
"installation-token" .claude/skills/kata-setup/references/`
returns the three hosted blocks.

## Step 6 — `kata-setup` mode flag

Modified files: `.claude/skills/kata-setup/SKILL.md`.

The setup procedure today emits the YAML block under `## Template`
in each reference. Add a `--hosted` option to the skill (the skill
runs interactively via SKILL.md instructions, so the flag is a
checklist item: "If the team is using the Forward Impact-hosted
control plane, emit the `## Template (hosted)` block; otherwise emit
`## Template (self-hosted)`").

The skill emits a one-line hosted prerequisite reminder on hosted
setup: "Set the `FIT_OIDC_URL` repository variable to your hosted
OIDC URL before the first workflow run."

Verification: `kata-setup` SKILL.md (L1) carries the mode question
and the prerequisite reminder; the existing single-`## Template`
selection path remains the default.

## Step 7 — Update `kata-setup` documentation

Modified files: `.claude/skills/kata-setup/SKILL.md`,
`.claude/skills/kata-setup/references/github-app.md`.

`SKILL.md` describes the mode question, the `FIT_OIDC_URL`
prerequisite, and links to `TRUST.md` (part 07). `github-app.md`
gains a "Hosted alternative" section noting that hosted-path adopters
skip the App registration step entirely and instead install the
Forward Impact-owned App from the public install URL.

Verification: `rg "FIT_OIDC_URL"
.claude/skills/kata-setup/SKILL.md` returns the reference; `rg
"Hosted alternative" .claude/skills/kata-setup/references/github-app.md`
returns the new heading.

## Step 8 — Close the STATUS sub-row

Update `wiki/STATUS.md`: `1270/workflow-templates\tplan\tapproved` →
`1270/workflow-templates\tplan\timplemented`.

## Risks

- **Sibling-repo `kata-action-agent` / `kata-action-eval` must accept
  `installation-token`.** Step 5's hosted templates depend on the
  sibling change being live. If a customer runs `kata-setup
  --hosted` against an older sibling SHA, the action fails because
  the `installation-token` input is unknown. Sequencing mitigation:
  open sibling PRs first; tag a release; the monorepo PR body pins
  the minimum sibling SHAs. The part's verification only checks
  the *template content* in this repo — the runtime correctness
  is gated on the sibling tag.

- **`FIT_OIDC_URL` not configured at setup time.** Hosted templates
  fail at runtime if the variable is unset. Step 6's reminder is
  documentation; auto-setting via `gh variable set` would require
  the customer's `GITHUB_TOKEN`, which is out of scope.

- **`forwardimpact/kata-action-agent` and `kata-action-eval` are
  two distinct sibling actions.** The hosted templates must continue
  to invoke the correct one per workflow kind (agent vs eval);
  the inventory in Step 2 pins which file invokes which.

## Libraries used

None (workflow YAML and skill SKILL.md only).
