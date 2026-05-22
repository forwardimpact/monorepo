# Spec 1240: Engineering-outcomes docs reference legacy driver ids after starter swap

## Problem

Spec 1180 (PR #1109, merged 2026-05-21) replaced the starter `drivers.yaml`
3-id list (`quality`, `reliability`, `cognitive_load`) with the canonical
16-id GetDX taxonomy. Two narrative guides under `engineering-outcomes/`
still teach against the legacy ids — sentences, worked-example tables, and
copy-from-doc-to-shell command examples.

A reader who follows the *Map for Leaders* getting-started path runs
`npx fit-map init` today, lands on a `drivers.yaml` populated with the 16
GetDX ids (`deep_work`, `code_review`, `incident_response`, …), and then
opens one of these guides. Every `--item` argument in the example commands
names an id that does not exist in the installed starter; pasting the
command yields no rows. The copy-from-doc-to-shell contract on which the
Big Hire / Little Hire doc surfaces rest is broken on first contact.

The stale surfaces are:

- **engineering-outcomes/index.md** (the doc surface where the Big Hire
  job is hired) — the *"the starter data includes `quality`,
  `reliability`, and `cognitive_load`"* sentence; the `snapshot trend`,
  `snapshot compare`, `health`, and `voice` shell readouts; the Verify
  section's recurrence of `--item quality`.
- **engineering-outcomes/culture-investments/index.md** (the doc surface
  where the Little Hire job is hired) — the worked-example initiative
  table's `Intended driver` column (`init_007` → `cognitive_load`,
  `init_029` → `quality`); the two `snapshot trend --item <driver>`
  shell blocks and their readouts; the `snapshot compare` table; the
  voice readout's `Below-50th driver alignment` line; the end-of-guide
  *Worked.* verdict example narrating the `init_007` story against
  `cognitive_load`.

The *"starter data includes"* sentence and the `--item` argument names
are the load-bearing breaks — they directly violate the
copy-from-doc-to-shell flow. The readout-table cells are coherence
breaks: even after correcting the `--item` argument, a reader who runs
the corrected command and sees a row labelled `deep_work` next to
surrounding prose still saying `cognitive_load` cannot map output back
to instruction without re-reading the page.

## Persona and job

**Engineering Leaders → Measure Engineering Outcomes**
([JTBD.md](../../JTBD.md)). The Trigger is "Quarterly review is due and
the only data is ticket counts — singling out individuals, not
illuminating the system." The Big Hire ("demonstrate engineering
progress without making individuals feel surveilled") is hired at
engineering-outcomes/index.md; the Little Hire ("tell whether culture
investments are working before the next budget cycle") is hired at
engineering-outcomes/culture-investments/index.md. Both surfaces
teach the reader to run `fit-landmark` commands with specific
`--item <driver>` arguments. The job's competing Habit ("equating
velocity and throughput with team health") wins by default when the
documented commands return no rows, exactly when the persona was about
to abandon ticket counts in favour of GetDX driver scores.

## Strategic position

The starter is the authoritative example for the canonical GetDX
taxonomy (spec 1180, criterion 2). Narrative guides under
`engineering-outcomes/` are the documented path the persona follows to
use that starter. The two must agree: every example id the guide names
must exist in the starter the reader just installed, and the
substitution choices must preserve the narrative through-line that
gives the worked examples their pedagogical shape.

The substitutions are determined by the existing narrative anchors:

- `cognitive_load` → `deep_work`. The `init_007 Deep Work remediation`
  story names "Deep Work" in the initiative title; the canonical
  driver `deep_work` aligns one-to-one. No alternative is plausible.
- `reliability` → `incident_response`. The `voice` readout already
  cites "3 incident comments" as the below-50th-driver alignment;
  the canonical driver `incident_response` matches the cluster theme
  and the cited evidence type. No alternative is plausible.
- `quality` → `code_review`. The `init_029 One BioNova` consolidation
  storyline reads as a review-discipline harmonization initiative;
  `code_review` is the canonical driver whose noun-form most directly
  names what the worked example improves. This spec commits to
  `code_review`; downstream phases do not get to relitigate.

## Scope

| Surface | Change | What it does |
| --- | --- | --- |
| `websites/fit/docs/products/engineering-outcomes/index.md` narrative + example output | substitute the three legacy ids with their canonical counterparts (per Strategic position) across the *"the starter data includes"* sentence, the `snapshot trend`, `snapshot compare`, `health`, and `voice` readouts, and the Verify section's `--item` argument | every driver id rendered in narrative prose or shell-readout output resolves under `bunx fit-pathway driver --list` against the starter |
| `websites/fit/docs/products/engineering-outcomes/culture-investments/index.md` narrative + example output | apply the same three substitutions across the initiative table's `Intended driver` column, the `snapshot trend --item <driver>` blocks and their readouts, the `snapshot compare` table, the voice readout's `Below-50th driver alignment` line, and the end-of-guide *Worked.* verdict example | the `init_007 Deep Work remediation` ↔ `deep_work` and `init_029 One BioNova` ↔ `code_review` storylines remain intact and the worked example runs end-to-end against a fresh `fit-map init` |
| Companion prose around each substituted id | adjust adjacent sentences only where the substitution would otherwise leave dangling references | e.g. a sentence that reads *"the starter data includes `quality`, `reliability`, and `cognitive_load`"* becomes a sentence whose list-of-three matches the substituted ids; the prose contract — naming three example ids from the starter — is preserved |

### Out of scope

| Surface | Reason | Escape route |
| --- | --- | --- |
| `contributingSkills` / `contributingBehaviours` array illustration | spec 1180 left those arrays empty in the starter for the 16 new ids pending content authoring | follow-on spec when starter mappings are authored |
| Rewrite of the underlying initiatives narrative (`init_007 Deep Work remediation`, `init_029 One BioNova`) | the storylines survive id substitution unchanged | new spec if user testing surfaces narrative gaps |
| The `Data Summary` validate-output counts under *Confirm your data is ready* | the counts do not match the current starter, but this is entity-count drift, not driver-id drift; resolving it needs an authoritative source-of-truth call (starter as-shipped vs. illustrative example) and would expand scope into a full entity-count audit | follow-on issue against `documentation-review` under `product-pages` |
| Other docs that may name legacy driver ids | this spec is bounded to the two pages flagged in PR #1109's out-of-scope row 1 | follow-on issue if a repo-wide sweep surfaces further hits during implementation |
| Skill-pack copies of these guides | published skills mirror the doc source via sync; no skill-pack edit is needed | n/a |

## Success criteria

| # | Criterion | Verification |
| --- | --- | --- |
| 1 | Every driver id rendered in narrative prose, fenced shell-readout blocks, or `--item` arguments on either guide exists in `products/map/starter/drivers.yaml` | a scan of both guides for the strings `quality`, `reliability`, `cognitive_load` returns zero matches inside narrative driver-id contexts (the three contexts named above); incidental English uses elsewhere in the doc (e.g. the word "quality" outside a driver-id position) are not affected |
| 2 | Each `snapshot trend --item <driver>` shell example in either guide pastes-and-runs against a fresh `fit-map init` starter | the `<driver>` token in every `--item` argument across both guides equals an id present in `products/map/starter/drivers.yaml` |
| 3 | The worked-example initiative table in culture-investments/index.md continues to map exactly two initiatives to two drivers, with the `init_007 Deep Work` ↔ `deep_work` narrative through-line intact | the table's `Intended driver` column names ids from the canonical 16; the `init_007` row's intended-driver id is `deep_work` |
| 4 | The `voice` readout's `Below-50th driver alignment` line on each guide remains internally coherent — the named driver id and the cluster-count reference describe the same kind of evidence | on engineering-outcomes/index.md, the driver id is `incident_response` and an `incident` cluster appears in the readout lines above; on culture-investments/index.md, the driver id is `incident_response` and the cluster-count reference (`3 incident comments`) describes the same evidence type the driver names, regardless of which themed cluster is shown above (the page does not show an `incident` cluster — only `focus` — and changing that is out of scope) |
| 5 | The two pages build clean | the `fit` site builds with no new broken-partial errors and no new warnings on either page, measured against the current `main` baseline |
| 6 | No new staleness is introduced — the structure of each substituted block is preserved | the post-substitution count of paragraphs and fenced code blocks on each page is unchanged from the pre-substitution count, confirming the change is purely an id-token rewrite plus adjacent-sentence adjustment, not a structural rewrite |

## Risks

- **Substitution coherence beyond the two pages.** Other Landmark
  guides or skill pack copies may carry the same legacy ids.
  Criterion 1 is scoped to the two flagged pages; implementation
  should sweep the wider docs tree for other hits and surface any
  out-of-scope finds as a follow-on rather than expand the PR.
- **Sibling staleness in the `Data Summary` block.** Entity counts
  in the `npx fit-map validate` example output do not match the
  current starter for any entity. A reader who notices the id fixes
  but not the count mismatch may file a follow-up issue; the
  implementation PR body should call this out as known sibling
  staleness, out of this spec's scope, to keep the surface honest.

## References

- Issue [#1111](https://github.com/forwardimpact/monorepo/issues/1111)
  — triaged report from PR #1109's out-of-scope row 1.
- Spec 1180 / PR #1109 — starter `drivers.yaml` swap to canonical
  16-id GetDX taxonomy; the change that left these two guides stale.
- `products/map/starter/drivers.yaml` — canonical 16-id list against
  which substitutions are verified.
- `websites/fit/docs/products/engineering-outcomes/index.md` — Big
  Hire doc surface for *Measure Engineering Outcomes*.
- `websites/fit/docs/products/engineering-outcomes/culture-investments/index.md`
  — Little Hire doc surface for the same job.
- `JTBD.md` § *Engineering Leaders: Measure Engineering Outcomes*
  — canonical job definition, Big Hire / Little Hire pairing.
