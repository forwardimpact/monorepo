# Plan 2280-a: Gemba-Prefixed Distribution

Executes [design-a.md](design-a.md) for [spec.md](spec.md).

## Approach

The change is a rename with no runtime behaviour change, so the work splits by
verification boundary instead of by feature. The operator renames the sibling
repos first, because the pull request's own CI pins the actions this change
repoints. Part 01 moves the four action homes and repoints the publish matrix.
Part 02 repoints every consumer `uses:` line and every repo-local path. Part 03
splits the skill pack and updates the two setup skills. Part 04 renames the
enum source, reseeds the fences, and updates the docs and CLI parity. Parts 01
to 04 land as one PR, because the absence sweeps in success criteria 3 and 4
only pass when all four are present.

Libraries used: libpack (skill-pack prefix staging, unchanged), libinvariant
(`enumeration-drift` seed and check).

## Parts

| Part | Title | Depends on |
| ---- | ----- | ---------- |
| [05 step 1](plan-a-05.md) | Operator: rename the siblings | — |
| [01](plan-a-01.md) | Action homes and publish matrix | 05 step 1 |
| [02](plan-a-02.md) | Consumer refs and repo-local paths | 01 |
| [03](plan-a-03.md) | gemba-skills pack and setup skills | 05 step 1 |
| [04](plan-a-04.md) | Enum source, docs, and CLI parity | 01 |
| [05 steps 2-4](plan-a-05.md) | Operator: merge, re-seed, steady state | 01-04 |

## Execution

- **Agent route.** Parts 01, 02, 03, and 04 go to `staff-engineer`. Each part
  carries workflow YAML, an invariant reseed, or a golden recapture, so no
  part is docs-only. `technical-writer` reviews the prose in parts 03 and 04.
  Part 05 is not agent-executable. An operator with GitHub org admin rights
  runs it.
- **The operator goes first.** Part 05 step 1 runs before any implementation
  lands on the branch. `check-quality.yml`, `check-test.yml`,
  `check-context.yml`, `check-data.yml`, and `check-security.yml` all trigger
  `on: pull_request` and pin `forwardimpact/bootstrap`. Once part 02 repoints
  them to `forwardimpact/gemba-bootstrap`, the branch's own CI cannot resolve
  the action until the rename has happened. The rename keeps the old names
  resolving through redirects, so renaming first breaks nothing.
- **File ownership.** Each file has exactly one owning part. Part 03 owns every
  line of `.github/workflows/publish-skills.yml`, including the bootstrap pin
  on line 135. Part 04 owns every line of `.github/CLAUDE.md`, including the
  bootstrap path prose. No two parts edit one file.
- **Sequence.** Run 01 first. Parts 02, 03, and 04 then run in any order. With
  the ownership rule above they touch disjoint files, so they can run in
  parallel when the runner supports it.
- **Whole-change verification.** After parts 01 to 04, run the sweeps and the
  repository checks in [plan-a-04.md § Step 6](plan-a-04.md).

## Risks

| Risk | Effect | Mitigation |
| ---- | ----- | ---------- |
| The implementer pushes part 02 before the operator renames the sibling repos. | The branch's `on: pull_request` checks fail at action resolution, because `forwardimpact/gemba-bootstrap` does not exist yet. The failure looks like a broken change. | Part 05 step 1 gates the first push, not the merge. |
| The operator skips the one-time re-seed. | Every renamed action leg fails as a non-fast-forward on each later push to `main`. Publishing stalls for the four actions. | Part 05 step 3 is a required post-merge action, not an optional cleanup. |
| The re-seed uses a different `splitsh-lite` build. | The split emits different SHAs, so the new lineage diverges permanently and no later publish can fast-forward. The runbook cannot detect this after the fact. | Part 05 step 3 names the pinned version and digest and verifies the digest before it runs. |
| The App installation does not cover `forwardimpact/gemba-skills`. | The pack leg fails at the token mint, and the pack never publishes. | Part 05 step 1 verifies the installation covers all five repos. |
| The `gemba-skills` repo has no initial commit. | The pack action's plain `git push` has no branch to land on, so the first run fails. | Part 05 step 1 creates the repo with an initial commit. |
| `.github/CLAUDE.md` sits at exactly 768 words against the 768-word `subdir CLAUDE.md` cap (`libraries/libinvariant/src/instructions.js:161-163`). | One added word fails `instructions.word-budget` in `bun run check`. | Part 04 step 1 states the constraint and keeps every replacement one token for one token. |
| `.claude/skills/kata-setup/SKILL.md` is at 187 of 192 lines. `.claude/skills/gemba-benchmark/SKILL.md` is at 189 of 192 lines and 1276 of 1280 words (L5 caps, `instructions.js:218-219`). | Part 03 step 2 and part 04 step 4 both add content to these files, so a careless addition breaches an instruction cap. | Both steps cap their additions to one line and say so. Run `bunx jidoka instructions` after each. |
| An old-name reference hides behind a regex the spec sweeps do not match. | The absence sweeps pass, but a stale name ships. | Part 04 step 6 runs six sweeps, wider than the spec's three, and names every sanctioned exclusion. |
| `.claude/settings.json` is outside the settings allow-list, and `gemba-selfedit` refuses it. | The SessionStart hook keeps a path to a deleted installer. | Part 02 step 3 uses the ordinary edit path. It does not use `gemba-selfedit`, which rejects the file by design. |
