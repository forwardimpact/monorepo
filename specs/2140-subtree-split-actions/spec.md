# Spec 2140: Publish composite actions as bidirectional subtree splits from monorepo-canonical sources

**Classification:** Internal. The change moves composite-action source into the
monorepo (`libraries/`, `products/kata/`, `.github/`), adds a publish workflow,
and adds a section to the `MONOREPO.md` structure standard. Consumption is
unchanged — workflows keep SHA-pinning the published sibling repos — so there is
no external break: the
`forwardimpact/{fit-bootstrap,fit-wiki,fit-benchmark,fit-harness,kata-agent}`
repos keep their names, tags, and `# v1` SHA-pin markers.

## Problem

The monorepo is "the source of truth for `forwardimpact/*` sibling repos." Two
of the three sibling classes already live by that rule: **skill packs** and
**npm packages** are authored in the monorepo and published outward (skill packs
by `publish-skills.yml`, npm by `publish-npm.yml`). The third class — the five
**composite actions** — is the lone exception. Their source exists only in the
sibling repos; they are edited _on the sibling_, then consumed back through
SHA-pinned `uses:` lines bumped by Dependabot.

That exception costs three things:

- **No shared context when editing.** Editing an action means leaving the
  monorepo, so the contributor (human or agent) loses the monorepo's
  `CLAUDE.md`, `CONTRIBUTING.md`, checklists, and quality commands — the very
  context that defines how work here is done.
- **Hostile to restricted environments.** Some environments (for example
  network-proxied agent runners) can reach only a single repository's remote.
  Today this is worked around ad hoc with `GH_TOKEN` and the `gh` CLI per
  [`.github/CLAUDE.md`](../../.github/CLAUDE.md). Source that lives only on the
  sibling is unreachable there; source that travels with the monorepo is not.
- **Two mechanisms for one job.** "Publish a monorepo subtree to a sibling repo"
  already exists for skill packs, but the actions don't use it, so the model a
  contributor must hold is inconsistent across otherwise-identical siblings.

The actions are also **open source**, so external contributors can and do open
PRs against the standalone action repos. Today there is no defined path to bring
those contributions back; they land on the sibling and risk being overwritten by
the next change pushed from the monorepo.

## Why this is separate from skill-pack publishing

Skill packs need a **transform**: their monorepo form under `.claude/skills/` is
not their published form (`fit-pack stage` rewrites them into the `.apm/` layout
with generated `apm.yml`/`README.md`). A content-copy publisher is correct for
them.

The actions need **no transform**: an action's form in the monorepo _is_ its
published form — `action.yml` and its files, verbatim at the repo root. Combined
with the open-source pull-back requirement, this calls for a **deterministic,
bidirectional split**, not a content-copy. The two sibling classes have
different requirements and keep different mechanisms.

## Scope

In scope:

| Item                   | What changes                                                                                                                                                                                                                                                                                                                                         |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Action source homes    | Each action's canonical source moves into the monorepo, co-located with its owning unit (homes enumerated below)                                                                                                                                                                                                                                     |
| Outbound publish       | A new workflow publishes each action verbatim to its sibling's `main` as a deterministic subtree split, on every push to `main` that touches its source (continuous mirror). A one-time seed establishes the lineage; subsequent pushes are non-force. Cross-repo auth uses a per-repo scoped GitHub App token, as `publish-skills.yml` already does |
| Inbound pull-back      | A defined, repeatable procedure brings an external sibling PR's commits back into the monorepo prefix, preserving authorship, as a normal monorepo PR subject to the usual gates                                                                                                                                                                     |
| Projection invariant   | Sibling `main` is always a projection of the monorepo: external PRs are reviewed on the sibling but never merged there — they land via the monorepo and reappear on the next publish                                                                                                                                                                 |
| `MONOREPO.md` standard | A new section documents co-located action sources + subtree-split publishing as an optional repository-structure standard                                                                                                                                                                                                                            |
| `.github/CLAUDE.md`    | The "Editing a published action" guidance is replaced: actions are now edited in the monorepo and published outward; the "edit on the sibling" exception is retired                                                                                                                                                                                  |

Action homes:

| Action          | Sibling repo                  | Monorepo home                                 |
| --------------- | ----------------------------- | --------------------------------------------- |
| `fit-harness`   | `forwardimpact/fit-harness`   | `libraries/libharness/actions/fit-harness/`   |
| `fit-benchmark` | `forwardimpact/fit-benchmark` | `libraries/libharness/actions/fit-benchmark/` |
| `fit-wiki`      | `forwardimpact/fit-wiki`      | `libraries/libwiki/actions/fit-wiki/`         |
| `kata-agent`    | `forwardimpact/kata-agent`    | `products/kata/actions/kata-agent/`           |
| `fit-bootstrap` | `forwardimpact/fit-bootstrap` | `.github/actions/fit-bootstrap/`              |

Each home mirrors the **whole sibling repo root**, not just `action.yml` — every
file a consumer or the sibling's own CI resolves: `fit-benchmark` ships a
reusable workflow (`.github/workflows/benchmark.yml`, pinned by `eval-kata.yml`)
and `fit-bootstrap` ships sub-actions, and each repo's root `LICENSE`, `README`,
and any `.github/` meta (its own CI, `dependabot.yml`) travel inside the prefix
so the projection is byte-faithful. `fit-bootstrap`'s home sits beside the
repo-local composite actions under `.github/actions/`, but it is **not**
consumed locally (`./.github/actions/...`) — it is still consumed SHA-pinned
from the sibling, like the other four; its internal self-references already use
the `{owner}/{repo}/{path}@{ref}` form per `.github/CLAUDE.md`, so they survive
the projection unchanged.

The migration is **seeded once**: the first publish establishes the split
lineage on each sibling `main` (see design); pre-migration sibling history is
preserved for blame as a best effort, not as a fast-forward guarantee.

Out of scope:

- **Consumption model.** Workflows keep SHA-pinning the siblings with the `# v1`
  marker; Dependabot keeps bumping them. No submodule/gitlink is introduced. The
  pinning, trust, and tag-move policies in `.github/CLAUDE.md` are unchanged.
- **Release tagging.** Append-only `v1.0.x` tags stay human-gated; the publish
  workflow mirrors `main` only and never creates or moves tags.
- **Skill-pack and npm publishing.** `publish-skills.yml` / `publish-npm.yml`
  and `fit-pack stage` are untouched.
- **Sibling repo identities.** No sibling is renamed, created, or deleted.
- **Action behavior.** Moving source changes no action's runtime behavior.

## Success Criteria

| #   | Criterion                                                                                                                                           | Verified by                                                                                                                                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Each of the five actions has its canonical source at its mapped monorepo home, with `action.yml` (and any sub-actions / reusable workflows) present | `test -f` each `action.yml`; `fit-benchmark` home contains `.github/workflows/benchmark.yml`; `fit-bootstrap` home contains its sub-actions                              |
| 2   | A push to `main` touching an action's source republishes its sibling `main` as a byte-faithful projection of the prefix at that commit              | publish workflow run is green; sibling `main` tree equals the monorepo prefix tree                                                                                       |
| 3   | After a one-time seed, every subsequent publish is a **non-force** push; a non-fast-forward push is rejected, never forced                          | seed run recorded once; later publish runs report non-force updates; the workflow passes no `--force`/`+` refspec                                                        |
| 4   | Consumption is unchanged and no gitlink is introduced                                                                                               | `uses:` lines still resolve to sibling SHAs carrying the `# v1` marker; `test ! -f .gitmodules`; Dependabot still bumps the sibling SHA-pins in the monorepo's workflows |
| 5   | An external sibling PR replays into the monorepo prefix preserving author identity, via a scripted recipe whose home is named in the design         | the pull-back recipe replays a synthetic sample PR; the resulting monorepo commit's author equals the sample's author                                                    |
| 6   | The projection invariant is enforced by an **automated guard**, not prose — a divergent sibling `main` fails the publish run                        | a seeded drift case (a commit on sibling `main` absent from the monorepo) causes the non-force push to be rejected and the workflow to fail                              |
| 7   | `MONOREPO.md` documents the standard and `.github/CLAUDE.md` no longer instructs editing actions on the sibling                                     | both sections present/updated; no remaining "edit on the sibling" instruction                                                                                            |
| 8   | Full quality suite passes over the relocated source trees                                                                                           | repository check, test, format, and invariant commands all green after the five sources move                                                                             |

Criteria 2, 3, and 6 are verified at **publish time** (the seed run and
subsequent workflow runs), not inside the spec/design PR gate — they assert
behavior of the publish workflow against live siblings, which the migration PR
exercises once and every later push re-exercises.

## Persona and Job

Serves **Internal contributors** — who gain the monorepo's full context, quality
gates, and single-repo reachability when editing CI actions — and **Platform
Builders** (the Gear audience), for whom composite actions are shared
agent-capable building blocks now authored and proven in one place. It also lets
**external contributors** improve the open-source action repos with a defined
path back to canonical source.

## Open decisions (resolved with the requester)

| Decision                                             | Resolution                                                                                                                                                                                                      |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Track siblings as submodules at `vendor/<sibling>/`? | **No** — a gitlink is a second version reference competing with the SHA-pin (one home per policy) and is unfetchable in single-repo environments                                                                |
| Publish mechanism                                    | **Verbatim bidirectional subtree split**, not content-copy — actions publish unchanged and must accept external PRs pulled back (open source); the split establishes one append-only published lineage (design) |
| Where each action lives                              | **Co-located with its owning unit**; `fit-bootstrap` (no owning library) homes at `.github/actions/fit-bootstrap/`                                                                                              |
| Outbound trigger                                     | **Every push to `main`** touching an action's source — continuous mirror, matching `publish-skills.yml`; release tags laid separately                                                                           |
| Canonical edit surface                               | **The monorepo.** Sibling `main` is a projection; PRs are reviewed on the sibling but land via the monorepo                                                                                                     |
