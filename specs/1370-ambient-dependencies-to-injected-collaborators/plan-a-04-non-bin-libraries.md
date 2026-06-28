# Plan 1370 — Part 04: Non-Bin Libraries

Migrates the 19 libraries under `libraries/` that don't ship a `bin/`
entry. Each is consumed by other libraries / products / services and
needs its src modules to participate in the `runtime` contract so its
consumers can finish their own migrations.

Each section below is **one PR / one sub-row**. Sections execute in
parallel once plan-a-01 has merged. No golden-capture step (no CLIs).

Blocking dependency: plan-a-01 (foundations) merged.

Sub-rows: one per section below.

## Recipe deviation

Non-bin libraries follow the [migration recipe](plan-a.md#migration-recipe)
**without** steps 2 (golden capture) and 7 (golden replay). All other
steps apply as written. The verification table reduces accordingly:

| Check | Command | Pass condition |
|---|---|---|
| Invariant | `bun run invariants` | exit 0; no new violations for unit's glob |
| Unit tests | `bun test libraries/<unit>/test/` | `0 fail`, `0 errors` |
| Deny-list shrink | inspection | every `<unit>` entry removed |

## libbridge

Sub-row: `1370/libbridge\tplan\timplemented`.

Files (src): `libraries/libbridge/src/*.js`. Touches `node:fs` for callback
persistence and `process.env` for service-config bridging.

- Constructor migration: every public class (bridge factory, callback handler,
  payload validator) accepts `{ runtime }`. Already-shipped hardening
  (MAX_REPLY_COUNT, bodyLimit, sanitization — see MEMORY 1370 sibling note)
  remains untouched; only the ambient-dep accesses migrate.
- Async surface: callback persistence converts to `runtime.fs` (async).

## libformat

Sub-row: `1370/libformat\tplan\timplemented`.

Files (src): `libraries/libformat/src/*.js`. Primarily pure transforms; check
whether any module reads from disk for format-spec lookup.

- If no ambient deps surface in the audit, libformat's PR is a no-op except for
  the deny-list and the explicit "no violations" certification in the PR body.

## libindex

Sub-row: `1370/libindex\tplan\timplemented`.

Files (src): `libraries/libindex/src/*.js`. Index store may use `node:fs` for
persistence.

- Standard `{ runtime }` constructor injection.

## libmacos

Sub-row: `1370/libmacos\tplan\timplemented`.

Files (src): `libraries/libmacos/src/*.js`. macOS-specific subprocess calls
(`security`, `codesign`, `notarytool`) are core to this library.

- `subprocess` collaborator routing for every shell-out; the
  `runtime.subprocess.run` contract covers it.
- Token / credential access via `runtime.proc.env` for `APPLE_ID_PASSWORD` and
  similar.
- Tests that exercise real `security` cannot run in CI; they get
  `*.integration.test.js` suffix and stay locally-runnable.

## libmcp

Sub-row: `1370/libmcp\tplan\timplemented`.

Files (src): `libraries/libmcp/src/*.js`. MCP transport library — third-party
SDK boundary; SDK usage stays unwrapped per [spec § Out of scope](spec.md#scope)
"External SDK abstractions". Migrate only the project-internal ambient-dep
usages.

## libpack

Sub-row: `1370/libpack\tplan\timplemented`.

Files (src): `libraries/libpack/src/*.js`. Pack/unpack utilities — may shell out
to tar / unzip.

- `subprocess` routing for any shell-out; `fs` routing for archive writes.

## libpolicy

Sub-row: `1370/libpolicy\tplan\timplemented`.

Files (src): `libraries/libpolicy/src/*.js`. Policy evaluator — pure logic if no
env/file reads; audit and certify.

## libpreflight

Sub-row: `1370/libpreflight\tplan\timplemented`.

Files (src): `libraries/libpreflight/src/*.js`. Environment preflight checks
read `process.env`, `node:fs`, and may shell out to verify CLI availability.

- Heavy `runtime.proc.env` + `runtime.subprocess.run` usage.

## libprompt

Sub-row: `1370/libprompt\tplan\timplemented`.

Files (src): `libraries/libprompt/src/*.js`. Prompt template library — file
reads for template loading.

- `runtime.fs` for template I/O.

## libproto

Sub-row: `1370/libproto\tplan\timplemented`.

Files (src): `libraries/libproto/src/*.js`. Proto codegen artifacts — likely
pure transforms over already-loaded protos. Audit and certify.

## librepl

Sub-row: `1370/librepl\tplan\timplemented`.

Files (src): `libraries/librepl/src/*.js`. REPL — `process.stdin` /
`process.stdout` reads/writes.

- `runtime.proc.stdout.write` for outputs; `runtime.proc.stdin`
  (AsyncIterable<string>) for inputs. The `stdin` slot is shipped as part of
  `createDefaultProc` and `createMockProcess` in plan-a-01 Steps 2 and 4 — no
  foundations-amendment is owed for librepl.
- Any `node:readline` consumption in librepl wraps the `stdin` AsyncIterable or,
  if line-editing semantics are needed, stays as a direct `node:readline` import
  inside an allow-listed librepl factory (analogous to `createDefaultClock`'s
  use of `setTimeout` directly). The allow-list entry is added in this PR's
  allow-list edit.

## libsecret

Sub-row: `1370/libsecret\tplan\timplemented`.

Files (src): `libraries/libsecret/src/*.js`. Secret access — `process.env` reads
and possibly `keytar` / macOS keychain via subprocess.

- `runtime.proc.env` for env-based secrets; `runtime.subprocess` for keychain
  shell-outs.

## libskill

Sub-row: `1370/libskill\tplan\timplemented`.

Files (src): `libraries/libskill/src/*.js`. Skill loader — `node:fs` reads for
SKILL.md / metadata.

- `runtime.fs` for skill metadata I/O.

## libsyntheticgen, libsyntheticprose, libsyntheticrender

Sub-rows: `1370/libsyntheticgen`, `1370/libsyntheticprose`,
`1370/libsyntheticrender`.

Files: respective `src/*.js` directories. Synthetic-data generation may write to
disk, read templates, and possibly invoke external tools.

- Standard `{ runtime }` injection per library.
- Synthetic fixtures under `benchmarks/` are excluded from `bun run test` per
  `.rgignore` — no test-side migration owed there.

## libtemplate

Sub-row: `1370/libtemplate\tplan\timplemented`.

Files (src): `libraries/libtemplate/src/*.js`. Template renderer — file reads
for partials.

- `runtime.fs` for partial I/O.

## libtype

Sub-row: `1370/libtype\tplan\timplemented`.

Files (src): `libraries/libtype/src/*.js`. Type guards / typedef registry —
likely pure. Audit and certify.

- If pure, sub-row advances on a doc-only PR ratifying the libtype no-op +
  deny-list entry removal (if any seed entries exist for libtype).

## libui

Sub-row: `1370/libui\tplan\timplemented`.

Files (src): `libraries/libui/src/*.js`. UI runtime (web side) — reads `window`
/ DOM, not `process`. `InvocationContext` consumer.

- libui's handlers already receive `ctx`; the change is they additionally read
  `ctx.deps.runtime` for any node-runtime collaborator they need (rare on the
  web side, but in scope for the universal contract).
- libui-specific surfaces (DOM, fetch) are not part of `runtime`; spec scope is
  node-runtime primitives.

## Libraries used

Libraries used: libutil (Runtime), libmock (createTestRuntime + fakes),
each migration target library.

## Risks

- **No-op libraries inflate the PR queue.** If half the non-bin libraries audit
  as pure, each ships a no-op PR + sub-row. Mitigation: each no-op PR carries a
  one-paragraph audit note in the PR body documenting which smells were checked
  and that none were found; release-merge approves no-op PRs on the audit note
  alone.
- **librepl line-editing semantics rely on `node:readline` inside an
  allow-listed factory.** The librepl section's allow-list entry adds the
  readline import path; if the REPL grows pseudo-terminal control beyond what an
  `AsyncIterable<string>` plus `readline` can express, the runtime contract
  grows to match. Mitigation: librepl's audit during this PR is the trigger to
  surface that growth; widening goes through a spec amendment, not a quiet
  plan-a-01 patch.
- **libmacos / libsupervise / libpack subprocess shapes are platform-specific.**
  A migration that converts to async surfaces a flake in platform-specific
  tests. Mitigation: integration tests stay locally-runnable; CI skips them;
  per-platform CI matrix verifies before sub-row advance.

— Staff Engineer 🛠️
