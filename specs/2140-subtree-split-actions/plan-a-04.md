# Plan 2140-a-04: Standard — `MONOREPO.md` section + `.github/CLAUDE.md` rewrite

Records the pattern as a `MONOREPO.md` standard and retires the "edit on the
sibling" instruction (criterion 7). Documentation only — no behavior change.

## Step 1: Add the `MONOREPO.md` co-developed-action-repos section

A new **optional** top-level concern, distinct from the three shippable and
three support directories.

Files modified: `MONOREPO.md` (new `##` section after § Top-Level Directories).

Content:

- States the pattern: co-developed action repositories may keep canonical source
  in the monorepo, co-located with their owning unit, and publish verbatim to a
  sibling via deterministic subtree split; consumption stays SHA-pinned.
- States the **inclusion test**: only repos with **no other home in the monorepo
  and no publish-time transform**. Skill packs and npm packages are excluded —
  they transform at publish (`fit-pack stage`) or already have a home.

Verify: the section is present and names the inclusion test; the repository
check (instructions/context) is green.

## Step 2: Rewrite "Editing a published action" in `.github/CLAUDE.md`

Replace the edit-on-the-sibling exception with the monorepo-canonical model.

Files modified: `.github/CLAUDE.md`.

- Rewrite the **Editing a published action** subsection: actions are edited in
  the monorepo at their home, published outward by `publish-actions.yml`;
  external sibling PRs are reviewed on the sibling but **never merged there** —
  they land via the `just action-pullback` recipe and reappear on the next
  publish. No remaining instruction to edit an action on the sibling.
- Leave **structurally unchanged**: the SHA-pin consumption policy, the `# v1`
  marker, the Dependabot SHA-bump path, and the "Moving a sibling's `v1` tag"
  rules. The **§ Third-party actions table is the `sibling-composite-actions`
  enum *source*** (`enumeration-drift.topics.yml`: `md-table`, column
  `Action (`@v1`)`, filter `forwardimpact/`) — its column header, the five
  `forwardimpact/<repo>` link rows, and the `Five` count prose (a `count`
  consumer) are all load-bearing; a stylistic reformat breaks `context`. The
  matching fenced `<!-- enum -->` consumer blocks in `CLAUDE.md` (`list`) and
  `KATA.md` (`both`) stay consistent because no sibling is renamed.

Verify: `! rg -ni 'edit(ing)? .*on the sibling' .github/CLAUDE.md`; the §
Third-party actions source table still holds all five `forwardimpact/` rows and
its column header; `bun run invariants` (enumeration-drift) and the repository
`context` check are green.

Libraries used: none.
