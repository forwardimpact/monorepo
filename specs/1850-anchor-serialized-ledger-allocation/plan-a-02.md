# Plan 1850-a-02 — allocation layer (D1, D2, D4, D5)

Moves identifier allocation off the contested ledger page onto append-only
#1564 anchor comments, with the ledger page and MEMORY row as derived
projections. Covers SC1, SC2, SC6, SC7, SC8, SC9, SC10. Independent of Part 01.

Libraries used: libwiki (new ledger command), libutil (GhClient), libmock
(createMockGhClient).

## Step 1 — Anchor body parser

Intent: parse the fenced allocation block out of a #1564 comment.

Files: create `libraries/libwiki/src/ledger/anchor.js`,
`libraries/libwiki/test/ledger-anchor.test.js`.

- Export `parseAnchor(commentBody)` returning `{ kind, ids, event, note }` or
  `null` when the comment carries no fenced ```` ```yaml alloc: ```` block.
- Export `renderAnchorBody({ kind, ids, event, note })` producing the canonical
  fenced block for posting (KD2).
- `kind ∈ {occ, nm, fold, meta}`; `ids` a list of label strings; `event` a SHA
  or anchor-id string; `note` free text.

Verification: round-trip `render` → `parse` is identity; a non-anchor comment
parses to `null`.

## Step 2 — Anchor reader with full pagination

Intent: read every #1564 anchor in server order; never truncate.

Files: create `libraries/libwiki/src/ledger/reader.js`,
`libraries/libwiki/test/ledger-reader.test.js`; modify
`libraries/libutil/src/gh-client.js` and `libraries/libmock/src/mock/gh-client.js`.

- Add `GhClient.apiGetPaginated(path, { cwd })` running `gh api --paginate
  --slurp <path>`. With `--slurp`, `gh` wraps the per-page arrays in one outer
  JSON array of pages, so the method `JSON.parse`es once and flattens
  (`pages.flat()`) into a single comment array — avoiding the concatenated-but-
  separate-documents shape a bare `--paginate` produces. Add `"apiGetPaginated"`
  to the mock's `GH_METHODS` (string/object default returns its configured
  `responses` value).
- `readAnchors(ghClient, { owner, repo, issue = 1564 })` fetches
  `repos/{owner}/{repo}/issues/{issue}/comments` via `apiGetPaginated`, keeps
  each comment's `{ id, created_at, body }`, runs `parseAnchor`, and returns the
  anchors ordered by comment `id` ascending (the D1 serialization). The lowest
  `id` claiming a given label is the winner. `owner`/`repo` are resolved by the
  command (Step 4) from the configured remote, not hardcoded.

Verification: a two-page mock fixture (the `responses.apiGetPaginated` value is
the already-flattened comment array a correct `--slurp` parse would yield)
yields all anchors across both pages in `id` order (the pagination risk from
plan-a).

## Step 3 — Fold and projection renderer

Intent: turn the ordered anchor sequence into the ledger page body and MEMORY
row, detecting double-allocations.

Files: create `libraries/libwiki/src/ledger/projection.js`,
`libraries/libwiki/test/ledger-projection.test.js`.

- `foldAnchors(anchors)` returns `{ assignments, conflicts }`: `assignments`
  maps each label to its winning anchor (first-published); `conflicts` lists
  labels claimed by more than one anchor with the winner and losers (SC7).
- `renderLedgerPage(fold, prose)` returns the body for
  `<wikiDir>/parallel-collision-ledger.md`; `renderMemoryRow(fold)` returns the
  replacement text for the parallel-collision row of `<wikiDir>/MEMORY.md`.
  These two paths are the only projection targets. Authored prose carried by
  `<!-- anchor:ID -->`-cited blocks is preserved and re-emitted in anchor order
  (KD4); a prose block whose cited anchor is absent is reported, not dropped.
- Labels are render output keyed by event (SC6). A `labelMode` param
  (`renumber` default, `gapped` alternative) selects post-conflict labeling;
  default reproduces today's renumber behavior. This is the spec's open D4
  parameter — both modes implemented, neither made mandatory.
- The renderer writes only the ledger page and MEMORY row. It never reads or
  writes `wiki/metrics/exp-51-ledger-format/` (SC8).

Verification: a constructed double-allocation fixture yields one `conflicts`
entry with first-published winner; rebuilding then deleting and re-rendering is
idempotent.

## Step 4 — `fit-wiki ledger` command

Intent: the operator-facing procedure.

Files: create `libraries/libwiki/src/commands/ledger.js`; modify
`libraries/libwiki/src/cli-definition.js`,
`libraries/libwiki/bin/fit-wiki.js`,
`libraries/libwiki/test/cli-ledger.integration.test.js`.

GhClient wiring (none exists in libwiki today): `bin/fit-wiki.js` imports
`GhClient` from `@forwardimpact/libutil/gh-client`, constructs it for the
`ledger` command (gate it on a new `NEEDS_GH_CLIENT = new Set(["ledger"])`),
and adds `ghClient` to the `cli.dispatch` deps bag alongside `runtime`,
`wikiSync`, `gitClient`. `runLedgerCommand` reads `ctx.deps.ghClient`; tests
inject `createMockGhClient`. Owner/repo are derived from
`gitClient.remoteGetUrl("origin", { cwd: wikiDir })` (parse `owner/repo` from
the URL), so the comments path is not hardcoded.

- `ledger allocate --kind K --count N --event SHA [--note ...]`: read anchors,
  compute the next free ids of kind `K`, build the anchor body via
  `renderAnchorBody`, and `apiPost` it as a single `body` field to the #1564
  comments path (the multi-line fenced block rides one `-f body=...` field; the
  CLI test asserts round-trip body fidelity through `parseAnchor`). Print the
  ids. No projection write precedes the post (SC1). The printed ids are
  provisional and must not be written to any projection before `rebuild`;
  `rebuild` over the published sequence is authoritative and resolves any
  concurrent interleave first-published-wins (SC1, SC7).
- `ledger allocate --backfill`: for every ledger entry lacking a cited anchor,
  post a backfill anchor; idempotent via the conflict detector (run `verify`
  first) (SC2).
- `ledger rebuild`: read anchors, fold, write both projections (SC2).
- `ledger verify`: rebuild into memory, diff against the on-disk projections,
  and list any double-allocation or missing-anchor prose; non-zero exit on
  divergence.

Verification: `cli-ledger.integration.test.js` drives each subcommand against a
mock gh-client; `allocate` issues exactly one `apiPost` and zero projection
writes; `rebuild` reproduces a golden projection from a fixed anchor sequence.

## Step 5 — Reservation floor demotion (D5) and conventions home (KD4)

Intent: codify detection-only reservation semantics and the procedure's home.

Files: modify the ledger page Conventions section
(`wiki/parallel-collision-ledger.md`, in the wiki repo) and
`libraries/libwiki/src/ledger/projection.js` so `rebuild` preserves the
conventions block.

- The Conventions section states: a claim-row reservation is a tripwire, not
  exclusion; a lost claim row voids no allocation (the anchor is the
  allocation); a surviving claim collision is rendered as evidence (SC9). Its
  header links the `fit-wiki ledger` procedure.
- No code reads a claim row as exclusion; confirm by grep that `active-claims`
  has no allocation-gating call site.

Verification: a simulated claim-row erasure between reservation and mint leaves
the allocation valid at rebuild (the anchor is unaffected) (SC9). Because the
ledger page lives in the wiki repo, this convention edit lands through the
normal wiki landing path, not the spec PR; the spec PR carries only the libwiki
code and the procedure documentation.

## Step 6 — Substrate properties documentation (SC10)

Intent: record why #1564 comments meet D1's substrate test.

Files: a short § in the conventions block (Step 5) and the `ledger` command
help text.

- State: a posted comment survives any wiki landing, merge, or projection loss;
  GitHub assigns one total `id` order; no wiki/git operation edits or deletes a
  posted comment; amendment posts a new comment citing the prior id, resolved
  per D2.

Verification splits along what code owns versus what the platform owns. SC10's
projection-loss clause is code-tested: deleting both projections and rebuilding
from a fixed anchor sequence restores every id (the Step 3 idempotence test).
SC10's two platform clauses — one total `id` order every observer agrees on,
and no in-place edit/delete of a posted comment — are properties of the GitHub
comment surface, not of libwiki code, so they cannot be unit-tested here. The
plan meets them by the choice of surface (the corpus's perfect loss record on
SHA/anchor-keyed identity is the field evidence) and records them in the
conventions doc. The replay of the eraser corpus's wiki/git shapes (stale-tree
merge, stale fast-forward) against a held anchor is the projection-level test
above, since those operations act on the wiki repo, which the anchor does not
live in.

## Risks

- **Backfill double-registration.** Running `allocate --backfill` twice would
  post duplicate anchors; the procedure requires `verify` to pass first, and
  the fold's conflict detector surfaces any duplicate as a first-published-wins
  resolution rather than a silent double.
- **Owner/repo resolution.** `readAnchors` needs the `forwardimpact/monorepo`
  slug for the comments path; derive it from the configured remote (reuse
  `GitClient.remoteGetUrl`) rather than hardcoding, so installs with a renamed
  fork still resolve #1564's host repo.
