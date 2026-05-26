# Spec 0970 — A Published Home for Shared Protos

## Problem

The published
[Getting Started: Guide for Engineers](../../websites/fit/docs/getting-started/engineers/guide/index.md)
opens with two commands an engineer is meant to run after `npm install`:

```sh
npx fit-codegen --all
npx fit-guide --init
```

Step 1 crashes hard in any directory that is not a clone of this monorepo.
The crash is observable on every published-package install:

```
$ npm install @forwardimpact/guide
$ npx fit-codegen --all
ENOENT … proto/tool.proto
```

`@forwardimpact/guide/proto/common.proto:5-6` declares
`import "resource.proto"` and `import "tool.proto"`, and `common.proto` uses
`tool.ToolCall`. None of the published `@forwardimpact/*` packages ship
`tool.proto`. The canonical file lives at `proto/tool.proto` at the monorepo
root and is not under any package's `files` field. The proto-discovery
function in `@forwardimpact/libcodegen` scans `node_modules/@forwardimpact/*/proto/`
and `<projectRoot>/proto/` (see
[`libraries/libcodegen/bin/fit-codegen.js:134-156`](../../libraries/libcodegen/bin/fit-codegen.js)
for the current implementation). For an external installer both directories
exist but neither contains `tool.proto`. Internal contributors do not see
the failure because they run codegen from the monorepo root where
`proto/tool.proto` is present.

The crash chains. Without generated clients,
`@forwardimpact/librc` cannot bring up the Guide service stack, so
`npx fit-guide` then fails with `ECONNREFUSED 127.0.0.1:3005` (reported in
[#940](https://github.com/forwardimpact/monorepo/issues/940) by the BioNova
persona after working around step 1) against the trace, vector, graph,
pathway, map, and mcp services. The documented Guide onboarding path is
unreachable from step 1.

`tool.proto` is not the only shared proto without a published home. Three
proto files are shared across packages today and at least one of them lacks
a published home for at least one consuming package:

| Shared file | Canonical location in repo | Published in package | Other consumers (transitive imports) |
|---|---|---|---|
| `tool.proto` | `proto/tool.proto` | **none** | `@forwardimpact/guide` (via `common.proto`), `@forwardimpact/svcgraph`, `@forwardimpact/svcmap`, `@forwardimpact/svcvector`, `@forwardimpact/svcpathway` |
| `resource.proto` | `products/guide/proto/resource.proto` | `@forwardimpact/guide` only | Transitively required by every consumer of `tool.proto` (used by `ToolFunction.id`, `ToolCallResult.identifiers`, `ToolCallMessage.id`) |
| `common.proto` | `products/guide/proto/common.proto` | `@forwardimpact/guide` only | `@forwardimpact/svcgraph` (`graph.proto:5`), `@forwardimpact/svcpathway` (`pathway.proto:5`) |

An installer who takes any service package other than Guide
(`@forwardimpact/svcgraph`, `@forwardimpact/svcmap`,
`@forwardimpact/svcvector`, `@forwardimpact/svcpathway`) for the codegen
side of the install fails codegen even if `tool.proto` is fixed in
isolation, because the file imports `resource.proto` whose only published
home is a product they did not install, and `svcgraph`/`svcpathway` also
need `common.proto` which has the same problem. The shared-proto gap is
structural — three files are affected — not a one-off oversight on
`tool.proto`.

The user-testing run in issue
[#940](https://github.com/forwardimpact/monorepo/issues/940) captured the
behavioral consequence with the BioNova J060 persona — a software engineer
post-"not yet" promotion conversation, exact fit for the *Find Growth
Areas* Big Hire. The persona reached the recommended career-guidance tool
on the documented path, watched its first install command crash with
`ENOENT`, and retreated to manually composing other product installs. The
**Competes With** alternative — "annual reviews; mentor conversations;
hoping the next project makes readiness obvious" — held its appeal because
step 2 of the published flow never produced an output worth comparing
against. The **Anxiety** force ("structured analysis might confirm being
further behind than assumed") was reinforced rather than dissolved by an
opening-step crash.

The blast radius is every external engineer who installs
`@forwardimpact/guide` on the documented onboarding path, plus every
external installation of a published `@forwardimpact/*` package whose
shipped `proto/` directory imports a proto file that does not ship in any
package the installer pulled in. The named affected install surfaces today
are:

| Package                       | Imports tool.proto | Imports common.proto | External codegen status |
| ----------------------------- | ------------------ | -------------------- | ----------------------- |
| `@forwardimpact/guide`        | via `common.proto` | (owns own copy)      | Blocked                 |
| `@forwardimpact/svcgraph`     | yes                | yes                  | Blocked                 |
| `@forwardimpact/svcmap`       | yes                | no                   | Blocked                 |
| `@forwardimpact/svcvector`    | yes                | no                   | Blocked                 |
| `@forwardimpact/svcpathway`   | yes                | yes                  | Blocked                 |
| `@forwardimpact/svctrace`     | no                 | no                   | Unaffected today        |

The unaffected `svctrace` row establishes that the gap is real (not "every
package is broken so it doesn't matter") and that any solution must continue
to work for proto packages that do not import the shared protos at all.

## Personas and Job

The hire is **Empowered Engineers** against the *Find Growth Areas* job (see
[JTBD.md](../../JTBD.md), under the
`<job user="Empowered Engineers" goal="Find Growth Areas">` entry). The Big
Hire — "get guidance and evidence grounded in my organization's standard,
not impressions or generic advice" — names the outcome Guide is positioned
to deliver. The Little Hire — "ask a growth question and check whether
recent work shows progress" — names the engineer's first interaction with
the tool. The job's **Trigger** ("the promotion conversation ended with
'not yet' but no specifics") is the exact context the BioNova persona was
in when they installed the package.

This spec does not change Guide, Map, or Graph behavior. It closes the
funnel that prevents the engineer from reaching a working installation of
Guide on the documented path. Service-package external installs are
collateral correctness: the same root cause blocks `@forwardimpact/svcgraph`,
`svcmap`, `svcvector`, and `svcpathway` external installs, and any fix to
the shared-proto publishing pattern is expected to cover them too. The
internal positioning of services (per
[services/CLAUDE.md](../../services/CLAUDE.md), services are not the
primary external-consumption surface — products and the MCP server are)
makes service installs a secondary concern, not the primary persona path.

## Scope

### In scope

| Component | What changes |
|---|---|
| Published home for shared protos | At least one published `@forwardimpact/*` package contains the canonical copies of `tool.proto`, `resource.proto`, and `common.proto` in a location that the proto-discovery mechanism (after this spec lands, whatever that mechanism becomes) finds for an external `npm install` of that package. The identity of the hosting package and the discovery mechanism are both design choices. |
| Single source of truth | After this spec lands, the canonical content of each of `tool.proto`, `resource.proto`, and `common.proto` lives in exactly one editable location in the repository. Today's situation — `proto/tool.proto` at the monorepo root, `products/guide/proto/resource.proto`, `products/guide/proto/common.proto`, plus a build-output `generated/proto/` tree that is not the source of truth — is reduced to one editable source per file. Other copies, if any, exist only as build artifacts produced by a documented codegen or copy step, not maintained by hand. The `generated/` tree continues to be build output. |
| Codegen discovery | `npx fit-codegen --all`, `--type`, `--service`, `--client`, `--definition`, and `--metadata` succeed against the documented Getting Started install of `@forwardimpact/guide` and against the standalone external install of each of `@forwardimpact/svcgraph`, `@forwardimpact/svcmap`, `@forwardimpact/svcvector`, and `@forwardimpact/svcpathway` (each without `@forwardimpact/guide` also installed). The mechanism that gets the shared protos onto the include path is a design choice; the observable end-state is fixed. |
| Dependency direction | This spec must not introduce a runtime dependency from any `services/*` package on any `@forwardimpact/<product>` package solely to obtain a shared proto. Pre-existing service-on-product runtime edges (for example `@forwardimpact/svcmap`'s and `@forwardimpact/svcpathway`'s existing `@forwardimpact/map` runtime dependency) are out of scope and are not removed or refactored by this spec — see the "Out of scope" list. |
| Documentation | The [Getting Started: Guide for Engineers](../../websites/fit/docs/getting-started/engineers/guide/index.md) page continues to instruct `npm install @forwardimpact/guide && npx fit-codegen --all` and that pair succeeds without additional steps. If the design adds a new package the engineer must install, the page is updated to include it; if the design hides the dependency inside an existing one, no prerequisites-block change is required. The published `npx fit-codegen --help` output accurately describes the proto-discovery behavior after the change. |
| Internal contributor workflow | Internal contributors continue to run `just codegen` (or equivalently `bunx fit-codegen --all`) from the monorepo root and see the same observable result. The internal codegen pipeline produces the same `generated/` tree subdirectories (currently `definitions/`, `proto/`, `services/`, `types/` for an internal full-tree run) and the same file set within each subdirectory, modulo content changes from unrelated proto edits. |

### Out of scope, deferred

- **Changes to the `tool.*`, `resource.*`, or `common.*` message schemas.**
  The wire contracts (`ToolCall`, `ToolCallResult`, `QueryFilter`,
  `Identifier`, `Empty`, etc.) are untouched. This spec is about *where the
  files live*, not what they contain.
- **The proto-loader / `@grpc/proto-loader` include-path API.** If the
  internal discovery function needs to learn a new path, fine — but
  redesigning how the proto loader resolves imports, switching loaders, or
  upstreaming changes to `@grpc/proto-loader` is excluded.
- **Codegen pipeline refactor.** The `CodegenBase` / `CodegenTypes` /
  `CodegenServices` / `CodegenDefinitions` / `CodegenMetadata` decomposition
  in `@forwardimpact/libcodegen` stays. So does the generated-output
  layout (`types/`, `services/`, `definitions/`, `proto/`). The spec scope
  is the *discovery* and *publication* sides, not the *generation* side.
- **Pre-existing service-on-product runtime edges.** `services/map/package.json`
  and `services/pathway/package.json` already list `@forwardimpact/map` as
  a runtime dependency today. Whether those edges are correct is a separate
  question; this spec does not require their removal and does not require
  any new service-on-product edge to fix the shared-proto gap.
- **Other product onboarding flows that may have parallel publishing gaps.**
  The Getting Started pages for Landmark, Outpost, Map, Pathway, and Summit
  are not in scope here unless they share the same root cause; if user
  testing turns up another package whose published protos import an
  unpublished file, that is a follow-up issue against this spec's pattern,
  not v1 scope.
- **Bundling vs separate-publish trade-off for the products themselves.**
  This spec does not change which product code paths import which generated
  types. Renaming or repackaging `@forwardimpact/guide`, `svcgraph`,
  `svcmap`, `svcvector`, or `svcpathway` is out of scope.
- **Version-pin policy across published packages.** Whether the chosen
  shared-proto home is pinned with `^`, `~`, or an exact version in
  consuming `package.json`s is a follow-up. The spec only requires that
  the dependency graph that emerges is acyclic and free of *new*
  service-on-product edges introduced for proto reasons.
- **Migration of the workspace-root `proto/` directory.** If the design
  picks a layout where `proto/tool.proto` and the two shared protos under
  `products/guide/proto/` move to a new home in the workspace, the
  migration mechanics (git mv, symlinks, codeowners updates) are
  plan-side. The spec only requires the single-source-of-truth invariant
  above.
- **A `fit-codegen --doctor` or diagnostic subcommand.** A subcommand that
  reports which proto includes resolve and which do not, when run against
  an external install, would help diagnose future variants of this bug
  but is not in v1 scope.

## Success Criteria

| Claim | Verification |
|---|---|
| External `@forwardimpact/guide` install can codegen. | Test: in a clean temp directory with no pre-existing `proto/` or `generated/`, `npm install @forwardimpact/guide` then `npx fit-codegen --all` exits 0 with no `ENOENT` on any `.proto` file. The `generated/` tree contains a non-empty `types/`, `proto/`, `services/`, `definitions/`, and `metadata/` subdirectory — the service-bearing subdirectories are populated by Guide's transitive service dependencies (`svcgraph`, `svcmap`, `svcvector`, `svcpathway`, `svctrace`, `svcmcp`, declared in `products/guide/package.json`). Each individual flag (`--type`, `--service`, `--client`, `--definition`, `--metadata`) invoked on its own against the same install also exits 0 and writes at least one file under the destination subdirectory the flag produces (the flag-to-subdirectory mapping is the same as the current internal-codegen behavior; flag and subdirectory names match the existing `--help` output). |
| Each affected service-package external install can codegen. | Test: for each of `@forwardimpact/svcgraph`, `@forwardimpact/svcmap`, `@forwardimpact/svcvector`, `@forwardimpact/svcpathway`, in a clean temp directory with no pre-existing `proto/` or `generated/` and without `@forwardimpact/guide` installed, `npm install <package>` followed by `npx fit-codegen --all` exits 0 and writes at least one file under `generated/services/` named after the service the package's own proto defines (`Graph`, `Map`, `Vector`, `Pathway` respectively). The intent is to demonstrate the shared-proto fix in isolation from any product package; the test is not invalidated if a service package's existing transitive dependencies (e.g. `svcmap`'s pre-existing `@forwardimpact/map` runtime edge) happen to drag in protos by side effect, provided the shared proto files are resolved by the design's chosen mechanism and not only as a side effect of those pre-existing edges. |
| Internal codegen still works. | Test: from a clean monorepo checkout, `bun install && just codegen` exits 0 and produces a `generated/` tree shape-equivalent to the one produced before this spec landed against the same proto sources. "Shape-equivalent" means: same set of top-level subdirectories under `generated/`, and for each subdirectory the same set of file names. Generated file *contents* may differ if an unrelated change has touched a proto schema; the criterion locks in directory and file presence, not byte-equality. |
| The Getting Started → Guide path is unblocked. | Test (release-verification gate; lives in the release engineer's pre-publish checklist, see [`KATA.md`](../../KATA.md) § Release for the current location): a clean-VM walkthrough of the published [Getting Started: Guide for Engineers](../../websites/fit/docs/getting-started/engineers/guide/index.md) page from `npm install @forwardimpact/guide` through `npx fit-codegen --all` and `npx fit-guide --init` completes without any `ENOENT` on a `.proto` file. The exact command sequence is the one printed on the page. The OS/Node-version envelope this test runs in is the same envelope the Getting Started page declares as a prerequisite ("Node.js 18+", npm). |
| Single editable source per shared proto. | Test: running `git ls-files '*tool.proto' '*resource.proto' '*common.proto'` from the repo root returns exactly one path per filename outside `generated/`. Files inside `generated/` are build output and are not counted; any other duplicate is reproducible by re-running a documented build step (named in the design or plan). |
| No new service-on-product edge from this spec. | Test: comparing the runtime `dependencies` blocks of each `services/*/package.json` between `origin/main` (pre-spec) and the merged implementation commit, no `services/*/package.json` gains a new entry under `@forwardimpact/<product>` (where `<product>` is any name listed in `products/`). Pre-existing entries are unchanged. The comparison is mechanically reproducible by a reviewer with `git diff`; no separate audit script is required by the spec. |
| Documentation is accurate. | Test: the [Getting Started: Guide for Engineers](../../websites/fit/docs/getting-started/engineers/guide/index.md) page's `Install and configure` block executes as documented against the freshly-published packages on a clean machine. If the design introduces a new package the engineer must install, the `Install` block names it. The published `npx fit-codegen --help` text is updated to describe the proto-discovery behavior the implementation has, including whatever directories or include paths the discovery mechanism reads from. |
