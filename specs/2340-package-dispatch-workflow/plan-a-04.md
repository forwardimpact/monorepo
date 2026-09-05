# Plan 2340-a Part 04: Release cuts

The three release tiers between the code parts. CONTRIBUTING.md § Releasing
defines four: the compiled bundle, the co-versioned `fit-install.sh`, the
sibling actions, and this repository's pins. Tiers 1 to 3 below are its tiers 1
to 3. Its tier 4 is [part 03](plan-a-03.md), and
[part 05](plan-a-05.md) accepts the result.

Each tier waits for the previous tier's publish workflow to go green. Route the
whole part to `release-engineer`.

**Tags come from `Release: Tag`.** CONTRIBUTING.md § Releasing states it, and it
overrides `kata-release-cut`, which still teaches `git push origin <tag>` in
both its SKILL.md Step 7 and `references/procedure.md`. The release-cut
environment cannot push tags. Open an issue to reconcile that skill with
CONTRIBUTING; do not widen this plan to fix it. The workflow's `release-tagger`
action also moves the `v<major>` alias for action releases, so no step moves
`v1` by hand.

**Version numbers below are the expected next patch.** The tag space is
append-only, so if an unrelated release lands first, take the next patch above
the current highest tag and tell parts 02 and 03 which tag you cut.

## Tier 1: Cut the gear bundle (after part 01 merges)

Files modified: the `version` field of each package the sweep names, plus
`products/gear/package.json` and the lockfile, on `main`.

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
3. Confirm `publish-actions.yml` is green on that merge commit and that the
   `gemba-bootstrap` leg pushed. The tag space is append-only, so a `v1.0.21`
   cut against a stale sibling tip cannot be corrected in place.
4. Dispatch `Release: Tag` with `repo: gemba-bootstrap` and `tags: v1.0.21`.
   Leave `sha` empty so it tags the sibling's default-branch tip.
5. Read the 40-character SHA the `v1.0.21` tag points at **in the
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
