# Spec 990 — Real-Landmark Substrate for `kata-interview` Runs

Supersedes: spec 950 (now `spec draft` in `wiki/STATUS.md` after the
maintainer un-approved the demo-mode framing on 2026-05-16). This spec
moves the work into the interview workspace prep rather than the
production CLI.

## Problem

The `kata-interview` workflow exists to stress-test Forward Impact products
against synthesized JTBD personas — a Product Manager agent runs the
[`kata-interview` skill](../../.claude/skills/kata-interview/SKILL.md),
synthesizes a persona from the synthetic content, and hands the persona
the matching JTBD entry. The interview's job is to surface real product
gaps: missing features, broken docs, friction inside the documented
workflow.

For Landmark interviews, the workflow does not deliver that signal. Every
analytical Landmark command requires a Supabase-backed identity
(`LANDMARK_AUTH_TOKEN`), but the CI workspace prep does not stand one up.
Personas walk through the documented getting-started page, hit
authentication errors on every analytical command, and either abandon the
run or hand-construct workarounds. The product gap recorded by the run is
the auth wall, not whatever the product actually fails at downstream of
identity.

[Issue #921](https://github.com/forwardimpact/monorepo/issues/921) carries
three independent persona reports of this failure mode, drawn from three
separate `kata-interview` runs against different JTBDs. The first run was
filed in the issue body; the second and third are in the issue comments.
Persona emails are at the `bionova.example` domain — the synthetic
organization defined in the content shipped with the monorepo (under the
IETF-reserved `.example` TLD, `RFC 2606`):

> **Run 1** (issue body): BioNova Platform Engineering Manager (J080,
> `athena@bionova.example`) preparing a quarterly VP review under the
> *Engineering Leaders → Measure Engineering Outcomes* job. Every
> team-level command failed before the Map data path was read.

> **Run 2** (issue comment, 2026-05-16): BioNova SWE (J060,
> `antiope@bionova.example`) under the *Empowered Engineers → Find
> Growth Areas* job. Every activity command — `readiness`, `evidence`,
> `timeline`, `coverage`, `sources` — failed identically.

> **Run 3** (issue comment, 2026-05-16): BioNova Director (J100,
> `zeus@bionova.example`) under *Measure Engineering Outcomes* again.
> Reported as "third recurrence". The persona's workaround was 25 lines
> of `jsonwebtoken` HS256 signing code against `.env`; this workaround
> is now obsolete because PR #927 ships
> [`fit-map auth issue`](../../products/map/src/commands/auth-issue.js)
> for that purpose, but the workflow did not invoke it.

Three runs, three personas, three JTBDs, one stuck pattern. None of the
runs reached the product surface they were sent to evaluate.

[`.github/workflows/kata-interview.yml`](../../.github/workflows/kata-interview.yml)
prepares the agent workspace under `Prepare interview workspace` with
`bunx fit-terrain build` (which reads
[`data/synthetic/story.dsl`](../../data/synthetic/story.dsl) — a
git-tracked DSL input — and writes typed output under `data/activity/`
and `data/pathway/`), `bun install -g supabase`, and a `mktemp -d` agent
CWD. The local Supabase stack is not started; the typed activity tables
are never populated from the synthetic output; no `auth.users` row is
created for any persona email; no JWT is minted; no
`LANDMARK_AUTH_TOKEN` is exported into the agent's environment. The
[`kata-interview` skill staging table](../../.claude/skills/kata-interview/SKILL.md)
copies `data/pathway/` and `data/activity/` into `$AGENT_CWD` for Landmark
interviews, then asks the persona to run commands that query tables which
do not exist.

The substrate that closes this gap is already on `main`. Spec 960
([PR #933](https://github.com/forwardimpact/monorepo/pull/933)) consolidated
Supabase credentials behind a single bootstrap script and typed
[`libconfig`](../../libraries/libconfig/src/config.js) getters. Spec 840
slice 1.5 ([PR #927](https://github.com/forwardimpact/monorepo/pull/927))
added an operator JWT-minting verb under
[`fit-map`](../../products/map/bin/fit-map.js), the
`organization_people.kind` discriminator (`human` / `service_account`),
and the matching engineer-side login flow. Every primitive the workspace
prep needs is on `main` today, and none of them are invoked.

[PR #926](https://github.com/forwardimpact/monorepo/pull/926) approached
the same gap from the production-CLI side, proposing a `--demo` flag on
[`fit-landmark`](../../products/landmark/bin/fit-landmark.js) with a
fixture-backed query layer. The maintainer un-approved that spec:

> The ideal solution is not a demo mode, but set up the interviews such
> that they can operate with real commands based on synthetic data.

This spec moves the work out of the production CLI and into the interview
workspace prep. `fit-landmark` is not changed.

The blast radius is every `kata-interview` run that targets Landmark
today, and every future run that targets a product whose analytical
commands need a Supabase identity. The runs cost `ANTHROPIC_API_KEY`
tokens, supervisor time, and trust in the finding stream — a finding
stream that today re-files the same auth-wall issue once per persona,
masking the actual product gaps those personas were sent to find.

## Personas and Job

JTBD.md does not carry an entry whose persona is "the operator of the
interview workflow". The closest entry is *Platform Builders →
[Evaluate and Improve Agents](../../JTBD.md)* — but that job's Big Hire
and Little Hire both route to **Gear**, not to interview infrastructure
or to Landmark. This spec acknowledges that gap and grounds itself in the
two downstream JTBDs whose evidence stream the interview produces, plus
the meta-frame of the operator job:

- **Primary anchor — the downstream JTBDs the broken interview cannot
  exercise.** Run 1 and Run 3 are *Engineering Leaders → Measure
  Engineering Outcomes* (`<job>` at JTBD.md, Big Hire "demonstrate
  engineering progress without making individuals feel surveilled",
  Little Hire "tell whether culture investments are working before the
  next budget cycle" — both routed to **Landmark**). Run 2 is
  *Empowered Engineers → Find Growth Areas* (Big Hire and Little Hire
  both routed to **Guide, Landmark**). The interview's job is to
  surface gaps in those JTBDs' product fit. Today the interview can
  only report "I could not authenticate" — gap signal that masks every
  other gap the persona would have surfaced.
- **Secondary anchor — the operator's evaluation job.** Internal
  contributors (the human maintainer and the agent team) maintain
  `kata-interview` as the evidence mechanism for product-against-JTBD
  fit. The closest JTBD entry is *Platform Builders → Evaluate and
  Improve Agents*; its Trigger ("An agent change shipped but nobody can
  tell whether it improved outcomes — the only evidence is anecdotal")
  is the operating context this spec sits inside, even though the
  entry's product target is Gear rather than Landmark or
  `kata-interview` itself.

After this spec lands, an interview run against the *Measure Engineering
Outcomes* or *Find Growth Areas* job surfaces real product gaps in
Landmark rather than CI-substrate gaps. The **Anxiety** force on
*Measure Engineering Outcomes* ("measurement feels like surveillance
regardless of intent") may fire more sharply once personas reach real
Landmark output — that is intended; today that force fires anyway, for
the wrong reason, when authentication itself is what feels like a
gauntlet.

## Scope

### In scope

| Component | What changes |
|---|---|
| Workspace state after prep | After the workflow's workspace prep step completes for a Landmark-targeted interview, the agent process is started with `LANDMARK_AUTH_TOKEN` set in its environment to a Supabase-shaped JWT that names a `human`-kind persona present in the seeded `organization_people` table. The mechanism (which scripts run, in what order, how the JWT lands in the agent's `env:`) is a design choice. |
| Product gating | Substrate prep runs at least when the chosen product is **Landmark**. Whether it also runs for other products (Map, Summit, future products) is a design choice; the spec commits only to Landmark coverage in v1. Skipping substrate prep for products that do not need it must not change those interviews' current observable behavior. |
| Persona corpus | The set of personas the workflow can choose from is the set of `human`-kind people present in the seeded `organization_people` table after substrate prep completes. The seeding flows from the synthetic content shipped under `data/synthetic/` through whatever ingestion path the design picks. The persona corpus must be non-empty after prep, with manager-employee relationships representable so commands that take `--manager <email>` can resolve to at least one managed row. |
| Discovery vector | The substrate must expose, in a form the agent can read from its workspace before invoking gated commands, the persona's email and at least one valid value for every option the libcli definition declares `required: true` across the gated commands. Concretely (from the `commands` array in [`fit-landmark.js`](../../products/landmark/bin/fit-landmark.js)): a manager email, a snapshot id, an item id, and a skill id, each drawn from the seeded substrate. Encoding (env var, JSON file at a known path, agent CLAUDE.md note) is a design choice. |
| Gated-command coverage | Every entry in the `commands` array of [`fit-landmark.js`](../../products/landmark/bin/fit-landmark.js) whose handler carries `needsSupabase: true` — listed as the leaf invocations under `org`, `snapshot`, `evidence`, `readiness`, `timeline`, `coverage`, `practice`, `practiced`, `health`, `voice`, and `sources` — must be invocable to non-error completion against the seeded substrate using the persona's identity plus the discovery vector above. `marker` and the `login`/`logout` verbs are unchanged. |
| Persona-file invariant preservation | The `kata-interview` skill at Step 4 forbids product names from appearing in the supervisor-written `$AGENT_CWD/CLAUDE.md` ([SKILL.md § Step 4](../../.claude/skills/kata-interview/SKILL.md)). The substrate must hand identity to the agent through a path that does not require the supervisor to name Landmark in the persona file. The agent's environment may carry product-named variables (the production CLI already requires `LANDMARK_AUTH_TOKEN` by name); the *persona file* must not. |
| Kata-interview skill alignment | The [`kata-interview` skill](../../.claude/skills/kata-interview/SKILL.md) Step 3 staging table reflects what the workspace now provides — substrate (including identity and discovery vector) is staged automatically for Landmark interviews. Step 4 ("Craft the Persona") gains a single explicit line stating the substrate's presence so the supervisor does not feel compelled to brief the agent on provisioning auth; whether this is a new row in Step 3, a sentence in Step 4, or both is a design choice. |
| Determinism property | Whatever mechanism the design picks for persona selection must be a pure function of the workflow's `workflow_dispatch` inputs (`product`, `job`, `task-amend`) and the state of `main` at run time. No wall-clock time, no `github.run_id`, no random seed read from the runner. The substrate itself (the seeded `organization_people` rows) is already deterministic given `main` because [`data/synthetic/story.dsl`](../../data/synthetic/story.dsl) carries a hardcoded `seed`. |
| Secret handling in logs | `LANDMARK_AUTH_TOKEN`, `SUPABASE_JWT_SECRET`, and `SUPABASE_SERVICE_ROLE_KEY` must not appear in plain text in any line of the workflow's downloadable run logs. The substrate prep must use GitHub Actions' `::add-mask::` plumbing (already produced by `scripts/env-setup.js --add-mask --output`, added in PR #933) for every secret it generates, and apply the same masking to any JWT it mints itself before either logs or step outputs see it. |
| Failure surfacing | If any substrate step fails — synthetic content cannot be ingested, JWT mint fails, the persona corpus is empty after prep — the workflow exits non-zero on the workspace-prep step. The agent step is never invoked against a half-built substrate. The check is a CI assertion in the workflow itself, not a manual confirmation. |
| Privacy of substrate data | The synthetic content shipped at [`data/synthetic/story.dsl`](../../data/synthetic/story.dsl) declares `domain "bionova.example"` under the IETF-reserved `.example` TLD, which RFC 2606 reserves for documentation; the corresponding email and handle generators emit values under that domain. This spec does not change the synthetic content. The substrate-prep step must not introduce any persona-shaped data sourced outside the synthetic content. |
| Wall-clock budget | The workspace-prep step extension introduced by this spec must complete within the time budget the existing interview workflow can absorb without crossing the concurrency-group's ceiling. The design picks a concrete budget (a single integer of seconds, or "p95 below X") and an enforcement seam (a step timeout, a recorded duration, or both); the spec commits only that such a budget exists and is checked in CI. |

### Out of scope, deferred

- **Changes to `fit-landmark` itself.** No new flag, no offline mode, no
  fixture-backed query layer, no change to `resolveIdentity()` or to the
  `needsSupabase` map. Spec 950's proposal is superseded by this spec,
  not partially carried forward.
- **Substrate for non-Landmark products in v1.** Pathway and Guide
  operate from local files and do not need the substrate. Map's CLI
  uses the service-role key, not `LANDMARK_AUTH_TOKEN`, so its
  interview path is different. Summit, Outpost, and future products
  may need substrate extensions in later specs; v1 commits to Landmark
  only.
- **Substrate for other CI workflows.** `eval-kata.yml`,
  `agent-team.yml`, `kata-storyboard.yml`, and `kata-coaching.yml` do
  not run product-against-persona interviews. If a future workflow
  needs the same substrate, it can reuse whatever surface this spec
  produces; v1 changes only `kata-interview.yml`.
- **Hosted Supabase as a substrate.** Substrate is local-only. Pointing
  `kata-interview` at a hosted project carries different privacy
  considerations and is a separate spec.
- **Per-roster identity provisioning.** Only the persona chosen for the
  run needs identity. Provisioning every `human` row into `auth.users`
  may fall out of whatever design path the substrate picks, but is not
  required.
- **Service-account identities for the supervisor.** The
  `service_account` discriminator added in PR #927 is reserved for
  unattended agents the substrate may need to mint for itself; the
  supervisor agent does not call Landmark in v1.
- **Changing the synthetic content.** The substrate consumes whatever
  `bunx fit-terrain build` produces today. Adding personas, regenerating
  the story DSL, or extending `data/synthetic/` is a separate spec.
- **Caching the substrate across runs.** Each interview builds the
  substrate fresh. Caching the Docker stack, the seeded database, or
  any JWT across runs is a performance optimization the wall-clock
  budget may motivate but this spec does not require.
- **Replacing the `kata-interview` skill's interview protocol.** The
  two-Ask handoff, persona file, JTBD classification, and
  finding-capture steps are unchanged. This spec changes only what the
  agent's environment carries when the supervisor writes `CLAUDE.md`,
  and the one row in the staging table that documents it.

## Success Criteria

| Claim | Verification |
|---|---|
| `LANDMARK_AUTH_TOKEN` is present in the agent's environment. | A CI assertion step inserted by this spec's implementation, placed after the workspace-prep step and before the agent-start step, reads the prepared agent environment and exits non-zero if `LANDMARK_AUTH_TOKEN` is empty. |
| `LANDMARK_AUTH_TOKEN` is a Supabase-shaped JWT for the chosen persona. | The same assertion step parses the JWT's payload segment, exits non-zero unless the claims set carries `aud: "authenticated"`, `role: "authenticated"`, an `email` claim matching the chosen persona's address, and an `exp` claim strictly greater than the assertion's wall-clock time. |
| The chosen persona is a `human` row from the seeded substrate. | The assertion step queries the seeded `organization_people` table for a row whose `email` matches the JWT's `email` claim and whose `kind` is `human`, exits non-zero on no match. |
| Every gated Landmark command is invocable. | A CI smoke-test step, inserted by this spec's implementation between workspace prep and agent start, invokes every `commands`-array entry in [`fit-landmark.js`](../../products/landmark/bin/fit-landmark.js) whose handler is `needsSupabase: true`, supplying required options from the discovery vector defined in scope, and exits non-zero if any invocation exits non-zero. |
| Three row-class smokes return non-empty payloads. | The same CI smoke-test step parses `--format json` output for one roster-driven command (`org show`), one snapshot-driven command (a `snapshot` subcommand of the design's choice), one evidence-driven command (`evidence`), and one practice-driven command (`practice`), and exits non-zero unless each top-level row collection is non-empty for the chosen persona. The four commands span the four query modules under [`products/landmark/src/commands/`](../../products/landmark/src/commands/) that read distinct row classes. |
| Persona selection is a pure function of workflow inputs and `main`. | A test (CI or unit) constructs two simulated runs with identical (`product`, `job`, `task-amend`) inputs against the same `main` SHA, runs persona selection in both, and asserts identical persona email. The test uses no wall-clock, no `github.run_id`, and no randomness sourced from the runner. |
| Substrate failures fail the workflow before the agent starts. | A negative test, runnable from `workflow_dispatch` (or from a make-target the implementation provides), forces the substrate prep into a failure mode (the design picks which mode; "empty persona corpus" is the simplest) and asserts that the workflow exits non-zero on the workspace-prep step with the agent-start step skipped. |
| Sensitive values are absent from run logs. | A CI step that runs after the assertion step downloads (or reads inline) the workflow's step output for the workspace-prep step, greps for the literal `LANDMARK_AUTH_TOKEN`, `SUPABASE_JWT_SECRET`, and `SUPABASE_SERVICE_ROLE_KEY` values captured by the assertion step, and exits non-zero if any value appears unmasked. The assertion step captures values into masked outputs only. |
| The `kata-interview` skill reflects the substrate. | A check in the implementation PR (an assertion in the diff, or a reviewer-visible note in the PR description) confirms that [`SKILL.md`](../../.claude/skills/kata-interview/SKILL.md) Step 3's staging row for Landmark mentions the substrate explicitly and Step 4 carries no instruction to brief the agent on provisioning authentication. |
| `fit-landmark`, `fit-map`, `libconfig`, `libsecret`, and the activity migrations are unchanged. | `git diff --stat origin/main...HEAD` on the implementation branch shows zero lines changed under `products/landmark/src/`, `products/landmark/bin/`, `products/map/src/`, `products/map/bin/`, `products/map/supabase/migrations/`, `libraries/libconfig/src/`, `libraries/libsecret/src/`, and `data/synthetic/`. Test files under those paths may change to cover the substrate's new behaviors. |
| Wall-clock budget is respected. | The workflow records the duration of the workspace-prep step in step-summary output. A second CI step compares the recorded duration to the budget the design picks and exits non-zero if exceeded. The threshold is documented in the implementation PR description. |
