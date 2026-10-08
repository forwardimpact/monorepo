# Plan 2400-a Part 07: Cutover

This repository's wiki is untracked, so the release engineer runs the scaffold
and the board-sections entry by hand once, as the 2390 cutover row does for the
ledger. Then the sibling repository is archived. Route: `release-engineer`. Step
1 depends on part 02 merged, because `bunx gemba-wiki` resolves the workspace
package, and on spec 2390's cutover of this wiki, which converts `STATUS.md` to
`STATUS.tsv`. Before that conversion the scaffold would create an empty ledger
beside the unconverted one, which the design forbids. Steps 2 and 3 depend on
part 04 merged.

## Step 1: Scaffold this wiki and append the board sections

Modified: the wiki clone under `wiki/`, nothing in this repository.

1. Confirm `test -e wiki/STATUS.tsv && test ! -e wiki/STATUS.md`. Stop when it
   fails: 2390's cutover has not run.
2. `bunx gemba-wiki pull`, then `bunx gemba-wiki scaffold`. This wiki's
   `Home.md` has no `## Surfaces` line and seven of the eight profiles have a
   summary, so expect two lines: `scaffold: appended ## Surfaces to Home.md` and
   `scaffold: created archivist.md`. The ledger line is absent because the
   cutover created the ledger. The appended block links `STATUS.tsv` a second
   time beside 2390's link, which is harmless. Any other line is a finding to
   read before the push.
3. Append the board sections. The text is the Board sections entry part 04
   writes into `kata-setup`'s changelog, repeated here because this step can run
   before part 04 merges: on the current `wiki/storyboard-<YYYY>-M<NN>.md`,
   append `### <agent>` under `## Current Condition`, after the last agent
   section, for each profile under `.claude/agents/` without one. When no board
   exists this month, `bunx gemba-wiki refresh` creates it with every section.
4. `bunx gemba-wiki push --paths Home.md --paths archivist.md --paths storyboard-<YYYY>-M<NN>.md`.
   The pathspecs are wiki-relative.

Verify: `bunx gemba-wiki audit --format json` reports no
`storyboard.agent-h3-required` finding, `checked.storyboard-sections` equals the
number of profiles under `.claude/agents/`, and `git -C wiki status --porcelain`
is empty (S18).

## Step 2: Archive the sibling

1. Confirm `Publish: Skills` has run on `main` since part 04 merged and shows no
   `monorepo-skills` leg.
2. `gh repo archive forwardimpact/monorepo-skills --yes`.

Verify: `gh repo view forwardimpact/monorepo-skills --json isArchived` reads
true (S18).

## Step 3: Record

Append to the weekly log: the scaffold output, the sections appended, the
archive. Comment on issue #2202 that part 04 closed it and link the pull
request.

Verify: the log entry and the comment exist.

— Staff Engineer 🛠️
