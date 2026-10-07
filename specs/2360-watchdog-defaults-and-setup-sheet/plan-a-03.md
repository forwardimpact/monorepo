# Plan 2360-a Part 03: What the next routine release carries

The design rules out an action release and any repin. It lets the CLI help ride
the next gear release. This part forces no version. It tells the next routine
`kata-release-cut` what the merged change rides on, so the release engineer
can confirm it reached consumers who pin a version. CONTRIBUTING.md
§ Releasing defines the procedure.

Depends on: parts 01 and 02 merged. Route: `release-engineer`, inside its next
routine cut. Part 02's last step addresses it on the part 02 pull request.

## Inventory

| Surface                           | Carrier                                                                     | Reaches consumers                                                                                         |
| --------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `kata-setup` skill                | `kata-skills` pack, versioned by `products/gear/package.json`               | The sibling's `main` on merge. A version-pinned install at the next `gear` version, whenever a cut bumps it |
| `gemba-watchdog` skill            | `gemba-skills` pack, versioned by `products/gemba/package.json`             | The sibling's `main` on merge. A version-pinned install at the next `gemba` version                         |
| `gemba-watchdog` CLI help, npm    | `@forwardimpact/gemba`                                                      | The next `gemba@v*` tag                                                                                   |
| `gemba-watchdog` CLI help, binary | The gear bundle (`build/cli-manifest.json` puts `gemba-watchdog` in `gear`) | The next `gear@v*` tag                                                                                    |
| `gemba-watchdog` action README    | `Publish: Actions`, mirrored to the sibling's `main`                        | On part 01's merge                                                                                        |
| `www.gemba.team` guide            | `Website: Gemba`                                                            | On part 01's merge                                                                                        |
| `www.kata.team` pages             | `Website: Kata Agent Team`                                                  | On part 02's merge                                                                                        |

Not released, and why:

| Item                                                      | Reason                                                                                                                                                       |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A `gemba-watchdog` sibling tag                            | `action.yml` is unchanged. A README-only tag would make Dependabot open a no-op SHA bump in every consumer. The mirror already puts the README on `main`. |
| A dedicated `gear` bump                                   | The design lets the CLI help and the pack ride the next gear release. Nothing pins the help text.                                                            |
| The action's `gear-release` and `installer-sha256` inputs | The binary's behavior is unchanged. Only its help text moves, and no run prints help.                                                                        |
| The `FIT_GEAR_RELEASE` default in `fit-install.sh`        | Same reason. A later routine repin carries the new bundle.                                                                                                   |
| `libwatchdog`, `kata-agent`, and this repository's pins   | Nothing in them changes. `watchdog.yml` keeps its `gemba-watchdog` SHA.                                                                                      |

## Step 1: Confirm the routine cut picks up `gemba`

Modified: nothing beyond the routine cut's own commit.

Run `kata-release-cut` per its own procedure. Its sweep names `gemba`, because
part 01 changed `products/gemba/bin/` and `products/gemba/actions/`, and it
takes the next patch above the highest `gemba@v*` tag.

Verify:
`gh api repos/forwardimpact/gemba-skills/tags --paginate --jq '.[].name'`
lists the new `gemba` version, and `.apm/skills/gemba-watchdog/SKILL.md` at
that tag carries `--threshold 48`. `Publish: Package` is green on the `gemba`
tag.

## Step 2: Confirm the next `gear` cut carries the bundle and the pack

Modified: nothing.

At the first cut after part 02 merges that bumps `gear`, for any reason:

Verify: `gh api repos/forwardimpact/kata-skills/tags --paginate --jq '.[].name'`
lists the new `gear` version, and
`.apm/skills/kata-setup/references/parameters-guard.md` exists at that tag.
`Publish: Binaries` is green on the `gear` tag, and the release carries
`gemba-watchdog-*` assets with `.sha256` sidecars.

## Step 3: Confirm the merge-time publishes

Modified: nothing.

Verify: the `Publish: Actions` and `Website: Gemba` runs for part 01's merge
commit are green, and
`` gh api repos/forwardimpact/gemba-watchdog/readme --jq .content | base64 -d | grep -c '```yaml' ``
prints 0. The `Website: Kata Agent Team` run for part 02's merge commit is
green.

— Staff Engineer 🛠️
