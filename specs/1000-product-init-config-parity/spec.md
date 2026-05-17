# Spec 1000 — Cross-product `init` parity for `config/` and `.env` bootstrap

## Problem

A contributor (human or agent) running a Forward Impact product CLI against
a clean directory hits one of two failure modes today: the CLI either
silently anchors its configuration against an unrelated `config/` directory
somewhere up the filesystem tree, or refuses to load configuration the
caller assumed was implicit. The first failure produces wrong-source bugs
that manifest far from their cause; the second produces "why doesn't this
work?" friction at the moment a new user is forming their model of the
tool.

The cause is structural. Every product CLI loads its configuration through
[`createProductConfig`](../../libraries/libconfig/src/index.js), and
configuration anchoring relies on a `config/` directory existing at the
project root (the
[`createStorage("config", …)`](../../libraries/libstorage/src/index.js)
helper walks up the filesystem looking for one). Product `init` verbs that
bootstrap a project to that contract are inconsistent across the family:

| CLI | Creates `config/` | Writes `config.json` | Writes `.env` | Init verb today |
|---|---|---|---|---|
| `fit-guide init` ([init.js](../../products/guide/src/commands/init.js)) | yes | yes (from `starter/config.json`) | yes (service URLs + credential generation) | shipped |
| `fit-map init` ([init.js](../../products/map/src/commands/init.js)) | no | no | no | shipped (data-only — writes `./data/pathway/` from [`products/map/starter/`](../../products/map/starter/); satisfies [spec 230](../230-pathway-init-npm/spec.md) after the init verb moved from `fit-pathway` to `fit-map`) |
| `fit-pathway` | n/a | n/a | n/a | not shipped |
| `fit-landmark` | n/a | n/a | n/a | not shipped |
| `fit-summit` | n/a | n/a | n/a | not shipped |
| `fit-outpost` | n/a | n/a | n/a | not shipped |

Two concrete failures follow from this asymmetry:

**1. Anchor escape, observed.** During spec 990's implementation, the
kata-interview workflow had to add a workaround step
([kata-interview.yml § Substrate stage](../../.github/workflows/kata-interview.yml))
because invoking `bunx fit-map substrate stage` from an `$AGENT_CWD`
without `config/` caused the upward-walk to resolve outside `$AGENT_CWD`.
Spec 990 shipped that workaround as a one-line `mkdir -p`. The workaround
is gated to Landmark interviews (`if: inputs.product == 'landmark'`), so
only one production callsite carries it today. The escape itself is
structural — every CLI built on `createProductConfig` resolves through
`createStorage("config", …)`, which walks upward unconditionally — so any
caller running a Forward Impact CLI outside a `fit-guide`-initialised
project hits the same anchor-resolution path. The single observed instance
is the canary, not the boundary.

**2. Bootstrap re-derivation, forecast.** `fit-guide init` already carries
~50 lines of `config/` creation, starter-config copy, and `.env`
provisioning logic. `fit-map init` ships today as data-only — its existence
already forces the question of whether it should also write `config/`,
which it declines to do precisely because no shared writer exists. Every
future product that adopts `init` (or that extends `fit-map init` to write
`config/`) faces the same decision. Two products with non-overlapping
top-level config namespaces (`product.guide` + `service.mcp` from Guide;
whatever Map ships) are safe to merge given a shared writer, but each
per-product `init` today either has to skip writing `config/` (fit-map's
current path) or risk truncating a sibling product's contributions (a
hypothetical fit-map init that overwrote `config/config.json`).

The persona served is the **internal contributor** named in
[CLAUDE.md § Goal](../../CLAUDE.md) — the human or agent maintaining the
monorepo and onboarding new product CLIs. [JTBD.md](../../JTBD.md) does
not carry a Big-Hire entry for internal contributors: every published
JTBD targets an external user group (Engineering Leaders, Empowered
Engineers, Teams Using Agents, Platform Builders). The closest external
mapping — Platform Builders' *Build Agent-Capable Systems* — routes both
its Big Hire and Little Hire to **Gear**, not to product CLIs, so the
fit is approximate. This spec serves the unrepresented internal-contributor
persona; filing a JTBD entry for that persona is out of scope here and
left to a separate spec.

## Scope

### In scope

| Component | What changes |
|---|---|
| Shared init capability | One callable interface, exposed from a Forward Impact library, that a product's `init` verb hands its starter material to. The interface receives at least: a target directory, a `config.json` fragment scoped to one or more top-level namespaces the product owns, and a set of `.env` entries the product wants written. Where the interface lives (which library) and what it's named is a design choice. |
| Namespace ownership semantics | The shared interface treats top-level keys in `config.json` as product-owned: keys present at the same path with the same value across two callers are a successful no-op; keys present at the same path with different values are a refusal-by-default that requires the caller to signal explicit overwrite intent. Cross-namespace writes always succeed. The overwrite-intent surface must be a **callable parameter of the interface itself** (programmatic, not an environment variable, command-line flag on a product CLI, or per-key marker on disk); the exact parameter name and shape is a design choice. |
| `.env` write semantics | Same ownership model as `config.json` at the key granularity, applied to the project-root `.env` file. Same-key-same-value writes are no-ops; same-key-different-value writes refuse without explicit overwrite intent. The shared interface preserves the `0o600` permission `libsecret`'s `updateEnvFile` already enforces — a regression test asserts the mode after a shared-interface write. |
| Read-side coherence with spec 990 | Spec 990 introduced credential-override semantics where shell env wins over `.env`, and empty-string shell values are treated as absent for credential keys. The `.env` write semantics this spec introduces apply only to the *writer*. The reader's resolution order is unchanged; an empty-string write to `.env` is therefore equivalent to absence on the read path. |
| `fit-map init` behaviour change | `fit-map init` adopts the shared interface and starts producing a `config/` directory at the init target. Whether it ships a starter `config.json` fragment carrying a `product.map` namespace is a design choice; the spec requires only that subsequent fit-map CLI invocations from that target resolve config-anchoring locally (rather than escaping upward). The existing `data/pathway/` write is unchanged. |
| Relationship: `fit-map init` ↔ `fit-map substrate [stage\|roster\|issue]` | `fit-map init` is the **upstream** common-denominator bootstrap shared by every fit-map caller — external contributors setting up the product on a clean machine and CI workflows preparing a synthetic-interview workspace alike. `fit-map substrate stage` is a **downstream superset** that consumes a project already bootstrapped by `fit-map init` and extends it with Supabase-stack provisioning, schema migration, activity seeding, auth-user provisioning, and self-smoke (today's verb in [`substrate-stage.js`](../../products/map/src/commands/substrate-stage.js)). After this spec lands, every common-denominator step — at minimum, creating `./config/` so libconfig anchors locally; design picks the rest from `./data/pathway/` starter copy and any `.env` skeleton — lives in `fit-map init` and is invoked from `fit-map substrate stage` rather than re-implemented in CI shell or by the substrate verb itself. The substrate subcommand family keeps its Landmark-specific responsibilities; what moves upstream is exactly what both contributor setup and interview prep share. |
| Spec 990 cleanup | The `mkdir -p "$AGENT_CWD/config"` workaround that spec 990 shipped at [`.github/workflows/kata-interview.yml`](../../.github/workflows/kata-interview.yml) line 82 is removed as part of this spec, not deferred. The kata-interview workflow's Substrate stage runs `bunx fit-map init` (or `fit-map substrate stage` calls it internally; design picks the shape) so the workaround is unnecessary by construction. The workflow's end-to-end behaviour for Landmark interviews — provisioned substrate, resolvable `PRODUCT_LANDMARK_TOKEN`, persona discovery via `substrate roster`/`substrate issue` — is preserved. |
| `fit-guide init` behaviour preservation | `fit-guide init` adopts the shared interface. **First-run** preservation is strict: the set of files produced on disk, the set of `.env` keys written, and the exit code for the same user invocation match the pre-spec behaviour. **Re-run** semantics intentionally change: today fit-guide init prints `"config/ already exists, skipping starter copy"` and exits zero; under the shared interface a re-run with identical starter inputs is a same-key-same-value no-op (still exits zero, byte-identical on-disk state). The replacement message and the loss of the "skipping" wording are acceptable; no fit-guide-specific re-run output is preserved. |
| New-product onboarding | The shared library's `README.md` documents the contract for adopting the interface: how a product packages its starter material, declares the namespaces it owns, signals overwrite intent, and hands both to the interface. The library identity (which existing or new library hosts the interface) is a design choice; the README home is not. |
| Failure surfacing | A refused write (same-key-different-value, no overwrite intent) exits non-zero. The diagnostic, observable on `stderr`, must contain (a) the conflicting key path written as dotted notation (e.g., `product.x.foo`) and (b) the name of the overwrite-intent parameter the caller would set to opt in. The diagnostic is not required to identify the first writer; recording first-writer identity is left to a follow-up spec if the failure mode is reported in the field. |

### Out of scope, deferred

- **Adding new `init` verbs.** `fit-pathway`, `fit-landmark`, `fit-summit`,
  and `fit-outpost` do not ship `init` today. Whether they should is a
  per-product decision deferred to per-product specs. Spec 230 — which
  originally proposed `fit-pathway init` — was implemented by moving the
  init verb into `fit-map init` (the `fit-map init` row above); no
  separate `fit-pathway init` is in flight.
- **Refactoring `fit-map substrate` beyond the upstream/downstream split.**
  Reorganising the Landmark-specific substrate phases (stack, migrate,
  seed, provision, smoke) inside `substrate-stage.js`, or merging
  `substrate roster`/`substrate issue` into other verbs, is out of scope.
  This spec only moves the common-denominator bootstrap upstream into
  `fit-map init`; the substrate verbs keep their current responsibilities.
- **Schema validation of merged `config.json`.** The spec covers merge
  ownership and conflict-refusal, not whether the merged document
  validates against a JSON schema. A future spec may add a schema once
  enough products ship namespaced sections.
- **Versioning of the shared interface's contract.** Forward-only via
  the library's own semver; a versioned `config.json` document is
  deferred.
- **Hosted secret stores for `.env` values.** Local-file write only.
- **Cross-file atomicity of `config.json` + `.env`.** If a process dies
  between the two writes, the project layout is left in a half-state.
  `fit-guide init` carries the same property today; this spec preserves
  rather than tightens it. A separate spec may add cross-file atomicity
  if the failure mode is reported in the field.
- **Migrating other non-init callers that create `config/` themselves.**
  The kata-interview workflow's `mkdir -p config/` is now in scope (see
  the *Spec 990 cleanup* row); any future direct caller outside a product
  `init` verb stays out of scope.

## Preconditions

Spec 990 is merged (`plan implemented` in `wiki/STATUS.md`). The
`mkdir -p config/` workaround it shipped — visible at
[`kata-interview.yml`](../../.github/workflows/kata-interview.yml) line 82
— is the observed evidence for the **1. Anchor escape, observed** failure
mode and is removed by this spec (see the *Spec 990 cleanup* in-scope
row).

## Success Criteria

| Claim | Verification |
|---|---|
| Two products with disjoint top-level namespaces produce a `config/config.json` carrying both starters' contributions. | A test invokes the shared interface against the same target directory with two starters declaring different top-level namespaces, then reads `config.json` and asserts every top-level key from both starters is present with its original value. |
| Re-invoking the shared interface with the same starter is a no-op. | A test invokes the interface twice with identical inputs against the same target, asserts the second call exits zero, and asserts the on-disk `config.json` and `.env` bytes are identical between calls. |
| Re-invoking with two products' starters in alternating order converges to a stable result. | A test invokes the interface as A → B → A → B against the same target with the same two disjoint starters, asserts the final on-disk state is byte-identical to the state after the first A → B pair. |
| Same-key, different-value writes refuse by default and name what the caller would do to opt in. | A test invokes the interface once writing `product.x.foo = "a"`, then again writing `product.x.foo = "b"` without overwrite intent; asserts the second call exits non-zero, the on-disk `config.json` is byte-identical to the state after the first call, and the stderr diagnostic contains the literal string `product.x.foo` and the literal name of the overwrite-intent parameter. |
| Same-key, same-value writes are no-ops. | Same test setup with `product.x.foo = "a"` written twice exits zero on the second call and produces byte-identical on-disk state. |
| `.env` writes follow the same ownership semantics. | A test invokes the interface with a starter declaring two `.env` entries against a target that already carries a third disjoint `.env` entry from prior provisioning; asserts the result carries all three entries with their original values, the pre-existing entry is byte-unchanged, and a subsequent same-key-different-value write refuses non-zero. |
| `fit-map init` produces a project layout where subsequent fit-map invocations anchor at the init target. | A test runs `fit-map init` against a fresh tmpdir, then runs a fit-map verb that loads libconfig from a subdirectory of the tmpdir; asserts libconfig's resolved anchor is the init target rather than any ancestor. |
| `fit-map substrate stage` no longer requires CI-shell bootstrap of `config/`. | A test runs `fit-map substrate stage` (with the Supabase phases stubbed out via the injectable deps in [`substrate-stage.js`](../../products/map/src/commands/substrate-stage.js)) against a fresh tmpdir with no `config/` present, asserts the run succeeds without manual `mkdir -p config/`, and asserts the resulting layout matches what `fit-map init` produces against the same tmpdir. |
| The kata-interview workflow no longer carries a `mkdir -p config/` workaround. | A grep at the repo root asserts `.github/workflows/kata-interview.yml` contains no line that creates `config/` outside a product CLI invocation; the workflow's Substrate stage uses `bunx fit-map init` (directly, or transitively via `fit-map substrate stage` calling into it). |
| End-to-end Landmark interview prep is preserved after the workaround removal. | The `kata-interview` workflow's Substrate stage continues to produce a substrate that `substrate roster` and `substrate issue` can read, `resolveIdentity()` resolves the issued JWT, and the Landmark self-smoke passes — verified by a workflow dry-run or a CI run on the implementation branch. |
| `fit-guide init`'s first-run observable contract is preserved. | A test runs `fit-guide init` against a fresh tmpdir and asserts: (a) a `config/config.json` exists with the same top-level keys as the pre-spec output, (b) a `.env` exists with the same key set, (c) a `package.json` exists when none was present before, (d) a `.claude/skills/` tree exists when the starter ships skills, (e) the exit code matches the pre-spec invocation. The existing fit-guide init test suite also stays green. |
| The shared library's `README.md` documents the onboarding contract. | A test reads the shared library's `README.md` and asserts the file contains a section that names the interface entry point, the namespace-declaration step, and the overwrite-intent parameter. |
| Existing in-tree tests for libconfig, libsecret, and the affected product CLIs stay green. | `bun run test` exits zero on the implementation branch. |
