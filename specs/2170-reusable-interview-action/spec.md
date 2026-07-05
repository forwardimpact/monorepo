# Spec 2170: Package the interview capability as a reusable published action

**Classification:** Internal. The bulk of the change lands under `.github/`
(a new composite action and a slimmed workflow), `libraries/libharness/` (a
`fit-harness` verb), and `.claude/skills/` (skill parameterization). One verb
lands under `products/map/` (`fit-map substrate`), but it extends substrate
CI-provisioning machinery, not a persona-facing product feature. The change
serves the **Platform Builders** persona indirectly by making the interview
capability consumable by external teams, but no shipped end-user product
surface changes behaviour.

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
push its load-bearing bash into **tested CLI verbs split across `fit-map` and
`fit-harness`**, and **parameterize the target** so a consumer supplies its own
entry point and product. Reduce `kata-interview.yml` to a thin wrapper over the
action, and update the Polaris reference to wrap the same action.

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
- Optional substrate + Supabase bring-up and env propagation, gated on a
  generic `substrate` input — **not** a hardcoded product name.
- The supervised interview run via the harness in `supervise` mode.
- Cost reporting, wiki push, and run-log secret scanning.

It exposes **app-specific** choices as inputs: the entry-point `website-url`,
`product`, `job`, steering `task-amend`, whether the run is `substrate`-backed,
and the usual auth and turn/timeout knobs. A consumer wraps the action in its
own workflow, passing these; the action contributes no monorepo-specific
assumptions.

### CLI split — the right seam between `fit-map` and `fit-harness`

The two untested inline-bash blocks move to the CLI that already owns their
domain. Each verb ships with a unit test, which the inline bash never had. The
seam rationale (which CLI, and why not `fit-trace`) is a design concern.

| Capability | Home CLI |
| --- | --- |
| Emit `SUPABASE_URL` + `SUPABASE_ANON_KEY` as env-file lines after substrate bring-up | `fit-map substrate` (owns the substrate lifecycle) |
| Scan a completed run's log archive for secret literals and fail closed on any hit | `fit-harness` (owns the agent-run lifecycle) |

`scan-logs` does not read secrets from fixed env names — the caller passes the
literals to check. The action supplies three: the persona JWT (from the
`fit-map substrate issue --stash` file), plus the substrate `jwt-secret` and
`service-role-key`. This cross-CLI handoff (one `fit-map` verb produces a
literal a `fit-harness` verb consumes) is expressed through the verb's input
list, not a hidden coupling.

### Parameterized target — reads inputs, no hardcoded entry point

The `kata-interview` skill and its `job-handoff` reference stop hardcoding
`https://www.forwardimpact.team` — including the two worked examples in
`job-handoff.md`, which switch to a `<website-url>` placeholder so the file
carries no literal entry point. The action passes the consumer's `website-url`
into the run environment; the supervisor reads it when composing Ask 2. Product
and job selection already read `JTBD.md` and `products/` — surfaces every
MONOREPO.md-compliant installation carries — so no further generalization of
selection is required. Substrate gating moves from the `landmark` product name
to the generic `substrate` input the action already carries.

### Reference-app enablement (secondary goal)

The monorepo deliverable is the action, the CLI verbs, and the parameterized
skill. The reference-side deliverable is **documentation only**: the
`references/bionova-apps/` staging area (this repo, per `references/CLAUDE.md`)
gains prose describing an interview workflow that wraps the published action
against Polaris' Supabase stack and `https://` entry point. It does not require
Polaris application code to exist or run — building Polaris is spec 1160 work in
the external repo, tracked separately. Because the interview stages synthetic
data into a temporary agent working directory (never the app tree), it needs no
part of the Polaris build beyond the vendored `story.dsl` every installation
already carries.

## Scope

### Included

- New composite action `products/kata/actions/kata-interview/` (`action.yml` +
  `README.md`), wired into the subtree-split publish set.
- `fit-map substrate` gains a way to emit `SUPABASE_URL`/`SUPABASE_ANON_KEY` as
  env-file lines to a caller-named path, with a unit test.
- `fit-harness` gains a `scan-logs` verb that scans a run's log archive for a
  set of secret literals and exits non-zero on any hit, with a unit test.
- `.github/workflows/kata-interview.yml` refactored to a thin wrapper over the
  action; its inline `python3` parse and inline log-scan bash removed.
- Substrate gating expressed as a generic `substrate` input, replacing the
  `inputs.product == 'landmark'` predicate throughout the workflow and action.
- `website-url` action input threaded into the run; `kata-interview` SKILL.md
  and `references/job-handoff.md` read the entry point rather than hardcoding
  `forwardimpact.team`.
- The shape-invariant test updated to assert the generic `substrate` gating on
  the action's substrate-only steps and the sub-60-minute `timeout-minutes` on
  the wrapper workflow's job (`concurrency` and the job timeout stay on the
  wrapper, since a composite action cannot declare either).
- Reference update in `references/bionova-apps/` documenting a Polaris interview
  workflow that wraps the published action.

### Excluded

- Renaming any sibling repo or CLI, or moving `fit-map` into the gear bundle —
  the action keeps the documented `bunx fit-map` exception.
- Changing the interview loop itself — the two-Ask handoff, persona isolation,
  and finding-classification Process in the skill are unchanged.
- Changing the harness `supervise` contract or the `fit-trace cost` report.
- Managed Supabase, or any Polaris application code (that is spec 1160 work in a
  separate repo).
- Publishing a `fit-interview` CLI or a new library — the logic splits onto the
  two existing surfaces.

## Prerequisites

- None blocking. The co-located action home (`products/kata/actions/`) and the
  subtree-split publish mechanism (`.github/workflows/publish-actions.yml`)
  already exist and already ship `kata-agent`; adding `kata-interview` is one
  matrix entry and one path filter. **Spec 2140 — subtree-split actions** (plan
  approved) is related work on that mechanism, not a hard dependency.

## Success Criteria

1. `products/kata/actions/kata-interview/action.yml` exists, declares the inputs
   in § A reusable `kata-interview` action, and emits a `trace-file` output.
   Verify (manual acceptance, not a merge-gate check): a `workflow_dispatch` of
   the wrapper with `substrate: false` yields a non-empty `trace-file` output
   and a cost line in the step summary.

2. The `kata-interview.yml` workflow contains no inline `python3` Supabase parse
   and no inline log-scan bash. Verify:
   `rg 'python3|supabase status' .github/workflows/kata-interview.yml` returns
   nothing, and the workflow calls the action.

3. `fit-map substrate stage` gains a flag/mode that emits the Supabase URL and
   anon key as env-file lines to a caller-named path. Verify: with the flag set,
   the verb writes `SUPABASE_URL=` and `SUPABASE_ANON_KEY=` lines to the path,
   covered by a passing unit test.

4. `fit-harness scan-logs` accepts a resolved log archive plus secret literals,
   owns the archive download when given a run id, and exits non-zero when any
   supplied literal appears in the logs and zero when none do. Verify: a unit
   test asserts both the hit (non-zero) and clean (zero) paths against a fixture
   archive.

5. Substrate steps are gated on the generic `substrate` input, with no
   `product == 'landmark'` literal in the workflow or action. Verify: the shape
   test asserts substrate steps carry the `substrate` predicate and
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
   wraps the published `kata-interview` action with Polaris' entry point and
   `substrate: true` (documentation only; no Polaris code required). Verify:
   the reference names the action and passes `website-url` + `substrate` inputs.
