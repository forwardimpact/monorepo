# Plan 2330-a Part 03: Composite action, publish matrix, trust-sensitive review

The published action, its publication legs, its row in the action table, and the
review rules that guard the watchdog's own surface.

Depends on: part 06 steps 1 and 2. The sibling repository must exist before the
matrix leg merges, and the gear release must exist before the action can carry a
real `gear-release` default. Route: `staff-engineer`.

## Step 1: Write the composite action

Run the CLI in CI in either mode, and mint the App token only for engagement.

Created: `products/gemba/actions/gemba-watchdog/action.yml`

`name: Gemba Watchdog`. The description states that the action counts repository
activity over a window and engages an operator latch variable on a breach, that
it never clears the latch, and that it checks no repository out.

| Input | Required | Default | Role |
| ----- | -------- | ------- | ---- |
| `mode` | yes | — | `assess` or `engage` |
| `threshold` | yes | — | The breach threshold, one number for every counter |
| `window-hours` | yes | — | The window the counters cover |
| `variable` | no | `""` | The latch variable name. The engage step fails fast when it is empty |
| `repository` | no | `${{ github.repository }}` | `owner/repo` |
| `default-branch` | no | `${{ github.event.repository.default_branch }}` | The commits probe's `sha` |
| `killswitch-value` | no | `""` | The caller's `vars` reading, for the summary only |
| `reason` | no | `""` | The encoded reason, in `engage` mode |
| `dry-run` | no | `"false"` | Read both scopes and write nothing |
| `token` | no | `""` | Read-only token for `assess` |
| `app-id` | no | `""` | App id for the `engage` token mint |
| `app-private-key` | no | `""` | App key for the `engage` token mint |
| `gear-release` | no | the tag part 06 step 2 cut | The release the installer pins |

`threshold` and `window-hours` carry `required: true` and no `default:`, so
success criterion 2 holds and no second copy of either number exists. `variable`
is optional because `assess` needs none; see plan-a.md § Scope notes.
`gear-release` defaults to the real tag part 06 step 2 cut, never a placeholder,
because the subtree split publishes this file to external consumers.

Outputs, both mapped from the assess step's `$GITHUB_OUTPUT`:

```yaml
outputs:
  verdict:
    description: "engage when any counter breached, quiet otherwise"
    value: ${{ steps.assess.outputs.verdict }}
  reason:
    description: "The encoded reason string, empty on a quiet run"
    value: ${{ steps.assess.outputs.reason }}
```

Steps, each with the `id` its references need:

1. **`id: install`.** A `bash` step that runs the released installer and then
   refuses the npm fallback:

   ```bash
   out=$(curl -fsSL "https://github.com/forwardimpact/monorepo/releases/download/${GEAR_RELEASE}/fit-install.sh" \
     | bash -s -- --only gemba-watchdog)
   printf '%s\n' "$out"
   case "$out" in
     *"(npm)"*)
       echo "::error::gemba-watchdog resolved through the npm channel; this action requires the pinned, SHA-verified release binary"
       exit 1 ;;
   esac
   echo "$HOME/.local/bin" >> "$GITHUB_PATH"
   ```

   `channels_for` in `fit-install.sh` returns `brew_gear release_gear npm` for
   any `gemba-*` name, so a failed release download would otherwise install the
   npm launcher and resolve the whole `@forwardimpact/gemba` closure the design
   rejects. `ch_npm` marks its line `(npm)`, which is the guard's signal.

2. **`id: token`.** `if: inputs.mode == 'engage'`, using
   `actions/create-github-app-token` pinned by SHA with a `# v3` comment, at the
   same SHA `publish-actions.yml` already pins.

3. **`id: assess`.** `if: inputs.mode == 'assess'`. Every value reaches the
   command through an `env:` block and a quoted variable, matching
   `products/gemba/actions/gemba-benchmark/action.yml`, so no input is
   interpolated into the command line:

   ```yaml
     env:
       GH_TOKEN: ${{ inputs.token }}
       REPOSITORY: ${{ inputs.repository }}
       DEFAULT_BRANCH: ${{ inputs.default-branch }}
       THRESHOLD: ${{ inputs.threshold }}
       WINDOW_HOURS: ${{ inputs.window-hours }}
       KILLSWITCH_VALUE: ${{ inputs.killswitch-value }}
     run: |
       gemba-watchdog assess \
         --repo "$REPOSITORY" \
         --default-branch "$DEFAULT_BRANCH" \
         --threshold "$THRESHOLD" \
         --window-hours "$WINDOW_HOURS" \
         --killswitch-value "$KILLSWITCH_VALUE"
   ```

4. **`id: engage`.** `if: inputs.mode == 'engage'`. It builds its own argument
   list, because `--dry-run` is a presence flag:

   ```yaml
     env:
       GH_TOKEN: ${{ steps.token.outputs.token }}
       REPOSITORY: ${{ inputs.repository }}
       VARIABLE: ${{ inputs.variable }}
       REASON: ${{ inputs.reason }}
       WINDOW_HOURS: ${{ inputs.window-hours }}
       DRY_RUN: ${{ inputs.dry-run }}
     run: |
       [ -n "$VARIABLE" ] || { echo "::error::variable is required in engage mode"; exit 1; }
       args=(engage --repo "$REPOSITORY" --variable "$VARIABLE" \
         --reason "$REASON" --window-hours "$WINDOW_HOURS")
       [ "$DRY_RUN" = "true" ] && args+=(--dry-run)
       gemba-watchdog "${args[@]}"
   ```

   Passing `--dry-run false` would set the flag true and leave `false` a stray
   positional, so every scheduled engage run would silently dry-run and never
   write. The conditional append is what prevents an inert brake.

Neither mode passes an option the other's subcommand does not declare. libcli
merges globals plus the matched subcommand's options only and calls `parseArgs`
in strict mode, so a stray option aborts the run.

Created: `products/gemba/actions/gemba-watchdog/LICENSE`

A byte copy of `products/gemba/actions/gemba-wiki/LICENSE` (Apache-2.0, 201
lines).

Verify: `bun run check` passes, and `actionlint`-style review confirms every
`steps.<id>` reference resolves. The end-to-end dry run happens in part 05
step 3, because no workflow calls this action until then.

## Step 2: Write the action README

State the credential scope, the threshold grounding, the clearing rule, and the
containment residual where a consumer reads them.

Created: `products/gemba/actions/gemba-watchdog/README.md`

| Section | Content |
| ------- | ------- |
| Purpose | The event chain the brake bounds, and the two modes. |
| Usage | The two-job example: a read-only `assess` job that declares `verdict` and `reason` outputs, and an `engage` job with `permissions: {}` and an `if:` on the verdict. |
| Inputs and outputs | The tables from step 1. |
| Credential scope | The App needs `Variables: read & write` at repository scope and `Variables: read-only` at organization scope. It needs no `Secrets` permission, so the credential that halts the team can never reach a secret. |
| Threshold grounding | The threshold must clear the caller's largest legitimate batch. Every installation has its own baselines, so the action ships no default. |
| Clearing rule | The action engages and never clears. A human clears it by writing a falsy value. Deleting the variable is not clearing it and earns no quiet window. An organization-scope clear earns none either. |
| Containment residual | Agent sessions may run under the same App token, so an agent that calls the variables API can clear the latch that stopped it. The three controls are stated, and none is a permission boundary. This brake is robust against an agent chain that is not trying to defeat it, and not against one that is. |
| Exit codes | 0 on quiet, on skip, and on dry run. 1 on engagement, on an empty reason, on a failed read, and on a failed write. |

Verify: `bun run lint:md` passes.

## Step 3: Publish the action

Add the two lists this repository maintains by hand.

Modified: `.github/workflows/publish-actions.yml`

- `on.push.paths` gains `- "products/gemba/actions/gemba-watchdog/**"`.
- `jobs.publish.strategy.matrix.action` gains
  `- prefix: products/gemba/actions/gemba-watchdog` with `repo: gemba-watchdog`.
- The header comment moves from seven co-located actions to eight, and from four
  agent-run actions under `products/gemba/actions/` to five.

Part 06 step 1 has already created `forwardimpact/gemba-watchdog`, so the leg
resolves on the merge that adds it. `fail-fast: false` means a missed step 1
would fail this leg alone.

Verify: `bun run check` passes and the matrix holds eight entries.

## Step 4: Add the action-table row and reseed the fences

Let the generated enumerations match the tree, inside the layer budgets.

Modified: `.github/CLAUDE.md`, `CLAUDE.md`, `KATA.md`

`.github/CLAUDE.md` measures 768 words against a 768-word cap, so it has zero
headroom. Free at least the row's cost first, then add:

1. Trim `.github/CLAUDE.md` by at least 20 words. The § Third-party actions
   paragraph at lines 23-27 is the candidate: it explains `kata-agent`'s
   internal delegation and the wiki token's expiry, both of which the
   `gemba-wiki` action's own README states.
2. Qualify the same paragraph's line 23. "Every workflow calls
   `gemba-bootstrap@v1` for the environment" becomes "Every agent workflow calls
   `gemba-bootstrap@v1`". `watchdog.yml` runs no agent, installs one binary, and
   checks nothing out, so the unqualified claim goes stale on part 05.
3. Add one row to the § Third-party actions table:

   ```markdown
   | [gemba-watchdog](https://github.com/forwardimpact/gemba-watchdog) | Counts repository activity over a window and engages an operator latch variable on a breach |
   ```

4. Run `bunx jidoka invariants --seed enumeration-drift` and reconcile the
   `sibling-composite-actions` fence bodies against the printed set:
   `.github/CLAUDE.md` (count), `CLAUDE.md` (list), and `KATA.md` (both).
   `--seed` prints the canonical set. It has no write mode.

Root `CLAUDE.md` measures 850 of 896 words and 189 of 192 lines, so the list
fence gains one name with 46 words and 3 lines of headroom. Confirm after the
reseed.

Verify: `bunx jidoka instructions` and `bunx jidoka invariants` both pass.

## Step 5: Extend the merge gate to the watchdog surface

Make the brake's own surface trust-sensitive at the sole external merge point.

Modified: `.claude/skills/kata-release-merge/SKILL.md`

Both homes of the `.kata/` rule gain the watchdog surface, in the generic form
the published pack requires:

- The DO-CONFIRM checklist item at line 33, inside the block opened at line 24.
  This file carries no `read_do_checklist`.
- The `**Settings diffs.**` paragraph in § Step 6.

Write the surface as a class, not as this monorepo's paths: "a diff that touches
`.kata/`, or the repository's activity-watchdog surface (its workflow, its
composite action home, its CLI bin, and its guardrail library), merges only on a
trusted human's explicit signal pinned to the approved head." Name no package,
no workflow filename, and no path under `libraries/` or `products/`.
`.claude/skills/CLAUDE.md` § No monorepo leakage forbids them here, and
`.jidoka/invariants/skill-genericity.rules.mjs` scans this file. plan-a.md
§ Scope notes records the conflict with success criterion 12's literal wording.

The file measures 1862 words with no L5 breach today. Confirm the added clause
keeps it inside the cap.

Verify: `bunx jidoka instructions` and `bunx jidoka invariants` pass, and
`rg 'watchdog' .claude/skills/kata-release-merge/SKILL.md` returns both homes.

## Step 6: Extend the Dependabot triage to the action

Cover the route that goes around the merge gate.

Modified: `.claude/skills/kata-security-update/SKILL.md`

The DO-CONFIRM block already holds 9 items, which is `L7_MAX_ITEMS` in
`libraries/libinvariant/src/instructions.js`. Adding a tenth fails
`L7.too-many-items`, so the rule lands in prose instead:

1. Add one row to § Policy failure dispositions:

   | Check | Policy source | Failure action |
   | ----- | ------------- | -------------- |
   | Watchdog-surface diff | `kata-release-merge` § Settings diffs | **skip** — a trusted human's signal gates it |

   The policy source cites a durable skill section. Do not write `spec 2330`:
   `.jidoka/invariants/temporal.rules.mjs` matches `\bspec[- ][0-9]{2,5}\b` and
   its out-of-scope list covers `specs/`, `references/`, and `wiki/`, not
   `.claude/skills/*/SKILL.md`.

2. Add one sentence below the table stating the reach: the `github-actions`
   ecosystem scan covers the workflow root and the repository-local actions
   directory, so it never reaches a published action's own pins, while the root
   package-manager scan does reach the guardrail library through the workspace.
   That skill therefore guards the action by review and the library by triage.

Verify: `bunx jidoka instructions` passes with no `L7` finding, and
`bun run context:check-dependabot` passes unchanged.

## Step 7: State the killswitch rule once

Give the containment a home that fits its budget and its topic.

Created: `.claude/agents/x-killswitch.md`

`.claude/agents/x-coordination-protocol.md` measures 1261 of 1280 words and 186
of 192 lines, and its § Creating outputs maps output types to tracker
operations rather than carrying write prohibitions. A new reference costs no
existing budget and names its own topic.

The file carries no `name`/`description` frontmatter, so the agent loader and
`skill-genericity.rules.mjs` § agent-naming both read it as a reference rather
than a profile. It states three rules in generic terms:

- No agent writes the repository's agent killswitch variable.
- Only the activity watchdog sets it. Only a human clears it, by writing a falsy
  value. Deleting the variable is not clearing it.
- An agent that finds the team stopped reports the stop and waits. It does not
  work around it.

Modified: `.claude/skills/kata-release-merge/SKILL.md`,
`.claude/skills/kata-security-update/SKILL.md`

Each gains one pointer line to `../../agents/x-killswitch.md` beside its
existing agent-reference links, so both skills that write to GitHub carry the
rule by reference. Neither restates it, which `jidoka instructions` would read
as layer drift.

Write every `.claude/**` file through
`echo … | bunx gemba-selfedit <path>` when settings block the direct edit.

Verify: `bunx jidoka instructions` passes with no layer-restatement and no
agent-naming finding, and `bunx jidoka invariants` passes.
