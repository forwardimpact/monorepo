# Plan 2340-a Part 04: Release runbook

CONTRIBUTING.md § Releasing defines four release tiers: the compiled bundle,
the co-versioned `fit-install.sh`, the sibling actions, and this repository's
pins. This runbook numbers its own steps against them. Tiers 1 to 3 map to
CONTRIBUTING's tiers 1 to 3. Tier 4 is the acceptance run that follows
CONTRIBUTING's tier 4, which [part 03](plan-a-03.md) carries. Tier 5 has no
CONTRIBUTING counterpart, because it ships in another repository.

Each tier waits for the previous tier's publish workflow to go green.

**Tags come from `Release: Tag`.** CONTRIBUTING.md § Releasing states it, and it
overrides `kata-release-cut`, which still teaches `git push origin <tag>` in
both its SKILL.md Step 7 and `references/procedure.md`. The release-cut
environment cannot push tags. Open an issue to reconcile that skill with
CONTRIBUTING; do not widen this plan to fix it. The workflow's `release-tagger`
action also moves the `v<major>` alias for action releases, so no step moves
`v1` by hand.

**Version numbers below are the expected next patch, not fixed literals.** The
tag space is append-only, so if an unrelated release lands first, take the next
patch above the current highest tag instead.

Route tiers 1 to 3 to `release-engineer`. Tier 4 needs an HTTPS endpoint whose
request log a person can read, so it goes to an operator. Route tier 5 to
`staff-engineer`.

## Tier 1: Cut the gear bundle (after part 01 merges)

Files modified: the `version` field of each package the sweep names, plus the
lockfile, on `main`.

The `gemba-harness` binary a runner installs comes from the gear release, so
part 01's absent-trace branch reaches a runner only through a new bundle.

1. Run [`kata-release-cut`](../../.claude/skills/kata-release-cut/SKILL.md) on
   `main`. Its sweep names `libharness` and `gemba`, whose directories part 01
   changed (`libraries/libharness/`, `products/gemba/bin/gemba-harness.js`, and
   `products/gemba/actions/gemba-harness/README.md`).
2. **Bump `gear` by hand.** The sweep enumerates with
   `git log <tag>..HEAD -- <directory>`, and `products/gear/` holds only
   `package.json`, which part 01 never touches. So the sweep cannot name
   `gear`, even though the bundle compiles the changed `libharness` source.
   Run `npm version patch --no-git-tag-version` in `products/gear` to take
   `0.3.4` to `0.3.5`. Tagging without this bump would strand `gear@v0.3.5` on
   a commit whose `package.json` still reads `0.3.4`, which blinds every later
   sweep. Open an issue for this gap in the release tooling; do not widen this
   plan to fix it.
3. Commit the bumps and push them to `main`.
4. Dispatch `Release: Tag` with `tags: gear@v0.3.5` plus the tags the sweep
   produced. Leave `repo` and `sha` empty.

Verify: `Publish: Binaries` is green on the `gear@v0.3.5` tag, the release
carries the `gemba-harness-*` assets with their `.sha256` sidecars, and
`products/gear/package.json` at the tagged commit reads `0.3.5`.

## Tier 2: Move the installer pin and cut `gemba-bootstrap`

Files modified: `products/gemba/actions/gemba-bootstrap/fit-install.sh`.

Nothing consumes the new bundle until this default moves.

1. On a branch, set the default to the tier-1 tag:

   ```sh
   FIT_GEAR_RELEASE="${FIT_GEAR_RELEASE:-gear@v0.3.5}"
   ```

2. Open the pull request, title it
   `chore(gemba): pin FIT_GEAR_RELEASE to gear@v0.3.5`, and merge it. The scope
   is the workspace package that owns the file, per CONTRIBUTING.md.
   `publish-actions.yml` then mirrors
   `products/gemba/actions/gemba-bootstrap/` to the sibling's `main`.
3. Dispatch `Release: Tag` with `repo: gemba-bootstrap` and `tags: v1.0.21`.
   Leave `sha` empty so it tags the sibling's default-branch tip.
4. Read the 40-character SHA the `v1.0.21` tag points at **in the
   `forwardimpact/gemba-bootstrap` repository**. Part 02 step 3 pins it.

Verify: `gh api repos/forwardimpact/gemba-bootstrap/tags` lists `v1.0.21`, and
`action.yml` at that SHA declares `bun-version` with `default: ""` and resolves
the version on its `setup-bun` step.

## Tier 3: Cut `kata-agent` (after part 02 merges)

Files modified: none.

1. Confirm `publish-actions.yml` is green on the merge commit and that the
   `kata-agent` leg pushed.
2. Dispatch `Release: Tag` with `repo: kata-agent` and `tags: v1.0.10`. Leave
   `sha` empty.
3. Read the 40-character SHA the `v1.0.10` tag points at **in the
   `forwardimpact/kata-agent` repository**. Part 03 steps 1 and 2 pin it. Take
   it from the tag, never from part 02's pull request: a squash merge leaves the
   branch's own commits unreachable from `main`.

Verify: `gh api repos/forwardimpact/kata-agent/tags` lists `v1.0.10` at a SHA
whose `action.yml` declares `task-event`. This is the tag half of success
criterion 11. Its "SHA `kata-dispatch.yml` pins" half verifies on part 03's
branch, which writes that pin.

## Tier 4: Acceptance run (after part 03 merges)

Files modified: none.

Stand up any HTTPS endpoint whose request log you can read, or point
`callback_url` at a deployed `ghbridge` or `msbridge` instance. Then run
`gh workflow run "Kata: Dispatch"` with a `prompt` and that `callback_url`.

Verify: the run summary shows the cost table while
`.github/workflows/kata-dispatch.yml` carries no cost step (success criterion
7), and the endpoint's log shows exactly one terminal payload. This is
design-a.md § Test strategy's manual acceptance. Without a readable endpoint,
the cost half still verifies and the payload half stays unverified; say so
rather than claiming the criterion.

## Tier 5: The reference consumer (after tier 3)

Repository: `forwardimpact/bionova-apps-v2`. File modified:
`.github/workflows/agent-dispatch.yml`. Bring the repository into the session
with `add_repo`, then open a pull request against it, per
[references/CLAUDE.md § Keep a reference current](../../references/CLAUDE.md).

Read the file first. Build the replacement from
[`workflow-dispatch.md`](../../.claude/skills/kata-setup/references/workflow-dispatch.md)
as part 03 rewrote it, not from the consumer's shift workflow: the shift shape
carries none of the dispatch semantics. Pin
`forwardimpact/kata-agent@<sibling-v1.0.10-sha> # v1.0.10`.

The one step must carry every key below. A step that drops them still passes
criterion 10's `rg 'uses:'` check while running a default `run`-mode agent with
no bridge contract.

| Key                                                     | Value                                                            |
| ------------------------------------------------------- | ---------------------------------------------------------------- |
| `app-id`, `app-private-key`, `anthropic-api-key`        | The consumer's existing secret names                             |
| `killswitch`                                            | `${{ vars.KATA_KILLSWITCH }}`                                    |
| `mode`                                                  | `${{ inputs.discussion_id != '' && 'discuss' \|\| 'facilitate' }}` |
| `task-event`                                            | `${{ github.event_path }}`                                       |
| `lead-profile`, `agent-profiles`, `agent-model`, `lead-model`, `wiki`, and any run limits | Carried over from the values its current harness step passes    |
| `bun-version`                                           | The version its current bootstrap step passes                    |
| `callback-url`, `correlation-id`, `discussion-id`, `resume-context`, `inbox-url` | Mapped from `inputs.*`                          |

Its `workflow_dispatch` block must declare the six bridge inputs the template
declares. Add any it lacks.

Keep, unchanged, everything spec.md § Excluded leaves in the workflow:

| Element                       | Why it stays                                                      |
| ----------------------------- | ------------------------------------------------------------------- |
| The `on:` block and the `if:` | The trigger surface and its predicate are the consumer's policy.  |
| Its `concurrency` group       | It measured `queue: max`. This change does not reconcile the two. |
| Its job `timeout-minutes`     | A composite action cannot declare it.                             |

Remove its seven steps, its `bun-version` comment, and its 64 KiB redirect
comment. Part 02 step 6 moved that comment's reasoning into `kata-agent`'s own
cost step, so it leaves this file without leaving the tree.

`references/bionova-apps/` in this repository needs no edit. Its record names
`kata-setup` as a hard gate and never restates the workflow body.

Verify: in that repository, `rg 'uses:' .github/workflows/agent-dispatch.yml`
returns one line naming `forwardimpact/kata-agent@` (success criterion 10), the
step carries every key in the table above, and one dispatched run reaches the
facilitator.
