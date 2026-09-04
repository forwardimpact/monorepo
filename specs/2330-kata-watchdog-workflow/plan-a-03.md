# Plan 2330-a Part 03: Composite action, publish matrix, trust-sensitive review

The published action, its publication legs, its row in the action table, and the
review rules that guard the four watchdog paths.

Depends on: part 02. Route: `staff-engineer`.

## Step 1: Write the composite action

Run the CLI in CI in either mode, and mint the App token only for engagement.

Created: `products/gemba/actions/gemba-watchdog/action.yml`

`name: Gemba Watchdog`. The description states that the action counts
repository activity over a window and engages an operator latch variable on a
breach, that it never clears the latch, and that it checks no repository out.

| Input | Required | Default | Role |
| ----- | -------- | ------- | ---- |
| `mode` | yes | — | `assess` or `engage` |
| `threshold` | yes | — | The breach threshold, one number for every counter |
| `window-hours` | yes | — | The window the counters cover |
| `variable` | yes | — | The latch variable name. The action names no tenant |
| `repository` | no | `${{ github.repository }}` | `owner/repo` |
| `default-branch` | no | `${{ github.event.repository.default_branch }}` | The commits probe's `sha` |
| `killswitch-value` | no | `""` | The caller's `vars` reading, for the summary only |
| `reason` | no | `""` | The encoded reason, in `engage` mode |
| `dry-run` | no | `"false"` | Read both scopes and write nothing |
| `token` | no | `""` | Read-only token for `assess` |
| `app-id` | no | `""` | App id for the `engage` token mint |
| `app-private-key` | no | `""` | App key for the `engage` token mint |
| `gear-release` | no | `gear@vX.Y.Z` | The release the installer pins |

`threshold`, `window-hours`, and `variable` carry `required: true` and no
`default:`, so success criterion 2 holds and no second copy of either number
exists.

Outputs: `verdict` and `reason`, both from the run step's `$GITHUB_OUTPUT`.

Steps:

1. **Install the CLI.** A `bash` step that runs
   `curl -fsSL "https://github.com/forwardimpact/monorepo/releases/download/${GEAR_RELEASE}/fit-install.sh" | bash -s -- --only gemba-watchdog`
   then appends `$HOME/.local/bin` to `$GITHUB_PATH`. The released installer
   owns the pin and the `.sha256` verification, so the action carries no
   duplicate pin. It matches the `Install apm` step in
   `products/gemba/actions/gemba-benchmark/action.yml`.
2. **Mint the installation token.** `if: inputs.mode == 'engage'`, using
   `actions/create-github-app-token` pinned by SHA with a `# v3` comment, at the
   same SHA `publish-actions.yml` already pins.
3. **Run the command.** A `bash` step with
   `GH_TOKEN: ${{ steps.token.outputs.token || inputs.token }}` that runs
   `gemba-watchdog "$MODE" …`, passing every input as a long option. It
   redirects nothing. The CLI writes `$GITHUB_STEP_SUMMARY` and `$GITHUB_OUTPUT`
   itself.

Created: `products/gemba/actions/gemba-watchdog/LICENSE`

A byte copy of `products/gemba/actions/gemba-wiki/LICENSE` (Apache-2.0, 201
lines).

Verify: `bunx jidoka invariants` passes and a `workflow_dispatch` run of the
action in `dry-run` mode reports four counts and writes nothing.

## Step 2: Write the action README

State the credential scope, the threshold grounding, the clearing rule, and the
containment residual where a consumer reads them.

Created: `products/gemba/actions/gemba-watchdog/README.md`

| Section | Content |
| ------- | ------- |
| Purpose | The event chain the brake bounds, and the two modes. |
| Usage | The two-job example: a read-only `assess` job that declares `verdict` and `reason` outputs, and an `engage` job with `permissions: {}` and an `if:` on the verdict. |
| Inputs and outputs | The tables from step 1. |
| Credential scope | The App needs `Variables: read & write` at repository scope and read access at organization scope. It needs no `Secrets` permission, so the credential that halts the team can never reach a secret. |
| Threshold grounding | The threshold must clear the caller's largest legitimate batch. Every installation has its own baselines, so the action ships no default. |
| Clearing rule | The action engages and never clears. A human clears it by writing a falsy value. Deleting the variable is not clearing it and earns no quiet window. An organization-scope clear earns none either. |
| Containment residual | Agent sessions may run under the same App token, so an agent that calls the variables API can clear the latch that stopped it. The three controls are stated, and none is a permission boundary. This brake is robust against an agent chain that is not trying to defeat it, and not against one that is. |
| Exit codes | 0 on quiet, on skip, and on dry run. 1 on engagement, on a failed read, and on a failed write. |

Verify: `bun run lint:md` passes.

## Step 3: Publish the action

Add the two lists this repository maintains by hand.

Modified: `.github/workflows/publish-actions.yml`

- `on.push.paths` gains `- "products/gemba/actions/gemba-watchdog/**"`.
- `jobs.publish.strategy.matrix.action` gains
  `- prefix: products/gemba/actions/gemba-watchdog` with
  `repo: gemba-watchdog`.
- The header comment moves from seven co-located actions to eight, and from
  four agent-run actions under `products/gemba/actions/` to five.

The leg fails until the `forwardimpact/gemba-watchdog` repository exists. Part
06 step 1 creates it.

Verify: `bun run check` passes and the matrix holds eight entries.

## Step 4: Add the action-table row and reseed the fences

Let the generated enumerations match the tree.

Modified: `.github/CLAUDE.md`, `CLAUDE.md`, `KATA.md`

Add one row to the `## Third-party actions` table in `.github/CLAUDE.md`:

```markdown
| [gemba-watchdog](https://github.com/forwardimpact/gemba-watchdog) | Counts repository activity over a window and engages an operator latch variable on a breach |
```

Then run `bunx jidoka invariants --seed enumeration-drift` and reconcile the
`sibling-composite-actions` fence bodies against the printed set:
`.github/CLAUDE.md` (count), `CLAUDE.md` (list), and `KATA.md` (both). `--seed`
prints the canonical set. It has no write mode.

Verify: `bunx jidoka invariants` reports no `enumeration-drift` finding.

## Step 5: Extend the merge gate to the four watchdog paths

Make the brake's own surface trust-sensitive at the sole external merge point.

Modified: `.claude/skills/kata-release-merge/SKILL.md`

Both homes of the `.kata/` rule gain the four paths:

- The READ-DO checklist item at line 33 becomes: a diff that touches `.kata/`,
  `.github/workflows/watchdog.yml`, `products/gemba/actions/gemba-watchdog/`,
  `products/gemba/bin/gemba-watchdog.js`, or `libraries/libwatchdog/` merges
  only on a trusted human's explicit signal pinned to the approved head.
- The `**Settings diffs.**` paragraph in § Step 6 gains the same four paths and
  keeps its existing sentence about agent-originated approval.

Verify: `bunx jidoka instructions` passes and `rg 'libwatchdog'
.claude/skills/kata-release-merge/SKILL.md` returns both homes.

## Step 6: Extend the Dependabot triage to the action

Cover the route that goes around the merge gate.

Modified: `.claude/skills/kata-security-update/SKILL.md`

Add one item to the DO-CONFIRM checklist: a Dependabot pull request that
touches `products/gemba/actions/gemba-watchdog/`,
`.github/workflows/watchdog.yml`, `products/gemba/bin/gemba-watchdog.js`, or
`libraries/libwatchdog/` merges only on a trusted human's explicit signal. Add
the matching row to § Policy failure dispositions with the failure action
**skip** and the policy source `spec 2330 § Scope`.

State the reach in one sentence: Dependabot's `github-actions` scan covers `/`
and `/.github/actions/*`, so it never reaches the action's own pins, while its
root `bun` scan does reach the library through the workspace.

Verify: `bunx jidoka instructions` passes and `bun run context:check-dependabot`
passes unchanged.

## Step 7: State the killswitch rule once

Give the containment its one home, which every GitHub-writing agent already
loads.

Modified: `.claude/agents/x-coordination-protocol.md`

Add three sentences to § Creating outputs: no agent writes the repository's
killswitch variable. Only the watchdog sets it, and only a human clears it, by
writing a falsy value. An agent that finds the team stopped reports the stop and
waits.

Write it through
`echo … | bunx gemba-selfedit .claude/agents/x-coordination-protocol.md` when
settings block the direct edit.

Verify: `bunx jidoka instructions` passes with no layer-restatement finding.
