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
| `fit-map init` ([init.js](../../products/map/src/commands/init.js)) | no | no | no | shipped (data-only) |
| `fit-pathway` | n/a | n/a | n/a | not shipped; in-flight [spec 230](../230-pathway-init-npm/spec.md) |
| `fit-landmark` | n/a | n/a | n/a | not shipped |
| `fit-summit` | n/a | n/a | n/a | not shipped |
| `fit-outpost` | n/a | n/a | n/a | not shipped |

Two concrete failures follow from this asymmetry:

**1. Anchor escape, observed.** During spec 990's implementation, the
kata-interview workflow had to add a workaround step
([kata-interview.yml § Substrate stage](../../.github/workflows/kata-interview.yml))
because invoking a fit-map CLI verb from an `$AGENT_CWD` without `config/`
caused the upward-walk to resolve outside `$AGENT_CWD`. Spec 990 ships that
workaround as a one-line `mkdir -p`. Every other caller that runs a Forward
Impact CLI outside a `fit-guide`-initialised project re-encounters the same
escape and has to know the workaround.

**2. Bootstrap re-derivation, forecast.** `fit-guide init` already carries
~50 lines of `config/` creation, starter-config copy, and `.env`
provisioning logic. Spec 230 proposes an `fit-pathway init` that will
re-derive the same shape; every future product that adopts `init` faces the
same decision. Two products with non-overlapping top-level config
namespaces (`product.guide` + `service.mcp` from Guide; whatever Map ships)
are safe to merge given a shared writer, but each per-product `init` today
either has to skip writing `config/` (fit-map's current path) or risk
truncating a sibling product's contributions (a hypothetical fit-map init
that overwrote `config/config.json`).

The user-facing job impacted is the closest match in
[JTBD.md § Platform Builders: Build Agent-Capable Systems](../../JTBD.md).
Its **Trigger** — *"Building an agent that needs structured knowledge or
typed contracts — and the alternative is reimplementing plumbing from
scratch"* — applies directly: a contributor adopting a new product CLI is
reimplementing project-bootstrap plumbing if every product's `init`
makes its own choices. Its **Competes With** clause names "ad-hoc
frameworks" as the alternative to defeat. The mapping isn't perfect —
the JTBD's Big/Little Hire route to **Gear**, not to product CLIs
directly — but the underlying job (give the family a shared capability
through one interface) is the one this spec serves.

## Scope

### In scope

| Component | What changes |
|---|---|
| Shared init capability | One callable interface, exposed from a Forward Impact library, that a product's `init` verb hands its starter material to. The interface receives at least: a target directory, a `config.json` fragment scoped to one or more top-level namespaces the product owns, and a set of `.env` entries the product wants written. Where the interface lives (which library) and what it's named is a design choice. |
| Namespace ownership semantics | The shared interface treats top-level keys in `config.json` as product-owned: keys present at the same path with the same value across two callers are a successful no-op; keys present at the same path with different values are a refusal-by-default that requires the caller to signal explicit overwrite intent. Cross-namespace writes always succeed. The mechanism for signalling overwrite intent is a design choice. |
| `.env` write semantics | Same ownership model as `config.json` at the key granularity, expressed against the actual `.env` file the libconfig credential-override loop reads. Same-key-same-value writes are no-ops; same-key-different-value writes refuse without explicit overwrite intent. The shared interface preserves whatever permissions the existing `.env` writer maintains today; if no permission guarantee exists today, this spec does not introduce one. |
| Read-side coherence with spec 990 | Spec 990 introduced credential-override semantics where shell env wins over `.env`, and empty-string shell values are treated as absent for credential keys. The `.env` write semantics this spec introduces apply only to the *writer*. The reader's resolution order is unchanged; an empty-string write to `.env` is therefore equivalent to absence on the read path. |
| `fit-map init` behaviour change | `fit-map init` adopts the shared interface and starts producing a `config/` directory at the init target. Whether it ships a starter `config.json` fragment carrying a `product.map` namespace is a design choice; the spec requires only that subsequent fit-map CLI invocations from that target resolve config-anchoring locally (rather than escaping upward). The existing `data/pathway/` write is unchanged. |
| `fit-guide init` behaviour preservation | `fit-guide init` adopts the shared interface; the set of files it produces on disk, the set of `.env` keys it writes, and its exit-code contract for the same user invocations all match the pre-spec behaviour. |
| New-product onboarding | A documented contract — surfaced at one home (the design picks where) — describes how a future product's `init` verb adopts the shared interface: package its starter material, declare the namespaces it owns, hand both to the interface. |
| Failure surfacing | A refused write (same-key-different-value, no overwrite intent) exits non-zero with a diagnostic that names the conflicting key path and what the caller would do to signal overwrite intent. Whether the diagnostic also names the *first writer* is left to the design — recording first-writer identity may be unimplementable without a marker the spec does not require. |

### Out of scope, deferred

- **Removing the kata-interview workflow's `mkdir -p config/` workaround.**
  That line ships under spec 990 and stays until a downstream consumer
  supersedes it. Removal belongs in a follow-up spec once `fit-map init`
  is the canonical path.
- **Adding new `init` verbs.** `fit-landmark`, `fit-summit`, and
  `fit-outpost` do not ship `init` today. Whether they should is a
  per-product decision deferred to per-product specs. `fit-pathway init`
  is owned by spec 230 — coordinating the two specs is in scope (this
  spec should not contradict 230), but writing 230's plan is not.
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
- **Migrating non-init callers that create `config/` themselves** (the
  kata-interview substrate-stage workflow, any future direct caller).
  The spec is scoped to product `init` verbs.

## Preconditions

This spec assumes spec 990 has merged before implementation begins. Spec
990 ships the `mkdir -p config/` workaround that today represents the
**1. Anchor escape, observed** failure mode in the Problem statement; the
implementation surface of this spec replaces (and eventually allows
removal of) that line. If 990 changes shape during its panel review or
post-merge fixes, this spec's Problem evidence may need to be re-anchored.

## Success Criteria

| Claim | Verification |
|---|---|
| Two products with disjoint top-level namespaces produce a `config/config.json` carrying both starters' contributions. | A test invokes the shared interface against the same target directory with two starters declaring different top-level namespaces, then reads `config.json` and asserts every top-level key from both starters is present with its original value. |
| Re-invoking the shared interface with the same starter is a no-op. | A test invokes the interface twice with identical inputs against the same target, asserts the second call exits zero, and asserts the on-disk `config.json` and `.env` bytes are identical between calls. |
| Re-invoking with two products' starters in alternating order converges to a stable result. | A test invokes the interface as A → B → A → B against the same target with the same two disjoint starters, asserts the final on-disk state is byte-identical to the state after the first A → B pair. |
| Same-key, different-value writes refuse by default and name what the caller would do to opt in. | A test invokes the interface once writing `product.x.foo = "a"`, then again writing `product.x.foo = "b"` without overwrite intent; asserts the second call exits non-zero, the on-disk `config.json` is byte-identical to the state after the first call, and the stderr diagnostic carries the conflicting key path and a reference to the overwrite-intent surface. |
| Same-key, same-value writes are no-ops. | Same test setup with `product.x.foo = "a"` written twice exits zero on the second call and produces byte-identical on-disk state. |
| `.env` writes follow the same ownership semantics. | A test invokes the interface with a starter declaring two `.env` entries against a target that already carries a third disjoint `.env` entry from prior provisioning; asserts the result carries all three entries with their original values, the pre-existing entry is byte-unchanged, and a subsequent same-key-different-value write refuses non-zero. |
| `fit-map init` produces a project layout where subsequent fit-map invocations anchor at the init target. | A test runs `fit-map init` against a fresh tmpdir, then runs a fit-map verb that loads libconfig from a subdirectory of the tmpdir; asserts libconfig's resolved anchor is the init target rather than any ancestor. |
| `fit-guide init`'s observable contract is preserved. | The existing fit-guide init test suite stays green. Specifically: the same set of files lands on disk for the same user invocations (a `config/config.json`, a `.env` carrying the same key set, a `package.json` when one didn't exist, a `.claude/skills/` tree when starter skills exist), and the same exit codes are returned. |
| The new-product onboarding contract is discoverable from at least one entry point a new contributor will naturally find. | A test runs `bunx fit-<product> init --help` for every product that ships `init` after this spec lands, asserts the rendered help text references the shared contract by name or surface. |
| Existing in-tree tests for libconfig, libsecret, and the affected product CLIs stay green. | `bun run test` exits zero on the implementation branch. |
