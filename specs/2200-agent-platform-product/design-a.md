# Design 2200 — An agent-runtime platform product

Packages the agent-runtime substrate as a Secondary meta-product (`PLATFORM`,
name deferred) split cleanly out of Gear along one line: **`PLATFORM` ships what
you run; Gear ships what you import.** The product has two concrete surfaces —
an npm meta-package that re-exports the three runtime *libraries*, and a GitHub
Actions surface (`products/<platform>/actions/`) that owns the composite actions
which execute the coding agent in CI. Extracting those actions leaves
`libharness` and `libwiki` as pure libraries; `svctrace` stays in Gear.

## Restated problem

The bootstrap layer plus `fit-harness`/`fit-trace`/`fit-wiki`/`fit-xmr` already
work and are published, but no product frames them. Their libraries are
re-exported by Gear (a build-time primitives meta-package), the actions that run
them hang off library directories, and `bootstrap` is filed as CI plumbing under
`.github/`. The design gives the substrate one product home — an npm axis and an
actions axis — and sharpens Gear to a single audience.

## Architecture

Two meta-products, one boundary. `PLATFORM` re-exports the three runtime
libraries and owns the run actions; Gear keeps the build-time set (including
`svctrace`). The libraries stay on disk under `libraries/`; only their
`actions/` subdirectories move into the product.

```mermaid
flowchart TD
  subgraph PLATFORM["products/&lt;platform&gt; (new, meta-package)"]
    direction TB
    subgraph NPM["npm axis: re-exported libraries"]
      P1[libharness → fit-harness, fit-trace]
      P3[libwiki → fit-wiki]
      P4[libxmr → fit-xmr]
    end
    subgraph ACT["actions axis: products/&lt;platform&gt;/actions/"]
      A0[bootstrap — stand up]
      A1[harness — run]
      A2[wiki — remember]
      A3[benchmark — measure]
    end
  end
  subgraph LIBS["libraries/ (now pure, no actions/)"]
    L1[libharness]
    L2[libwiki]
  end
  subgraph GEAR["products/gear (refocused, build-time only)"]
    G1[libgraph / libvector / libresource]
    G2[librpc / libcodegen / svcmcp / svcgraph / svcvector]
    G3[libstorage / libdoc / librc / libsupervise / svctrace]
  end
  LIBS -. actions extracted to .-> ACT
  KATA[Kata: reference tenant] -.runs on.-> PLATFORM
```

The runtime loop the product narrates, on both axes: **stand up** (bootstrap
action) → **run** (harness action / `fit-harness`) → **see** (`fit-trace`,
reading NDJSON) → **remember** (wiki action / `fit-wiki`) → **measure**
(benchmark action / `fit-xmr`).

## Components

| Component | Where | Responsibility |
| --- | --- | --- |
| Platform package | `products/<platform>/package.json` (new) | Meta-package: `description`, one Big Hire `jobs` entry (`user` `Teams Using Agents`), `dependencies` = the three runtime libraries. No `bin/`, no `src/`, and — like Gear — no hand-authored `README.md`. |
| Platform actions | `products/<platform>/actions/{bootstrap,harness,wiki,benchmark}/` (moved) | The composite actions that execute the runtime in CI, relocated from `.github/actions/bootstrap/`, `libraries/libharness/actions/{harness,benchmark}/`, and `libraries/libwiki/actions/wiki/`. |
| Overview page | `websites/fit/<platform>/index.md` (new) | The "stand up and operate an agent team" story by persona; presents the CLIs and the CI actions as one loop; Getting Started names the bring-up layer. `layout: product`. |
| Platform skill | `.claude/skills/fit-<platform>/SKILL.md` (new) | When to hire the platform; how the capabilities compose into the loop. No `## Documentation` CLI-parity block — the meta-package ships no CLI of its own (the Gear/Kata `private`/no-`bin` exemption in `products/CLAUDE.md`). |
| Library purification | `libraries/libharness/`, `libraries/libwiki/` | The `actions/` subdirectories are removed; the libraries become import-only. |
| Publish workflow repoint | `.github/workflows/publish-actions.yml` | Matrix `prefix:` for `bootstrap`/`harness`/`benchmark`/`wiki` repointed under `products/<platform>/actions/`; `paths:` filter updated. `repo:` sibling names unchanged. |
| Gear package edit | `products/gear/package.json` | Remove the three runtime library deps; remove the operate-time ("chart agent metrics") promise from `jobs.littleHire`. Keep `svctrace`. |
| Kata framing | `KATA.md`, overview page | Name Kata as the reference tenant; no `products/kata/` change. Update the `sibling-composite-actions` enum / action-home prose to the new homes. |
| Generated context + counts | `JTBD.md`, `products/README.md`, `CLAUDE.md` | Regenerate the catalog/JTBD blocks via the context command; hand-edit the `products/README.md` intro count and `CLAUDE.md` § Secondary Products (neither is generated). |

## Interfaces

- **The boundary predicate** — a capability belongs to `PLATFORM` iff you *run*
  it to operate a team (the harness/wiki/xmr CLIs and the bootstrap/harness/
  wiki/benchmark actions); it stays in Gear iff you *import* it to build an
  agent (graph, vector, resource, rpc, codegen, svcmcp, storage, doc, rc,
  supervise, and `svctrace`). Applied once, it partitions the substrate with no
  package or action in both.
- **`svctrace` is import-time, not run-time** — `fit-trace` reads NDJSON emitted
  by `fit-harness`; it has no dependency on `svctrace`. `svctrace` is an OTel
  gRPC ingestion service whose product consumer is Guide. It therefore stays in
  Gear's build-time set and is explicitly excluded from the runtime subset.
- **Action move is a source repoint, not a republish** — the subtree-split maps
  a monorepo `prefix:` to a **sibling repo name**. Moving a `prefix:` from
  `libraries/libharness/actions/harness` to `products/<platform>/actions/harness`
  changes the source path and the `paths:` filter only; the `harness` sibling
  repo and every downstream `uses: forwardimpact/harness@v…` pin are untouched.
  Kata's vendored `action.yml` files pin the sibling repos by name, so they are
  unaffected too.
- **Package-granular npm split** — library membership is expressed only in each
  meta-product's `dependencies`, and a whole library moves as a unit.
  `libharness` carries `fit-benchmark` and `fit-selfedit` besides
  `fit-harness`/`fit-trace`; those travel with it into `PLATFORM`, which is
  correct — benchmarking and self-edit are part of proving and running an agent
  team, not build-time primitives.
- **Shared foundation is out of scope** — `libtelemetry`, `libutil`, and similar
  cross-cutting packages are not in the runtime subset. Wherever Gear re-exports
  them today is left as-is; `PLATFORM` does not claim them.
- **Name indirection** — every new path carries the deferred name. The design is
  correct for any chosen slug; implementation substitutes the resolved name into
  `<platform>` across the new/edited surfaces at once.

## Key Decisions

| Decision | Choice | Rejected alternative |
| --- | --- | --- |
| Product tier | Secondary meta-package mirroring Gear/Kata (re-export list + JTBD + page + skill, no CLI) — plus a `products/<platform>/actions/` surface like `products/kata/actions/`. | A Primary product with its own `fit-<platform>` CLI — invents a command with nothing to do; the capabilities already have CLIs. |
| Split mechanism | Clean break: runtime library deps move out of Gear into `PLATFORM`; run actions move out of the library dirs into `PLATFORM`; no cross-listing. | Cross-list the runtime packages in both products — leaves two products claiming the same capability, the exact blur being removed (spec SC3). |
| Boundary line | `run` vs `import` (operate a team vs build an agent), applied to both libraries and actions. | Split by layer (libs vs services) or by "agent-ish vs not" — neither yields a clean single-audience cut. |
| `svctrace` | Excluded from `PLATFORM`; stays a Gear build-time dep (it is Guide's OTel collector, not `fit-trace`'s source). | Include `svctrace` on the strength of its blurb ("prove agent changes") — but `fit-trace` reads local NDJSON and never touches `svctrace`, so it fails the run predicate. |
| Run-action home | Move `bootstrap`/`harness`/`benchmark`/`wiki` into `products/<platform>/actions/`; repoint the split `prefix:` only. | Leave them under `.github/` and the library dirs and only narrate them — keeps the run surface scattered and leaves `libharness`/`libwiki` shipping CI actions. |
| `bootstrap` placement | Move it into the product with the other run actions, accepting that most CI workflows consume it as the base FIT environment. That base environment *is* the platform's stand-up step; every CI job is a tenant of it. | Keep `bootstrap` under `.github/` as neutral infra — leaves the "stand up" step of the loop outside the product and the actions surface incomplete. |
| JTBD binding | New distinct job *Stand Up and Operate an Agent Team* under `Teams Using Agents`; Kata's existing job untouched. | Re-point Kata's job to `PLATFORM` — erases Kata's ownership of its own hire; or two `user`s on one job — the schema allows one `user` per entry. |
| Kata relationship | Document Kata as the reference tenant; move no code. | Build a fresh demo tenant to prove genericity — the spec already treats Kata as living proof; a second tenant is unbuilt scope. |
| Naming | Defer; carry `<platform>` placeholder through every surface. | Pick a name now — the user reserved naming for a later iteration. |
| Boundary cases | `libdoc`, `librc`, `libsupervise`, `svctrace` stay in Gear; `libterrain` and `svcpathway` deferred, untouched. | Pull `fit-doc`/`fit-terrain` into the platform now — doc fails the run-the-team test; terrain is Map-entangled (spec Scope-out). |

## Data flow

```mermaid
sequenceDiagram
  participant Author as this change
  participant Plat as products/&lt;platform&gt;
  participant Libs as libraries/{libharness,libwiki}
  participant Gear as products/gear
  participant CI as publish-actions.yml
  participant Ctx as context command + hand edits
  Author->>Plat: add package.json (deps = 3 runtime libs), page, skill
  Author->>Libs: git mv actions/* into products/<platform>/actions/ (+ .github bootstrap)
  Author->>CI: repoint matrix prefix + paths (repo names unchanged)
  Author->>Gear: remove 3 runtime libs; drop operate-time clause; keep svctrace
  Author->>Plat: name Kata as reference tenant (KATA.md + page)
  Author->>Ctx: run context:fix (regenerates JTBD + catalog blocks)
  Author->>Ctx: hand-edit README intro count + CLAUDE § Secondary + action-home prose
  Ctx-->>Author: bun run check passes → boundary is single-home (SC1–SC7, SC11)
```

## Success criteria coverage

| # | Met by |
| --- | --- |
| 1 | Platform `package.json` deps = the three runtime libraries, nothing else (no `svctrace`). |
| 2 | Gear `package.json` edit removes all three runtime libraries. |
| 3 | Clean-break split (no cross-listing) → each runtime library in exactly one product. |
| 4 | `svctrace` stays a Gear dep, absent from the platform deps. |
| 5 | Gear `jobs.littleHire` edit removes the operate-time clause. |
| 6 | `git mv` of the four action sources into `products/<platform>/actions/`; `libharness`/`libwiki` `actions/` and `.github/actions/bootstrap/` removed. |
| 7 | `publish-actions.yml` matrix repointed (prefix + paths), sibling `repo:` names unchanged. |
| 8 | Platform `jobs` array carries one `Teams Using Agents` Big Hire with a goal distinct from Kata's. |
| 9 | New overview page + skill name the bring-up layer, reference the four runtime CLIs, and present the CI actions as the same loop. |
| 10 | Kata framed as reference tenant in `KATA.md`/page; no `products/kata/` diff. |
| 11 | `context:fix` regenerates JTBD + catalog; hand edits fix the intro count, `CLAUDE.md`, and action-home prose; `bun run check` passes. |
| 12 | Spec § Deferred decisions present; name/terrain/svcpathway untouched. |

## Clean break and scope

The change adds one product and edits one, and regroups the run actions under
the product. Gear loses the three runtime library deps outright — no shim, no
deprecation alias — and keeps `svctrace`. No runtime library moves on disk (only
its `actions/` subdirectory does), the sibling action repos keep their names and
pins, and `products/kata/` gains no code. The product name, `fit-terrain`'s
home, and the `svcpathway` mis-filing stay out of scope per the spec, each
recorded as a deferred decision rather than resolved.
