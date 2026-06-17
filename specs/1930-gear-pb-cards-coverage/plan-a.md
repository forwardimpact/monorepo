# Plan 1930 — Gear page job-card coverage

Implements [design-a.md](design-a.md) for [spec.md](spec.md).

## Approach

Rewrite the "What becomes possible" section of `websites/fit/gear/index.md`
in place so it is a complete, persona-grouped projection of the libraries
catalog's generated `<job>` block: twelve Platform Builders cards then one
Empowered Engineers card, each linking to its own job's catalog anchor, each
body a one-to-two-sentence paraphrase of the job's Big Hire. The card-heading
list and every link anchor are derived mechanically from the `<job>`
attributes in `libraries/README.md` (single source), so the implementer and
the success-gate verifier share one origin and cannot drift. Nothing else on
the page changes.

Libraries used: none (single markdown edit).

## Source of truth (derive, do not invent)

The thirteen `<job>` tags in `libraries/README.md` § Jobs To Be Done are the
source. Card headings are the `goal` attributes verbatim; anchors are the
slug of each job's `## <Persona>: <Goal>` catalog heading.

Re-extract the current list before editing (the block is generated; do not
trust this plan's snapshot if it has regenerated):

```sh
grep -oE '<job user="[^"]*" goal="[^"]*">' libraries/README.md
```

Snapshot at plan time — 1 Empowered Engineers + 12 Platform Builders:

| Persona | Goal (card heading, verbatim) | Anchor slug |
|---|---|---|
| Empowered Engineers | Operate a Predictable Agent Team | `empowered-engineers-operate-a-predictable-agent-team` |
| Platform Builders | Bridge Threaded Channels to the Agent Team | `platform-builders-bridge-threaded-channels-to-the-agent-team` |
| Platform Builders | Enable Agents on Every Surface | `platform-builders-enable-agents-on-every-surface` |
| Platform Builders | Ground Agents in Context | `platform-builders-ground-agents-in-context` |
| Platform Builders | Ground Service Contracts in One Source | `platform-builders-ground-service-contracts-in-one-source` |
| Platform Builders | Integrate with the Engineering Standard | `platform-builders-integrate-with-the-engineering-standard` |
| Platform Builders | Keep Instruction Layers Honest | `platform-builders-keep-instruction-layers-honest` |
| Platform Builders | Keep Service Contracts Typed | `platform-builders-keep-service-contracts-typed` |
| Platform Builders | Keep Services Running and Visible | `platform-builders-keep-services-running-and-visible` |
| Platform Builders | Prove Agent Changes | `platform-builders-prove-agent-changes` |
| Platform Builders | Ship Predictable CLIs | `platform-builders-ship-predictable-clis` |
| Platform Builders | Ship Predictable Services | `platform-builders-ship-predictable-services` |
| Platform Builders | Ship Service Endpoints Without Boilerplate | `platform-builders-ship-service-endpoints-without-boilerplate` |

Each card link is the catalog README plus the slug, e.g.
`https://github.com/forwardimpact/monorepo/blob/main/libraries/README.md#platform-builders-enable-agents-on-every-surface`.

## Step 1 — Rewrite the Platform Builders group

**Intent:** Replace the six-card Platform Builders grid with all twelve
Platform Builders jobs, each card linked to its own anchor.

Files: modified — `websites/fit/gear/index.md`.

Change, within the existing `### For Platform Builders` group:

- Keep the existing Platform Builders persona framing paragraph (the
  "Give humans and agents shared capabilities…" prose) and the count sentence
  (the "N libraries and M services, all published to npm…" paragraph) exactly
  as they appear on the current page — copy the current values, do not
  re-derive the numbers (count drift is out of scope).
- Inside the `<div class="grid">`, replace the six `<a>`-wrapped cards with
  twelve, one per Platform Builders row above, in the table's order. Each card:
  - `<a href="…/libraries/README.md#<slug>">` (per-job anchor, not the shared
    `#jobs-to-be-done`).
  - `### <Goal>` heading, the `goal` attribute verbatim.
  - One-to-two sentences paraphrasing that job's Big Hire (catalog lines per
    the goal→line map: Bridge 90, Enable 113, Ground Agents 142, Ground
    Service Contracts 169, Integrate 190, Keep Instruction Layers 212, Keep
    Service Contracts 233, Keep Services Running 259, Prove 283, Ship CLIs
    305, Ship Services 323, Ship Endpoints 342). Author each body fresh as
    framing — **no sentence may be a verbatim substring of the catalog block**
    (spec gate). The existing six cards (Enable, Ground Agents, Integrate,
    Keep Service Contracts, Keep Services Running, Prove) may seed the new
    bodies, but two existing bodies must be re-scoped because they currently
    span jobs that are now separate cards: the **Prove** card body's first
    sentence is a verbatim catalog substring (paste-gate fail — reword it),
    and the **Keep Service Contracts Typed** card body currently describes
    proto sync + MCP registration + endpoint shipping (three distinct jobs —
    trim it to just that one job's framing, since "Ground Service Contracts
    in One Source" and "Ship Service Endpoints Without Boilerplate" now have
    their own cards).

Verify: `grep -oE 'README.md#platform-builders-[a-z0-9-]+' websites/fit/gear/index.md | sort -u | wc -l` returns 12 distinct slugs (distinct, so a duplicated or transposed anchor cannot pass).

## Step 2 — Add the Empowered Engineers group

**Intent:** Add a second persona group with framing copy and the one EE card.

Files: modified — `websites/fit/gear/index.md`.

Change, after the Platform Builders `</div>` and before the `---` divider:

- `### For Empowered Engineers` heading.
- A new persona-level progress paragraph in the same register as the Platform
  Builders framing, derived from the *Operate a Predictable Agent Team* Big
  Hire (catalog line 69: stable cross-session memory + signal-vs-noise
  charting via `libwiki`/`libxmr`). One short paragraph.
- A `<div class="grid">` with one `<a>`-wrapped card: heading
  `### Operate a Predictable Agent Team`, anchor
  `…#empowered-engineers-operate-a-predictable-agent-team`, body a one-to-two
  sentence Big-Hire paraphrase.

Verify: `grep -c '### For Empowered Engineers' websites/fit/gear/index.md`
returns 1 and `grep -c 'empowered-engineers-operate-a-predictable-agent-team' websites/fit/gear/index.md`
returns 1.

## Step 3 — Verify the anchor gate, paste gate, and build

**Intent:** Confirm the page mirrors the source with no orphan cards, no
catalog paste, and the site builds.

Files: none (verification only).

- **Anchor parity (mechanical diff).** Derive expected slugs from the source
  and the page's actual anchors into two comparable, sorted lists, then `diff`
  — empty diff is the gate:

  ```sh
  # expected: slugify each <job> as <persona>-<goal>, lowercased, punctuation
  # stripped, spaces → hyphens
  grep -oE '<job user="[^"]*" goal="[^"]*">' libraries/README.md \
    | sed -E 's/<job user="([^"]*)" goal="([^"]*)">/\1 \2/' \
    | tr '[:upper:]' '[:lower:]' | tr -d ':' | tr ' ' '-' | sort > /tmp/1930-expected
  # actual: the slug portion of each card anchor on the page
  grep -oE 'README.md#[a-z0-9-]+' websites/fit/gear/index.md \
    | sed -E 's/.*#//' | sort -u > /tmp/1930-actual
  diff /tmp/1930-expected /tmp/1930-actual   # must be empty (13 slugs each)
  ```

- **Heading parity (no orphan, no missing card).** The card `###` headings are
  exactly the two grids' goals; isolate them by excluding the two persona
  headings and the Getting Started card, then compare to the source goals:

  ```sh
  grep -E '^### ' websites/fit/gear/index.md \
    | grep -vE '^### (For (Platform Builders|Empowered Engineers)|Browse on GitHub)$' \
    | sed -E 's/^### //' | sort > /tmp/1930-cards
  grep -oE 'goal="[^"]*"' libraries/README.md | sed -E 's/goal="([^"]*)"/\1/' | sort > /tmp/1930-goals
  diff /tmp/1930-cards /tmp/1930-goals   # must be empty (13 goals each, verbatim)
  ```

- **Persona headings and order.** Exactly these two, in this order:

  ```sh
  grep -E '^### For ' websites/fit/gear/index.md
  # must print, in order: "### For Platform Builders" then "### For Empowered Engineers"
  ```

- **Paste gate.** No card body sentence is a verbatim substring of the catalog
  JTBD block. Mechanically pre-screen by checking each card-body sentence does
  not occur in the catalog block; the register judgement (one-to-two sentences,
  Big-Hire framing) is confirmed in the review panel. A practical pre-screen:
  read each card body and confirm no full sentence reproduces catalog text
  (the **Prove** body's old first sentence is the known offender from Step 1).

- **Build clean.** `bunx fit-doc build --src=websites/fit --out=dist` exits 0.

## Risks

- **Catalog regenerated since this snapshot.** The `<job>` block is generated;
  if a library's `package.json` changed the goal text or set, the Step-0
  re-extraction governs, not the table above. Always re-run the grep.
- **GitHub slug edge cases.** The in-scope goals contain only letters, spaces,
  and one colon in the catalog heading (stripped). No goal has parentheses,
  ampersands, or repeated hyphens, so the lowercase/strip-punctuation/space→hyphen
  rule is exact for this set; a future goal with other punctuation would need
  the rule re-checked against GitHub's slugifier.

## Execution

Single agent, sequential (Steps 1→2→3). Documentation edit to one markdown
file — route to `technical-writer` or an engineering agent; the body-copy
register against each Big Hire is the judgement call and is checked in the
review panel.

— Staff Engineer 🛠️
