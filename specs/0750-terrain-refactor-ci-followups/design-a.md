# Design — Spec 0750 (terrain refactor CI follow-ups)

## Overview

Spec 0750 closes the SCRATCHPAD-3 refactor's caller boundary, restores readable
CI logs on `data:prose`, and removes the merge-gate carve-out that masked the
regression. The architecture has three components in the change surface
(callers, scripts, merge gate) and one fixed point (the `fit-terrain` verb
surface). The design's job is to assign each broken caller to a verb, fix the
log-suppression on `data:prose`, and decide what replaces the carve-out.

```mermaid
flowchart LR
  subgraph Callers
    JS[justfile recipes]
    PS[package.json scripts]
    WF[CI workflows]
  end
  subgraph CLI[fit-terrain verb surface — fixed]
    B[build]
    G[generate]
    K[check]
    V[validate]
  end
  subgraph Outputs
    P["data/pathway/ ✓"]
    L[Diagnostic visible in CI log]
  end
  Callers --> CLI
  B --> P
  G --> P
  K --> L
  V --> L
  MG["kata-release-merge § Step 5 (carve-out removed)"]:::policy --- Outputs
  classDef policy fill:#fff3,stroke:#888,stroke-dasharray: 4 2
```

## Components

| Component                                   | Role in this design                                                                                          | Owner       |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------- |
| **`fit-terrain` CLI**                       | Fixed verb surface (`check` / `validate` / `build` / `generate` / `inspect`). Authority for what's accepted. | unchanged   |
| **`justfile` synthetic recipes**            | `synthetic`, `synthetic-update`; entry point for contributors and the e2e cache-miss path.                   | this design |
| **`package.json` scripts**                  | `prestart`, `start`, `dev`, `data:prose`, `data:schema`, `generate`. Contracts that cross the CLI boundary.  | this design |
| **CI workflows**                            | `check-test.yml` (`test`, `e2e`), `check-data.yml` (`prose`), `interview-{landmark,map,summit}-setup.yml`.   | this design |
| **`kata-release-merge` § Step 5 carve-out** | Merge-gate policy that exempts "missing `data/pathway/`" CI failures from blocking a merge.                  | this design |

## Caller intent → verb assignment

Three intents cross the CLI boundary in the named surface. Each maps to one
verb. The plan owns per-file edits; the design owns the intent-level contract.

| Intent (caller-side)                                                     | Verb       | Where intent lives                                                                                            |
| ------------------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------- |
| **Materialize `data/pathway/`** from the prose cache (no LLM).           | `build`    | Contributor entry recipe; CI workspace prep on cache miss; npm-script counterpart used by external tooling.   |
| **Fill the prose cache via LLM, then materialize `data/pathway/`**.      | `generate` | Contributor cache-refresh recipe.                                                                             |
| **Verify cache completeness** (CI gate), with diagnostic visible in log. | `check`    | `data:prose` npm-script; this caller's contract is "no log-threshold suppression" (see K3 for the rationale). |

The post-refactor CLI has no "render without prose" verb. The intent the old
`--no-prose` flag served (structural-only checks, no writes) is covered by
`validate`; the standalone recipe that wrapped it carries no architectural
weight after this collapse and is retired (see K2).

`data:schema` (which calls `validate`) and `prestart` (which reads the
materialized output via `fit-pathway build`) are not `fit-terrain` callers in
the spec's sense and are not re-architected here.

## Key decisions

| #   | Decision                                                                                                                                                                                                                                                              | Rejected alternative                                                                                                                                                                                                                                                                                                                           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K1  | The CLI's accepted verb surface is the authority — every monorepo caller speaks one of the five verbs.                                                                                                                                                                | **Restore the no-verb default to `build`.** Rejected: re-introduces the very ambiguity SCRATCHPAD-3 deleted; lets a no-verb invocation drift again on the next refactor; success criterion 3 reads "no `unknown verb` failure," not "no-verb still works."                                                                                     |
| K2  | Remove `justfile` `synthetic-no-prose` outright; CONTRIBUTING/operations docs lose the line.                                                                                                                                                                          | **Remap to `validate`.** Rejected: the recipe name says "structural data only," but `validate` writes nothing — keeping the alias creates a contract whose name and behaviour disagree. Cleaner to delete the dead name and let contributors call `bunx fit-terrain validate` when that's what they mean.                                      |
| K3  | `data:prose` drops the `LOG_LEVEL=error` prefix; `data:schema` keeps it (out of spec scope).                                                                                                                                                                          | **Drop `LOG_LEVEL=error` on both.** Rejected: spec's success criterion 4 names `data:prose` only; widening the change adds a CI-visible behaviour change that this PR cannot test against the spec's verification rule.                                                                                                                        |
| K4  | The merge-gate carve-out is **removed**, not narrowed.                                                                                                                                                                                                                | **Tighten to fingerprint the pre-refactor signature.** Rejected: a fingerprint-based bypass adds a maintenance contract that future renames or error-message edits will silently break. After this fix, `data/pathway/` is materialized by `just synthetic` (cache-only, no LLM), so the bypass has no live use case left to justify the cost. |
| K5  | The single documented sequence for success criterion 6 is `bun install && just quickstart`, with `CONTRIBUTING.md` as canonical. `bun start` succeeds after this sequence because `quickstart` runs the fixed `synthetic` recipe, which materializes `data/pathway/`. | **Add a new top-level recipe (`just dev-bootstrap`).** Rejected: extra recipe with no new behaviour. `quickstart` already calls `synthetic`; once `synthetic` is fixed, the existing sequence works.                                                                                                                                           |
| K6  | The `Test (e2e)` `synthetic-cache` action stays. The cache key (`hashFiles('data/synthetic/**', 'products/map/schema/json/**', 'bun.lock')`) is unchanged.                                                                                                            | **Bust the cache to force a clean miss path.** Rejected: an old cache hit hides nothing — the failure mode was on the miss path, where `just synthetic` ran. Once `synthetic` is fixed the miss path passes; the cached output remains valid.                                                                                                  |

## Risks

| Id  | Risk                                                                                                                           | Mitigation in this design                                                                                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | A `bunx fit-terrain` invocation outside the named surface (justfile / package.json / `.github/workflows/**`) is missed.        | Plan adds an automated grep gate (matches success criterion 3's "static inspection"); fails CI if any `bunx fit-terrain` lacks a verb in the named surface.                                                                                                                                                               |
| R2  | `fit-terrain build` on a clean checkout exits non-zero because `data/synthetic/prose-cache.json` has misses (not regenerated). | This design assumes `build` succeeds when prose-cache misses are present. The assumption sits upstream of this design (in the SCRATCHPAD-3 CLI surface, which is the spec's premise); if it does not hold, the verb chosen for the `synthetic` intent must change. Spec's success-criterion-6 replay is the verification. |
| R3  | `package.json` `generate` and `justfile` `synthetic` end up duplicates of each other.                                          | They are. Deduplication is out of scope; the design notes it for a future cleanup spec rather than removing the npm script in this PR.                                                                                                                                                                                    |
| R4  | Removing the merge-gate carve-out lets a transient first-time-setup failure block a real PR.                                   | After this fix, every CI path that needs `data/pathway/` materializes it via `just synthetic` (cache-only, no LLM). There is no first-time-setup failure mode left in CI.                                                                                                                                                 |

## Out of scope (reaffirmed from spec)

- SCRATCHPAD-3 architecture (verbs, DAG, cache format, sink topology).
- `data/{pathway,knowledge,activity,personal}/` content.
- `data/synthetic/` source-of-truth inputs.
- `Test`/`Data` workflow jobs other than `e2e` and `prose`.
- Other `kata-release-merge` carve-outs and the merge gate beyond Step 5.
- Log-level policy across the rest of the codebase (only `data:prose` changes).
