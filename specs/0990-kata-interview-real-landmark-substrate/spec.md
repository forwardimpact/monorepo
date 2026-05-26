# Spec 0990 — Real-Landmark Substrate for `kata-interview` Runs

Supersedes spec 0950. This spec moves the work into the interview
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

The substrate that closes this gap is already on `main`. Spec 0960
([PR #933](https://github.com/forwardimpact/monorepo/pull/933)) consolidated
Supabase credentials behind a single bootstrap script and typed
[`libconfig`](../../libraries/libconfig/src/config.js) getters. Spec 0840
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
| Workspace state after prep | After the workflow's workspace prep completes for a Landmark-targeted interview, the agent process can resolve a Supabase-shaped JWT for the chosen persona — a `human`-kind row present in the seeded `organization_people` table — before the first gated-command invocation. The carrier env-var name, the storage path (`process.env`, libconfig `.env` → `#envOverrides`, or another mechanism), and the surface `resolveIdentity()` reads from are design choices. |
| Product gating | Substrate prep runs only when the chosen product is **Landmark**. For every other product the workflow can target (Pathway, Guide, Outpost, Summit, Map), the workflow's observable behavior — the `Run interview` step's `env:` map, the contents of the agent's CWD, the workspace-prep step's command list and exit code — is unchanged from `main`. Substrate work introduced by this spec lands behind a workflow-level conditional that evaluates to false for non-Landmark `product` inputs. |
| Persona corpus | The substrate-prep step selects a single persona (the *chosen persona*) from the `human`-kind people seeded into `organization_people`. The seeding flows from the synthetic content under [`data/synthetic/`](../../data/synthetic/) through whatever ingestion path the design picks. The chosen persona must, in the seeded substrate, (a) be the `manager_email` of at least one other `organization_people` row, so `org team --manager <persona-email>` returns a non-empty team payload (the recursive team includes the persona plus their reports); (b) match the filter `evidence --email <persona-email>` applies, returning ≥1 row, which today means the persona has authored at least one entry in the artifact source `evidence` joins against; and (c) match the filter `practice --manager <persona-email>` applies, returning ≥1 row, which today means the persona manages at least one person who has at least one practice-pattern-attributable row. The corpus must also carry at least one organization snapshot id and at least one driver/item id, both surfaced through the discovery vector below. Which specific synthetic personas satisfy these properties is a design choice. |
| Discovery vector | The substrate must expose, to the agent before the first gated-command invocation, every option value the agent needs to invoke any `needsSupabase: true` command whose handler throws when that value is absent at runtime. Those values are: the chosen persona's own email (consumed by `coverage`, `readiness`, `timeline`, `sources`, and either-or with `manager` for `voice`), a manager email (consumed by `org team` and `practiced`), a snapshot id (consumed by `snapshot show` and `snapshot compare`), and an item id (consumed by `snapshot trend`). Encoding (a single JSON file at a known path in `$AGENT_CWD`, separate env vars per value, a row in the agent's `CLAUDE.md`, or another shape that satisfies the *Persona-file invariant amendment* row below) is a design choice. |
| Gated-command coverage | Every command whose entry in the `COMMANDS` map at [`products/landmark/bin/fit-landmark.js`](../../products/landmark/bin/fit-landmark.js) carries `needsSupabase: true` — `org`, `snapshot`, `evidence`, `readiness`, `timeline`, `coverage`, `practice`, `practiced`, `health`, `voice`, `sources` — must be invocable to non-error completion against the seeded substrate using the persona's identity plus the discovery vector. The user-visible subcommands declared in the libcli `commands` array (`org show`, `org team`, the four `snapshot` subcommands) inherit that coverage. `marker`, `login`, and `logout` are excluded; their `needsSupabase` is `false`. |
| Persona-file invariant amendment | The `kata-interview` skill today carries two related rules: Step 4 forbids product names in the supervisor-written `$AGENT_CWD/CLAUDE.md`, and the read-do checklist line in [SKILL.md](../../.claude/skills/kata-interview/SKILL.md) currently reads "No product names anywhere agent-visible". Because the production CLI reads its JWT carrier by name, the second rule cannot hold for Landmark interviews. This spec amends the second rule to "No product names in the persona file or in supervisor-authored Ask templates; product-named environment variables required by the production CLI are permitted in the agent's environment." The first rule (no product names in `CLAUDE.md`) is unchanged. |
| Kata-interview skill alignment | The [`kata-interview` skill](../../.claude/skills/kata-interview/SKILL.md) is updated so the Step 3 staging table's row for Landmark documents that the substrate (identity + discovery vector) is staged automatically, and so the read-do checklist carries the amended wording above. Step 4's "Excluded" list and its `CLAUDE.md`-only invariant are unchanged. |
| Secret handling in logs | The literal value of the persona's JWT (under whatever carrier name the design chooses), `SUPABASE_JWT_SECRET`, and `SUPABASE_SERVICE_ROLE_KEY` must not appear unmasked in any line of the workflow's downloadable run logs. The masking mechanism is a design choice. |
| Failure surfacing | If any substrate step fails — the local Supabase stack does not come up, the synthetic content cannot be ingested, the JWT cannot be minted, or the persona corpus is empty after prep — the workflow exits non-zero on the workspace-prep step. The agent step is never invoked against a half-built substrate. The check is a CI assertion in the workflow itself; manual confirmation in a PR description does not satisfy this row. |
| Privacy of substrate data | The substrate-prep step must not introduce any persona-shaped data sourced outside the synthetic content shipped at [`data/synthetic/`](../../data/synthetic/). That content already declares `domain "bionova.example"` under the IETF-reserved `.example` TLD, so persona emails and handles are reserved by construction. |

### Out of scope, deferred

- **Changes to `fit-landmark` itself, beyond the JWT-carrier seam.** No
  new flag, no offline mode, no fixture-backed query layer, no change
  to the `needsSupabase` map. A design may relocate the JWT read inside
  `resolveIdentity()` (e.g., from `process.env` to a libconfig
  accessor) if doing so closes a layering anomaly the design names;
  the existing test suite spec § Success Criteria already enforces
  contract preservation. Spec 0950's proposal is superseded, not
  partially carried forward.
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
| The persona's JWT is resolvable by `resolveIdentity()` in the agent process. | A CI assertion added by this spec's implementation — placed such that workspace prep cannot complete without it passing — reads the surface the production CLI reads (whether `process.env`, a libconfig accessor, or another path the design picks) and exits non-zero if `resolveIdentity()` cannot return a valid identity. |
| The JWT is Supabase-shaped for the chosen persona. | The same assertion parses the JWT's payload segment and exits non-zero unless the claims set carries `aud: "authenticated"`, `role: "authenticated"`, an `email` claim, and an `exp` claim strictly greater than the assertion's wall-clock time. |
| The chosen persona is a `human` row from the seeded substrate. | The same assertion step queries the seeded `organization_people` table for a row whose `email` matches the JWT's `email` claim and whose `kind` is `human`, exits non-zero on no match. |
| The discovery vector is present and resolvable. | The same assertion step reads the four discovery values (persona email, manager email, snapshot id, item id) from the encoding the design picks and queries the seeded substrate to confirm each value resolves to ≥1 row in the table it targets. |
| Every gated Landmark command is invocable. | A CI smoke-test step added by this spec's implementation iterates the `COMMANDS` map at [`products/landmark/bin/fit-landmark.js`](../../products/landmark/bin/fit-landmark.js), filters to entries with `needsSupabase: true`, expands each into its user-visible subcommands via the libcli `commands` array in the same file, invokes each subcommand in the prepared agent environment with options drawn from the discovery vector, and exits non-zero if any invocation exits non-zero. |
| Three named row-class smokes return non-empty payloads scoped to the chosen persona. | The same CI smoke-test step parses `--format json` output for three specific commands — `org team --manager <persona-email>` (roster row class), `evidence --email <persona-email>` (evidence row class), and `practice --manager <persona-email>` (practice-pattern row class) — and exits non-zero unless each top-level row collection is non-empty. Each command's handler applies its own filter against the seeded substrate before returning rows; non-emptiness is therefore sufficient to demonstrate that the persona-scoped query matched. The corpus invariants in the Persona-corpus scope row are what make each smoke satisfiable. |
| Substrate failures fail the workflow before the agent starts. | A test that runs as part of the implementation PR's verification (a CI workflow_dispatch with an input flag, or a local make-target the implementation provides) forces an empty persona corpus after substrate prep and asserts that the workflow exits non-zero on the workspace-prep step with the agent-start step skipped. |
| Sensitive values are absent from run logs. | A CI step downloads the workflow's run logs for every step that executes after the assertion step is added, and exits non-zero if the literal *value* (not the variable name) of the persona's JWT (under whatever carrier name the design chooses), `SUPABASE_JWT_SECRET`, or `SUPABASE_SERVICE_ROLE_KEY` appears in any line. |
| Non-Landmark interviews are not regressed. | A CI step parses [`kata-interview.yml`](../../.github/workflows/kata-interview.yml) on the implementation branch and exits non-zero unless every step introduced by this spec's implementation carries a step-level `if:` predicate that evaluates to false when `inputs.product != 'landmark'`, and every key added to the `Run interview` step's `env:` map carries a value-level conditional expression (a `${{ inputs.product == 'landmark' && … || '' }}` ternary or equivalent) that evaluates to empty for non-Landmark inputs. The predicate's exact form, and the literal substring the parser anchors on, are design choices; the spec commits to "non-Landmark runs produce the same `env:` and the same executed step sequence as `main`". |
| The `kata-interview` skill reflects the substrate. | A CI step over the implementation diff against [`.claude/skills/kata-interview/SKILL.md`](../../.claude/skills/kata-interview/SKILL.md) confirms (a) the Step 3 staging table row for Landmark mentions the substrate in text the implementation chooses, (b) the read-do-checklist line that on `main` reads "No product names anywhere agent-visible" no longer matches that exact string and the file does contain a checklist line semantically equivalent to the amended wording in the *Persona-file invariant amendment* scope row above, and (c) Step 4's `CLAUDE.md`-exclusion list — the line on `main` that excludes "goal sentence, Big Hire, Little Hire, Fired-When, product name" — appears unchanged. |
| `fit-landmark`, the activity migrations, and the synthetic content are unchanged at the contract level. | `git diff --stat origin/main...HEAD` on the implementation branch shows zero lines changed under `products/map/supabase/migrations/`, `libraries/libsecret/src/`, and `data/synthetic/`. For `products/map/src/`, `products/map/bin/`, `products/landmark/src/`, `products/landmark/bin/`, and `libraries/libconfig/src/`, the diff is permitted but bounded: a second check confirms the implementation branch passes the test suites the corresponding handlers carry on `main` — `bun test products/map/test/activity/auth-issue.test.js`, `products/map/test/activity/people-provision.test.js`, `products/map/test/activity/activity.test.js`, plus `bun test products/landmark/test/lib/identity.test.js` and `bun test libraries/libconfig/test/`. Additions and helper extractions are permitted; contract preservation is enforced by the existing test suite, not by `--stat`. |
