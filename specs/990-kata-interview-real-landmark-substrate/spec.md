# Spec 990 — Real-Landmark Substrate for `kata-interview` Runs

Supersedes spec 950. This spec moves the work into the interview
workspace prep rather than the production CLI.

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
`kata-interview` runs across two JTBDs. The first run is in the issue
body; the second and third are in the issue comments. Each persona's
email is at the synthetic organization's domain `bionova.example` under
the IETF-reserved `.example` TLD ([RFC
2606](https://datatracker.ietf.org/doc/html/rfc2606)):

> **Run 1** (issue body): BioNova Platform Engineering Manager
> (`athena@bionova.example`) preparing a quarterly VP review under the
> *Engineering Leaders → Measure Engineering Outcomes* job. Every
> team-level command failed before any data path was read.

> **Run 2** (issue comment): BioNova SWE (`antiope@bionova.example`)
> under the *Empowered Engineers → Find Growth Areas* job. Every activity
> command — `readiness`, `evidence`, `timeline`, `coverage`, `sources` —
> failed identically.

> **Run 3** (issue comment): BioNova Director (`zeus@bionova.example`)
> under *Measure Engineering Outcomes* again. Reported as "third
> recurrence". The persona's workaround was 25 lines of `jsonwebtoken`
> HS256 signing code against `.env`; this workaround is now obsolete
> because PR #927 ships
> [`fit-map auth issue`](../../products/map/src/commands/auth-issue.js)
> for that purpose, but the workflow does not invoke it.

Three runs, three personas, two JTBDs, one stuck pattern. None of the
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
[Evaluate and Improve Agents](../../JTBD.md)*, whose Big Hire and Little
Hire both route to **Gear**, not to interview infrastructure or to
Landmark. This spec acknowledges that gap and grounds itself in the two
downstream JTBDs whose evidence stream the interview produces:

- *Engineering Leaders → Measure Engineering Outcomes* (Big Hire
  "demonstrate engineering progress without making individuals feel
  surveilled", Little Hire "tell whether culture investments are working
  before the next budget cycle" — both routed to **Landmark**). Run 1 and
  Run 3 are this job.
- *Empowered Engineers → Find Growth Areas* (Big Hire and Little Hire
  both routed to **Guide, Landmark**). Run 2 is this job.

After this spec lands, an interview run against either job surfaces real
product gaps in Landmark rather than CI-substrate gaps. The **Anxiety**
force on *Measure Engineering Outcomes* ("measurement feels like
surveillance regardless of intent") may fire more sharply once personas
reach real Landmark output; today that force fires anyway, for the wrong
reason, when authentication itself feels like the gauntlet.

## Scope

### In scope

| Component | What changes |
|---|---|
| Workspace state after prep | After the workflow's workspace prep completes for a Landmark-targeted interview, the agent process is started with `LANDMARK_AUTH_TOKEN` set in its environment to a Supabase-shaped JWT that names a `human`-kind persona present in the seeded `organization_people` table. The mechanism by which the JWT lands in the agent's `env:` is a design choice. |
| Product gating | Substrate prep runs when the chosen product is **Landmark**. Whether it also runs for other products is a design choice; the spec commits only to Landmark coverage in v1. For products the substrate does not run for, the workflow's observable behavior (the `Run interview` step's `env:`, the agent's CWD contents, the workspace prep step's exit code) is unchanged from `main`. |
| Persona corpus | The set of personas the substrate-prep can choose from is the set of `human`-kind people seeded into `organization_people`. The seeding flows from the synthetic content under [`data/synthetic/`](../../data/synthetic/) through whatever ingestion path the design picks. The corpus must contain at least one persona for whom the substrate also seeds at least one direct report (so commands taking `--manager <email>` resolve to ≥1 row), at least one organization snapshot (so commands taking `--snapshot <id>` resolve), and at least one driver/item id (so commands taking `--item <id>` resolve). |
| Discovery vector | The substrate must expose, to the agent before the first gated-command invocation, every value the agent needs to satisfy options that gated-command handlers enforce as required at runtime (each command throws when the value is absent — see `products/landmark/src/commands/*.js`). Those values are: the persona's own email, a manager email, a snapshot id, and an item id, each drawn from the seeded substrate. Encoding (a single JSON file at a known path in `$AGENT_CWD`, separate env vars per value, a row in the agent's `CLAUDE.md`, or another shape that satisfies the persona-file invariant below) is a design choice. |
| Gated-command coverage | Every command whose entry in the `COMMANDS` map at [`products/landmark/bin/fit-landmark.js`](../../products/landmark/bin/fit-landmark.js) carries `needsSupabase: true` — `org`, `snapshot`, `evidence`, `readiness`, `timeline`, `coverage`, `practice`, `practiced`, `health`, `voice`, `sources` — must be invocable to non-error completion against the seeded substrate using the persona's identity plus the discovery vector. The user-visible subcommands declared in the libcli `commands` array (`org show`, `org team`, the four `snapshot` subcommands) inherit that coverage. `marker`, `login`, and `logout` are excluded; their `needsSupabase` is `false`. |
| Persona-file invariant amendment | The `kata-interview` skill today carries two related rules: Step 4 forbids product names in the supervisor-written `$AGENT_CWD/CLAUDE.md`, and the read-do checklist at [SKILL.md](../../.claude/skills/kata-interview/SKILL.md) item 41 reads "No product names anywhere agent-visible". Because `fit-landmark` reads `LANDMARK_AUTH_TOKEN` by name from `process.env`, the second rule cannot hold for Landmark interviews. This spec amends the second rule to "No product names in the persona file or in supervisor-authored Ask templates"; product-named environment variables required by the production CLI are permitted in the agent's environment. The first rule (no product names in `CLAUDE.md`) is unchanged. |
| Kata-interview skill alignment | The [`kata-interview` skill](../../.claude/skills/kata-interview/SKILL.md) is updated so the Step 3 staging table's row for Landmark documents that the substrate (identity + discovery vector) is staged automatically, and so the read-do checklist carries the amended wording above. Step 4's "Excluded" list and its `CLAUDE.md`-only invariant are unchanged. |
| Secret handling in logs | The literal values of `LANDMARK_AUTH_TOKEN`, `SUPABASE_JWT_SECRET`, and `SUPABASE_SERVICE_ROLE_KEY` must not appear unmasked in any line of the workflow's downloadable run logs. The masking mechanism is a design choice. |
| Failure surfacing | If any substrate step fails — the local Supabase stack does not come up, the synthetic content cannot be ingested, the JWT cannot be minted, or the persona corpus is empty after prep — the workflow exits non-zero on the workspace-prep step. The agent step is never invoked against a half-built substrate. The check is a CI assertion in the workflow itself; manual confirmation in a PR description does not satisfy this row. |
| Privacy of substrate data | The substrate-prep step must not introduce any persona-shaped data sourced outside the synthetic content shipped at [`data/synthetic/`](../../data/synthetic/). That content already declares `domain "bionova.example"` under the IETF-reserved `.example` TLD, so persona emails and handles are reserved by construction. |

### Out of scope, deferred

- **Changes to `fit-landmark` itself.** No new flag, no offline mode, no
  fixture-backed query layer, no change to `resolveIdentity()` or to the
  `needsSupabase` map. Spec 950's proposal is superseded, not partially
  carried forward.
- **Deterministic persona selection across runs.** Whether two runs with
  identical inputs select the same persona is left open. Persona
  selection today happens inside the supervisor agent's LLM call (Step 4
  of `kata-interview`); making that call deterministic is a larger
  refactor than this spec's primary aim.
- **Substrate for non-Landmark products in v1.** Pathway and Guide
  operate from local files and do not need the substrate. Map's CLI
  uses the service-role key, not `LANDMARK_AUTH_TOKEN`. Summit, Outpost,
  and future products may need substrate extensions in later specs.
- **Substrate for other CI workflows.** Only `kata-interview.yml` is
  in scope.
- **Hosted Supabase as a substrate.** Substrate is local-only.
- **Per-roster identity provisioning.** Only the persona chosen for the
  run needs identity, though the design may provision more as a side
  effect.
- **Service-account identities for the supervisor.** The supervisor
  agent does not call Landmark in v1.
- **Changing the synthetic content.** The substrate consumes whatever
  `bunx fit-terrain build` produces today.
- **Caching the substrate across runs.** Each interview builds the
  substrate fresh.
- **Wall-clock budget for substrate prep.** The implementation PR
  records the observed duration. Whether to gate on a numeric ceiling
  is a follow-up spec if the recorded duration becomes a problem.
- **Replacing the `kata-interview` skill's interview protocol.** The
  two-Ask handoff, persona file (`CLAUDE.md`), JTBD classification, and
  finding-capture steps are unchanged. This spec changes only the
  workspace state the agent starts with, the staging table, and the
  one read-do-checklist line above.

## Success Criteria

| Claim | Verification |
|---|---|
| `LANDMARK_AUTH_TOKEN` is present in the agent's environment. | A CI assertion step added by this spec's implementation, placed in [`.github/workflows/kata-interview.yml`](../../.github/workflows/kata-interview.yml) after the workspace-prep step and before the `Run interview` step, exits non-zero if `LANDMARK_AUTH_TOKEN` is empty in the agent's prepared environment. |
| `LANDMARK_AUTH_TOKEN` is a Supabase-shaped JWT for the chosen persona. | The same assertion step parses the JWT's payload segment and exits non-zero unless the claims set carries `aud: "authenticated"`, `role: "authenticated"`, an `email` claim, and an `exp` claim strictly greater than the assertion's wall-clock time. |
| The chosen persona is a `human` row from the seeded substrate. | The same assertion step queries the seeded `organization_people` table for a row whose `email` matches the JWT's `email` claim and whose `kind` is `human`, exits non-zero on no match. |
| The discovery vector is present and resolvable. | The same assertion step reads the four discovery values (persona email, manager email, snapshot id, item id) from the encoding the design picks and queries the seeded substrate to confirm each value resolves to ≥1 row in the table it targets. |
| Every gated Landmark command is invocable. | A CI smoke-test step added by this spec's implementation iterates the `COMMANDS` map at [`products/landmark/bin/fit-landmark.js`](../../products/landmark/bin/fit-landmark.js), filters to entries with `needsSupabase: true`, expands each into its user-visible subcommands via the libcli `commands` array in the same file, invokes each subcommand in the prepared agent environment with options drawn from the discovery vector, and exits non-zero if any invocation exits non-zero. |
| Three named row-class smokes return non-empty payloads for the chosen persona. | The same CI smoke-test step parses `--format json` output for three specific commands — `org team --manager <persona-email>` (roster-driven), `evidence --email <persona-email>` (evidence-driven), and `practice --manager <persona-email>` (practice-driven) — and exits non-zero unless each top-level row collection is non-empty for the chosen persona. |
| Substrate failures fail the workflow before the agent starts. | A test that runs as part of the implementation PR's verification (a CI workflow_dispatch with an input flag, or a local make-target the implementation provides) forces an empty persona corpus after substrate prep and asserts that the workflow exits non-zero on the workspace-prep step with the agent-start step skipped. |
| Sensitive values are absent from run logs. | A CI step after the assertion step downloads (or reads inline) the workspace-prep step's recorded output and exits non-zero if the literal *value* (not the variable name) of `LANDMARK_AUTH_TOKEN`, `SUPABASE_JWT_SECRET`, or `SUPABASE_SERVICE_ROLE_KEY` appears in any line. The values are captured by the assertion step into masked workflow outputs only. |
| Non-Landmark interviews are not regressed. | For each non-Landmark product the workflow can target (Pathway, Guide, Outpost, Summit, Map), `git diff --stat origin/main...HEAD` on the implementation branch shows zero lines changed in the workflow's `steps[*].run` blocks reachable when that product is the chosen `product`, *or* the diff is gated behind a `product == 'landmark'` predicate in YAML. The verifier reads the resulting YAML and confirms the gating predicate. |
| The `kata-interview` skill reflects the substrate. | A grep over the implementation diff against [`.claude/skills/kata-interview/SKILL.md`](../../.claude/skills/kata-interview/SKILL.md) confirms (a) the Step 3 staging table row for Landmark now mentions the substrate explicitly, (b) the read-do-checklist item that reads "No product names anywhere agent-visible" is replaced with "No product names in the persona file or in supervisor-authored Ask templates", and (c) Step 4's `CLAUDE.md`-exclusion list is unchanged. |
| `fit-landmark`, the activity migrations, and the synthetic content are unchanged. | `git diff --stat origin/main...HEAD` on the implementation branch shows zero lines changed under `products/landmark/src/`, `products/landmark/bin/`, `products/map/supabase/migrations/`, `libraries/libconfig/src/`, `libraries/libsecret/src/`, and `data/synthetic/`. Changes under `products/map/src/` and `products/map/bin/` are permitted only if they do not modify existing handlers' contracts (additions and helper extractions allowed; signature or behavior changes to `runAuthIssueCommand`, `runProvisionCommand`, or `activity.start/stop/status/migrate/transform/seed/verify` are not). |
