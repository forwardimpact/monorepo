# Spec 2170: Package the interview capability as a reusable published action

**Classification:** Internal. The bulk of the change lands under `.github/` (a
new composite action and a slimmed workflow) and `libraries/` (`fit-terrain`
gains a generic substrate verb, `fit-harness` a scan verb), plus `.claude/`
(skill parameterization). A small `--emit-env` output is added to `fit-map
substrate` under `products/map/`, not a persona-facing feature. The change
serves the **Platform Builders**
persona indirectly by making the interview capability consumable by external
teams; no shipped end-user product surface changes behaviour.

## Problem

The JTBD switching-interview capability — build a persona from synthetic data,
hand a job to an isolated agent at a public website, capture friction as issues
— lives almost entirely as inline bash in one workflow,
`.github/workflows/kata-interview.yml`. That workflow is not reusable:

- **Generic infrastructure is welded to monorepo specifics.** Substrate
  bring-up, Supabase URL discovery, cost reporting, and run-log secret scanning
  are generic to any interview, but they sit beside a hardcoded
  `inputs.product == 'landmark'` predicate, a hardcoded entry-point URL
  (`https://www.forwardimpact.team`), and monorepo-only App slugs. A second
  repository cannot run an interview without copying and editing the whole file.
- **Load-bearing logic is untested inline bash.** Supabase status is parsed
  with an inline `python3` snippet; the secret-literal log scan is ~50 lines of
  inline bash that downloads a log archive, unzips it, and greps. Neither has a
  unit test — only the workflow *shape* is asserted
  (`.github/workflows/test/kata-interview-shape.test.js`).
- **The reference app has no path to interview itself.** Spec 1160
  (`references/bionova-apps/`) builds Polaris, a patient-facing product that
  runs `fit-terrain` over the same synthetic DSL and is backed by a self-hosted
  Supabase stack. Proving Forward Impact's method for an external team should
  include interviewing Polaris the same way this repo interviews its own
  products — but the interview workflow cannot be consumed, only forked.

Every other Kata CI capability is a published, SHA-pinned composite action with
its glue extracted into tested CLIs (`kata-agent` wraps `bootstrap`, `harness`,
`wiki`). The interview is the exception.

### Who is affected

- **The Kata team** — the interview workflow is unmaintainable inline bash and
  its critical secret-scan gate is untestable.
- **External teams / Platform Builders** — no reusable way to run switching
  interviews against their own product; the pitch to leaders lacks a running
  external example of the interview loop.
- **The BioNova Polaris reference** — cannot demonstrate the interview
  capability, weakening the "the method works outside the monorepo" proof.

## Proposal

Extract the generic interview capability into a **published composite action**,
split its load-bearing bash along the generic-vs-FI seam into **tested CLI
verbs** (generic Supabase bring-up in `fit-terrain`, run-log scan in
`fit-harness`), and **make the domain steps pluggable** so a consumer supplies
its own entry point, substrate bring-up, and persona selection. Reduce
`kata-interview.yml` to a thin wrapper, and give the Polaris reference a working
wire-up.

### A reusable `kata-interview` action

A new composite action, canonical source at
`products/kata/actions/kata-interview/`, published to a `forwardimpact/`
sibling by subtree split and consumed SHA-pinned — the mechanism that already
ships `kata-agent`. It owns the **generic** interview infrastructure:

- Killswitch, installation-token minting, checkout, and environment bootstrap
  (including installing the CLIs the run needs and the Supabase CLI). A
  composite action cannot declare `concurrency` or a job-level
  `timeout-minutes`, so those stay on the thin wrapper workflow (§ Scope).
- Synthetic-data build (`fit-terrain build`).
- Optional substrate bring-up by running a consumer-supplied
  `substrate-setup-command` (which emits the Supabase URL/anon key), gated on
  that command being non-empty — **not** a hardcoded product name.
- The supervised interview run via the harness in `supervise` mode.
- Cost reporting, wiki push, and run-log secret scanning.

It exposes **app-specific** choices as inputs: the entry-point `website-url`,
`product`, `job`, steering `task-amend`, the `substrate-setup-command` and
`persona-select-command`, and the usual auth and turn/timeout knobs. A consumer
wraps the action in its own workflow, passing these; the action contributes no
monorepo-specific assumptions.

### Substrate re-layering — generic to `fit-terrain`, FI-specific pluggable

The substrate work splits along a **generic vs Forward-Impact-specific** seam.
The generic half is Supabase orchestration every Supabase-backed consumer needs;
the FI half knows the map schema and persona invariants and cannot serve a
different-domain app. Each moves to the layer that owns it (opinionated: the
consumer uses Supabase — a lowest-common-denominator abstraction would be
useless):

| Capability | Home | Why |
| --- | --- | --- |
| Bring up Supabase: start, discover URL, emit `SUPABASE_URL`/`SUPABASE_ANON_KEY` | `fit-terrain` (new `substrate up`) | Generic and Supabase-aware already; every consumer runs `fit-terrain`, and it is already on PATH in the action |
| FI seed/persona layer: map-schema seed, `auth.users` provision, roster `pick`, JWT `issue`, Landmark smoke | `fit-map substrate stage` (kept), invoked through a **pluggable action command** | Product-specific; Polaris substitutes its own |
| Scan a run's log archive for secret literals, fail closed | `fit-harness` (`scan-logs`) | A run-lifecycle concern, not substrate or trace |

The generic bring-up is **added** to `fit-terrain`, not moved out of `fit-map`:
relocating `fit-map`'s stage would close a `libterrain → @forwardimpact/map`
dependency cycle, break the in-process env its map client reads, and disrupt
`fit-map activity`'s use of the shared spawner. So `fit-terrain substrate up` is
a clean generic primitive (bring-up + emit only; migrations and seed stay with
the consumer), and `fit-map substrate stage` keeps its pipeline unchanged apart
from gaining an `--emit-env` output. The action's substrate bring-up is a
consumer-supplied command (monorepo: `fit-map substrate stage`; Polaris:
`fit-terrain substrate up` + `supabase db push` + its seed), and persona
selection is a second pluggable command with the `.env`/`.substrate.json`/stash
contract `fit-map substrate issue` already satisfies (empty ⇒ `story.dsl`
identity / anonymous access).

### Parameterized target — reads inputs, no hardcoded entry point

The `kata-interview` skill and its `job-handoff` reference stop hardcoding
`https://www.forwardimpact.team` — including the two worked examples in
`job-handoff.md`, which switch to a `<website-url>` placeholder. The action
passes the consumer's `website-url` into the run environment; the supervisor
reads it in Ask 2. Product and job selection already read `JTBD.md` and
`products/`. The skill's Step 3a stops calling `fit-map` directly and instead
runs the injected `persona-select-command`. Substrate steps gate on a non-empty
`substrate-setup-command`, replacing the `landmark` product predicate.

### Reference-app enablement (secondary goal)

The monorepo deliverable is the action, the CLI verbs, the `fit-map` refactor,
and the parameterized skill. The reference-side deliverable is documentation in
the `references/bionova-apps/` staging area (per `references/CLAUDE.md`): a
Polaris `interview.yml` wrapping the published action with
`substrate-setup-command` = `fit-terrain substrate up` plus Polaris' seed, and
anonymous (or Polaris-supplied) persona access. This is a **working wire-up** —
it needs no `fit-map` and no map schema — not the placeholder the prior draft
settled for. It does not require Polaris application code to run here; the
interview stages into a temp `agent-cwd`, and Polaris already vendors
`story.dsl` and runs `fit-terrain`.

## Scope

### Included

- New composite action `products/kata/actions/kata-interview/` (`action.yml` +
  `README.md`), wired into the subtree-split publish set, with
  `substrate-setup-command` and `persona-select-command` inputs.
- `fit-terrain` gains a `substrate up` verb (Supabase-opinionated: start,
  discover, `--emit-env` — bring-up only, no migration/seed) with its own thin
  cwd-explicit spawner and a unit test. Nothing moves out of `products/map`.
- `fit-map substrate stage` gains an `--emit-env` output after its existing
  `url-discovery` phase — no delegation, no refactor of its phases — with a
  test.
- `fit-harness` gains a `scan-logs` verb that scans a run's log archive for a
  set of secret literals and exits non-zero on any hit, with a unit test.
- `.github/workflows/kata-interview.yml` refactored to a thin wrapper that
  supplies the FI `substrate-setup-command` and `persona-select-command`; its
  inline `python3` parse and inline log-scan bash removed.
- Substrate gating expressed as a non-empty `substrate-setup-command`, replacing
  the `inputs.product == 'landmark'` predicate throughout.
- `website-url` threaded into the run; SKILL.md Step 3a runs the injected
  `persona-select-command` instead of calling `fit-map`; SKILL.md and
  `references/job-handoff.md` read the entry point rather than hardcoding
  `forwardimpact.team`.
- The shape-invariant test updated to assert substrate gating on
  `substrate-setup-command != ''` and the sub-60-minute `timeout-minutes` on the
  wrapper job (`concurrency` and the job timeout stay on the wrapper).
- Reference update in `references/bionova-apps/` documenting a Polaris interview
  workflow whose `substrate-setup-command` uses `fit-terrain substrate up`.

### Excluded

- Renaming any sibling repo or CLI, or moving `fit-map` into the gear bundle.
  The generic bring-up now runs via `fit-terrain` (already on PATH); the only
  remaining `bunx fit-map` use is the monorepo wrapper's own FI substrate
  command, which stays the documented exception.
- Changing the interview loop itself — the two-Ask handoff, persona isolation,
  and finding-classification Process in the skill are unchanged.
- Changing the harness `supervise` contract or the `fit-trace cost` report.
- Managed Supabase, or any Polaris application code (that is spec 1160 work in a
  separate repo).
- Publishing a `fit-interview` CLI or a new library — the generic substrate
  layer lands in `fit-terrain`, the scan in `fit-harness`.

## Prerequisites

- None blocking. The co-located action home (`products/kata/actions/`) and the
  subtree-split publish mechanism (`.github/workflows/publish-actions.yml`)
  already exist and already ship `kata-agent`; adding `kata-interview` is one
  matrix entry and one path filter. **Spec 2140 — subtree-split actions** (plan
  approved) is related work on that mechanism, not a hard dependency.

## Success Criteria

1. `products/kata/actions/kata-interview/action.yml` exists, declares the inputs
   in § Action interface (incl. `substrate-setup-command`,
   `persona-select-command`), and emits a `trace-file` output. Verify (manual
   acceptance): a `workflow_dispatch` of the wrapper with an empty
   `substrate-setup-command` yields a non-empty `trace-file` and a cost line in
   the step summary.

2. The `kata-interview.yml` workflow contains no inline `python3` Supabase parse
   and no inline log-scan bash. Verify:
   `rg 'python3|supabase status' .github/workflows/kata-interview.yml` returns
   nothing, and the workflow calls the action.

3. `fit-terrain substrate up --emit-env <path>` brings up Supabase generically
   (start + discover) and writes `SUPABASE_URL=`/`SUPABASE_ANON_KEY=` lines to
   `<path>`; `fit-map substrate stage --emit-env <path>` writes the same two
   lines after its `url-discovery` phase. Verify: a unit test with a stubbed
   Supabase spawner asserts both lines for each verb.

4. `fit-harness scan-logs` accepts a resolved log archive plus secret literals,
   owns the archive download when given a run id, and exits non-zero when any
   supplied literal appears in the logs and zero when none do. Verify: a unit
   test asserts both the hit (non-zero) and clean (zero) paths against a fixture
   archive.

5. Substrate steps and the scan are gated on a non-empty
   `substrate-setup-command`, with no `product == 'landmark'` literal in the
   workflow or action. Verify: the shape test asserts the gate and
   `rg "product\s*==\s*'landmark'"` over the workflow and action returns
   nothing.

6. The entry-point URL is not hardcoded in the interview skill. Verify:
   `rg 'forwardimpact\.team' .claude/skills/kata-interview/` returns nothing;
   the skill reads the URL from the run environment.

7. The wrapper workflow's interview job declares a `timeout-minutes` strictly
   under 60 (kept at the current `50`) so a stalled run cannot outlive its
   1-hour App token; the composite action cannot set this. Verify: the shape
   test asserts the wrapper job's `timeout-minutes < 60`.

8. `references/bionova-apps/` prose documents a Polaris interview workflow that
   wraps the published action with Polaris' entry point and a
   `substrate-setup-command` built on `fit-terrain substrate up` (no `fit-map`,
   no map schema). Verify: the reference names the action and passes
   `website-url` + a `fit-terrain`-based `substrate-setup-command`.
