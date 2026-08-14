# Plan 2280-a: Gemba-Prefixed Distribution

Executes [design-a.md](design-a.md) for [spec.md](spec.md).

## Approach

The change is a rename with no runtime behaviour change, so the work splits by
verification boundary instead of by feature. Part 01 moves the four action
homes and repoints the publish matrix, because every later sweep depends on the
new paths. Part 02 repoints every consumer `uses:` line and every repo-local
path. Part 03 splits the skill pack and updates the two setup skills. Part 04
renames the enum source, reseeds the fences, and updates the product docs and
the CLI documentation parity. Part 05 is the operator runbook that brackets the
merge. Parts 01 to 04 land as one PR, because the absence sweeps in success
criteria 3 and 4 only pass when all four are present.

Libraries used: libpack (skill-pack prefix staging, unchanged), libinvariant
(`enumeration-drift` seed and check).

## Parts

| Part | Title | Depends on |
| ---- | ----- | ---------- |
| [01](plan-a-01.md) | Action homes and publish matrix | — |
| [02](plan-a-02.md) | Consumer refs and repo-local paths | 01 |
| [03](plan-a-03.md) | gemba-skills pack and setup skills | — |
| [04](plan-a-04.md) | Enum source, docs, and CLI parity | 01 |
| [05](plan-a-05.md) | Operator runbook | 01–04 merged |

## Execution

- **Agent route.** Parts 01, 02, 03, and 04 go to `staff-engineer`. Each part
  carries workflow YAML, an invariant reseed, or a golden recapture, so no
  part is docs-only. `technical-writer` reviews the prose in parts 03 and 04.
  Part 05 is not agent-executable. An operator with GitHub org admin rights
  runs it.
- **Sequence.** Run 01 first. Parts 02, 03, and 04 then run in any order on
  the same branch. They touch disjoint files, so they can run in parallel
  when the runner supports it. Part 02 and part 04 each own whole files: part
  04 owns every line of `.github/CLAUDE.md`, including the bootstrap path
  prose the home rename touches.
- **Merge boundary.** Part 05 step 1 runs before the PR merges. Part 05 step 2
  runs after it merges. Do not merge parts 01 to 04 until part 05 step 1
  reports the five sibling repos ready.
- **Whole-change verification.** After parts 01 to 04, run the four spec
  sweeps and `bun run check && bun run test`. The commands are in
  [plan-a-04.md § Step 5](plan-a-04.md).

## Risks

| Risk | Effect | Mitigation |
| ---- | ----- | ---------- |
| The operator merges before renaming the sibling repos. | The `publish-actions.yml` legs fail at the App-token mint, because the App is scoped to repo names that no longer exist. | Part 05 step 1 gates the merge. Confirm the five repos before you merge. |
| The operator skips the one-time re-seed. | Every renamed action leg fails as a non-fast-forward on each later push to `main`. Publishing stalls for the four actions. | Part 05 step 2 is a required post-merge action, not an optional cleanup. |
| The App installation does not cover `forwardimpact/gemba-skills`. | The pack leg fails at the token mint, and the pack never publishes. | Part 05 step 1 verifies the installation covers all five repos. |
| The `gemba-skills` repo has no initial commit. | The pack action's plain `git push` has no branch to land on, so the first run fails. | Part 05 step 1 creates the repo with an initial commit. |
| An old-name reference hides behind a regex the spec sweeps do not match. | The absence sweeps pass, but a stale name ships. Example: `.claude/skills/kata-setup/references/workflow-shift.md` names `bootstrap`, `harness`, and `wiki` in prose with no `forwardimpact/` prefix. | Part 03 step 3 fixes that known case. Part 04 step 5 runs a wider bare-word sweep beside the four spec sweeps. |
| `.claude/settings.json` is outside the settings allow-list. | An `Edit()` on it is blocked, so the session hook keeps the old installer path. | Part 02 step 3 writes it with `bunx gemba-selfedit` from a non-`main` branch, per CLAUDE.md § Contributor Workflow. |
