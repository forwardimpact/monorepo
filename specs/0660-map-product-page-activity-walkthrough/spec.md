# Spec 0660 — Map Product Page Activity-Layer Walkthrough

## Problem

First-time users landing on the Map product page (`/map/`) cannot discover the
activity layer from the page alone. The Quick Start section shows three
commands:

```sh
npm install @forwardimpact/map
npx fit-map init
npx fit-map validate
```

A user who stops here sees only the framework layer. They do not learn that:

- `fit-map activity start` exists and brings up a local Supabase stack
- `fit-map people push` loads organization data into the activity layer
- `fit-map activity verify` confirms the activity layer is healthy
- Supabase (CLI + running instance) is a prerequisite for any of the above
- `MAP_SUPABASE_URL` and `MAP_SUPABASE_SERVICE_ROLE_KEY` must be exported before
  ingestion commands will work

The canonical first-run activity-layer flow is documented in
`website/docs/getting-started/leadership/map/index.md` (sections "Activity:
install the Supabase CLI" through "Activity: verify").

The leadership getting-started guide
(`website/docs/getting-started/leadership/map/index.md`, 455 lines) contains the
full end-to-end walkthrough, but the product page Quick Start does not signal
that a second, longer path exists. The single "Leadership" card below Quick
Start reads as an audience filter ("this guide is for leaders"), not as "the
rest of the walkthrough lives here." Users following the Quick Start alone reach
`validate` and stop.

Source: issue #432, user testing of the `fit-map first-run` evaluation scenario
(2026-04-19). The stale `stages.yaml` directory listing referenced in the
original issue has since been removed from the Map product page and is out of
scope.

## Scope

In scope — `website/map/index.md`:

| Component             | What must change                                                                                                                                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Quick Start section   | A first-time user reading the Quick Start can reach the activity-layer workflow that culminates in `fit-map activity verify`. The design decides whether the commands appear inline or via a labelled link; this spec does not prescribe the content layout. |
| Supabase prerequisite | The Supabase requirement (CLI install + running instance) is surfaced in the Quick Start reading path before any command that depends on it.                                                                                                                 |
| Env-var handoff       | `MAP_SUPABASE_URL` and `MAP_SUPABASE_SERVICE_ROLE_KEY` are visible (or reachable via a labelled link) on the Quick Start reading path before any command that requires them.                                                                                 |

Out of scope:

- Restructuring the leadership getting-started guide (still the canonical
  reference for framework customization and hosted deployment).
- Changing the `fit-map` CLI itself — command names, flags, or output.
- Framework data-model changes.
- Other product pages (`/pathway/`, `/landmark/`, etc.) — even if they have
  similar Quick Start gaps, those are separate specs.
- The `stages.yaml` directory-listing claim in issue #432 — already resolved.

## Decisions deferred to design

The design (WHICH/WHERE) must choose between two approaches and justify the
trade-off:

| Approach                          | Trade-off                                                                                                                        |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Inline the walkthrough            | One-page reading path, but duplicates content from the leadership guide and risks drift between the two.                         |
| Link prominently from Quick Start | Single source of truth, but requires the user to navigate; link placement and labelling must make the activity layer unmissable. |

Either approach satisfies the success criteria below. The design must state the
chosen approach and the drift-mitigation (for inline) or link-visibility (for
link) strategy.

## Success criteria

| #   | Claim                                                                                                                                              | Verification                                                                                                                                                                                                                                                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A reviewer following only the links and commands within the Quick Start section reaches `fit-map activity verify`.                                 | A human reviewer starts at `website/map/index.md` Quick Start, follows only links that appear within that section, and runs each shown command against a clean checkout. Pass: the reviewer executes `fit-map activity verify` and it exits 0. Fail: the reviewer must search elsewhere on the site for a missing command or link. |
| 2   | The Supabase prerequisite is surfaced on the Quick Start reading path before any command that depends on it.                                       | In the reading order of `website/map/index.md`, the string `supabase` (case-insensitive) appears before the first occurrence of `fit-map activity` — in the product page itself or in a page reachable by a labelled link from Quick Start.                                                                                        |
| 3   | `MAP_SUPABASE_URL` and `MAP_SUPABASE_SERVICE_ROLE_KEY` are reachable from the Quick Start reading path before the user would hit an env-var error. | Both env-var names appear in `website/map/index.md` or in a page reachable by a labelled link from Quick Start, before any command that would fail without them.                                                                                                                                                                   |
| 4   | The activity-layer entry point is reachable from the Quick Start section itself, not only via the audience-filter card below it.                   | `website/map/index.md`: the Quick Start section contains either activity-layer commands inline or a labelled link whose text names the activity layer (not only a generic "Leadership" audience label).                                                                                                                            |
| 5   | No `stages.yaml` reference appears on the Map product page.                                                                                        | `grep -F stages.yaml website/map/index.md` returns empty (regression guard; condition already met at spec authoring).                                                                                                                                                                                                              |

## Non-goals

- Making the product page a complete substitute for the getting-started guide.
  The guide still owns framework customization, hosted deployment, and
  operational reference material.
- Adding new CLI behaviour — the spec accepts the current `fit-map` surface.
