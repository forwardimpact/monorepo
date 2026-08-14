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

## Recorded decisions

**One note on the enum reseed.** design-a.md:71 chooses "reseed the fences with
the invariant tooling" over unaided hand edits. That is what part 04 step 2
does, and it matches the repository's own documented refresh path
(`.jidoka/invariants/enumeration-drift.topics.yml:15-16`). The mechanics are
worth stating once, because `--seed` has no write mode: `seedBodies`
(`libraries/libinvariant/src/enum-drift.js:215`) returns a string of `- name`
bullets. Those bullets do not paste into `CLAUDE.md:103`'s inline backticked
list or `KATA.md:51-59`'s described items, so the step prints the canonical
set, reconciles each fence against it, and lets `bun run invariants` gate the
result. No design change is needed.

**Three boundaries held.** Each is a deliberate omission, not an oversight.

1. `websites/monorepo/index.md:185`, `websites/monorepo/llms.txt:26`,
   `websites/kata/index.md:244`, `websites/kata/llms.txt:21`, and
   `websites/fit/index.md:178` publish `apm install` commands that omit the new
   pack. spec.md § Included names the `kata-setup` and `monorepo-setup` skills,
   not those pages. The commands stay valid; they are incomplete, not broken.
   `websites/fit/gear/index.md` is **not** on this list. Part 04 step 4 already
   owns that file, so its install block moves with the sentence above it.
2. The four `action.yml` `name:` fields keep their `FIT Benchmark`,
   `FIT Bootstrap`, `FIT Harness`, and `FIT Wiki` display titles, while the
   Kata and Jidoka actions use `Kata Agent`, `Kata Interview`, and `Jidoka`.
   These are Marketplace display names. The spec scopes this change to
   repository names, publish targets, and references, and it names no display
   title.
3. The published action inputs and artifact names inside the benchmark home
   (`benchmark-runs`, `benchmark-shard-*`, and the rest) keep their bare
   prefixes. They are the action's public interface, and renaming them would
   break consumers.

Widening the spec on any of the three is the approver's call.

**Two additions beyond the design's file list.** design-a.md:47's "Repo-local
paths" row names the session hook, the justfile, the binaries publish workflow,
the split-and-push docstring, and `.github/CLAUDE.md`. The plan also edits
`scripts/bootstrap.sh`, `.gitignore`,
`libraries/libharness/src/claude-code-executable.js`, and `MONOREPO.md`. All
four carry the same class of authored reference the design's row describes, and
the design's list reads as examples rather than a closed set. Leaving them
would ship a stale action name that no sweep can reach.

**One repository defect found, not fixed here.**
`products/gemba/test/golden/gemba-benchmark/empty-runs` is an empty directory,
so git does not track it. The `report-empty` case therefore fails
`capture-cli-golden --verify` on unmodified `main`, and a capture rewrites the
committed snapshot with an un-normalised local path. That predates this change.
Part 04 step 5 works around it by hand-editing one line and says why. The
golden directory has no working regeneration path until someone commits a
tracked fixture. That is separate work and needs its own issue.

## Parts

| Part | Title | Depends on |
| ---- | ----- | ---------- |
| [05 step 1](plan-a-05.md) | Operator: rename the siblings | — |
| [01](plan-a-01.md) | Action homes and publish matrix | 05 step 1 |
| [02](plan-a-02.md) | Consumer refs and repo-local paths | 01 |
| [03](plan-a-03.md) | gemba-skills pack and setup skills | 05 step 1 |
| [04](plan-a-04.md) | Enum source, docs, and CLI parity | 01; step 6 needs 02 and 03 |
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
- **Sequence.** Run 01 first, because parts 02 and 04 reference the renamed
  paths. Part 03 depends on no part-01 output and can start alongside it.
  Parts 02, 03, and 04 steps 1 to 5 then run in any order. With the ownership
  rule above they touch disjoint files, so they can run in parallel when the
  runner supports it.
- **Format last, once.** No part runs a formatter. `bun run check` reaches
  `format:md` (`rumdl fmt --check .`) third in its chain, and edits in parts 02,
  03, and 04 push several lines past the 80-column MD013 limit. A mid-part
  `rumdl fmt .` would also write files other parts own. Part 04 step 6 runs the
  one scoped format pass after every part completes.
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
| `.github/CLAUDE.md` sits at exactly 768 words against its 768-word cap. Root `CLAUDE.md` sits at exactly 896 words against its 896-word cap (`libraries/libinvariant/src/instructions.js:155-163`). | One added word fails `instructions.word-budget` in `bun run check`. Part 04 edits both files. | Part 04 steps 1 to 3 state the constraint and keep every replacement one token for one token. |
| Four instruction files sit at or near their caps: `.claude/skills/kata-setup/SKILL.md` and `.claude/skills/gemba-benchmark/SKILL.md` (L5), and `kata-setup/references/workflow-{dispatch,shift}.md` at exactly 128 of 128 lines (L6, `instructions.js:242-243`). | Part 03 adds one line to the first and lengthens lines in the two references. A reflow that wraps one line breaches the L6 cap. | Part 03 steps 3 and 4 cap their additions and say so. Run `bunx jidoka instructions` after the format pass, and tighten wording in place if a file breaches. Treat the invariant's own output as the authority. It does not count raw lines. |
| An old-name reference hides behind a regex the spec sweeps do not match. Ripgrep's `\b` matches inside `gemba-bootstrap`, so a naive sweep is undecidable. | The absence sweeps pass, but a stale name ships. | Part 04 step 6 runs five sweeps, wider than the spec's three, uses `(^\|[^-])\b` to skip the renamed forms, and names every sanctioned remaining hit. |
| `.claude/settings.json` is outside the settings allow-list, and `gemba-selfedit` refuses it. | The SessionStart hook keeps a path to a deleted installer. | Part 02 step 3 uses the ordinary edit path. It does not use `gemba-selfedit`, which rejects the file by design, and it does not route around that safeguard from the shell. |
