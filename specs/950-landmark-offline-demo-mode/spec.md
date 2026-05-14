# Spec 950 — Landmark Offline/Demo Mode for Team-Level Commands

## Problem

Landmark's product positioning is an exact match for the *Measure Engineering
Outcomes* job — "demonstrate engineering progress without making individuals
feel surveilled" (Big Hire) and "tell whether culture investments are working
before the next budget cycle" (Little Hire). The
[Landmark for Leaders getting-started page](../../websites/fit/docs/getting-started/leaders/landmark/index.md)
opens with `npx fit-landmark org show`, `npx fit-landmark org team`, and
`npx fit-landmark marker <skill>` as the first three commands a leader runs.
The published `fit-landmark` package on npm installs cleanly and runs
`marker <skill>` end-to-end against local YAML.

Every other command fails immediately with `Authentication required:
LANDMARK_AUTH_TOKEN is not set` before any data path is consulted. A leader
evaluating the tool cannot see the workflow's output shape without first
standing up the Map activity layer (Supabase CLI + `fit-map activity
start/migrate/seed` + GitHub webhook ingestion + GetDX sync + auth user
provisioning + JWT minting). The cost of that activation is unbounded relative
to the persona's evaluation horizon — a quarterly review two weeks out followed
by budget season — and requires IT involvement at most organizations. The
global `--data` flag, documented as "Path to Map data directory" and honored
end-to-end by `marker`, has no effect on the analytical commands: every one of
them is auth-walled before the data path is even consulted by the downstream
loader.

A BioNova Platform Engineering Manager (J080 persona) exercised the tool in
user testing on issue [#921](https://github.com/forwardimpact/monorepo/issues/921)
and reported the gap verbatim:

> The persona has a complete activity dump on the laptop (`./data/activity/`
> — GetDX snapshots Q3 2024 → Q1 2026, comments, GitHub events, initiatives,
> roster) and would have been able to produce the team-level trend table in
> seconds if `--data` had been an honored offline mode. … The activation cost
> is unbounded relative to the persona's two-week horizon and requires IT
> involvement. Net result: the tool's positioning is perfect for the JTBD but
> the activation step disqualifies it before any value is felt.

The persona's diagnosis matches the code. The `COMMANDS` map in
`products/landmark/bin/fit-landmark.js` marks eleven of twelve commands
`needsSupabase: true`. `resolveIdentity()` is called before `buildContext()` and
before `--data` is consulted by `loadMapData()` — so the auth gate fires even
when the caller supplies a complete Map data directory and wants only to see
what the workflow would look like. `marker` is the sole `needsSupabase: false`
command, which matches the persona's report that `marker` worked end-to-end
while every other command did not.

The eleven gated commands are `org`, `snapshot`, `evidence`, `readiness`,
`timeline`, `coverage`, `practice`, `practiced`, `health`, `voice`, and
`sources`. These eleven — referred to throughout this spec as the *gated
commands* — are the surface this spec opens to offline invocation. `marker`
already runs offline today; this spec does not change `marker`'s behavior.

The downstream effect is that the JTBD's **Fired When** force ("metrics get
used punitively; or leadership turnover deprioritizes measurement") and the
**Anxiety** force ("measurement feels like surveillance regardless of intent")
both activate before the leader has any chance to evaluate whether Landmark
delivers on the **Pull** ("system-level trends that show direction without
naming individuals"). The **Competes With** alternatives — sprint velocity,
ticket counts, asking managers "how's the team doing?", not measuring — hold
their appeal because the persona never reaches a Landmark output that would
displace them. The persona's own retreat path (constructing the trend table
manually from the raw GetDX dump) is the precise behavior the product copy
promises to dissolve.

The blast radius is the Little Hire on *Measure Engineering Outcomes* —
"tell whether culture investments are working before the next budget cycle" —
for any leader whose evaluation horizon is shorter than the Map activity-layer
stand-up timeline. The adjacent Big Hire ("demonstrate engineering progress
without making individuals feel surveilled") is delivered today by the
authenticated production pipeline for organizations that have already adopted
Map; this spec closes the funnel that gets new evaluators into a position to
see those outputs before they commit to the stand-up cost. Single-org
installations already running Map's activity layer with provisioned auth are
not affected by this change in their current workflow.

## Personas and Job

The hire is **Engineering Leaders** against the *Measure Engineering Outcomes*
job (see [JTBD.md](../../JTBD.md), under the
`<job user="Engineering Leaders" goal="Measure Engineering Outcomes">` entry).
Both hires apply at different stages of the funnel:

- The **Little Hire** — "tell whether culture investments are working before
  the next budget cycle" — names the evaluation-horizon outcome this spec
  delivers. A leader who can see the output shape inside an afternoon, before
  the budget meeting, is in a position to decide whether to commit to the
  full stand-up.
- The **Big Hire** — "demonstrate engineering progress without making
  individuals feel surveilled" — is the long-arc outcome this spec keeps
  reachable. A leader who never sees a single Landmark output, because
  activation gated them out, never reaches the Big Hire either.

The job's **Trigger** ("quarterly review is due and the only data is ticket
counts") is the exact context the persona is in when they install the
package. The downstream observable is the rendered output of the eleven gated
commands running against fixture or caller-supplied data — text the leader
can read, screenshot, share with peers, or take into the budget conversation,
*before* the organization has stood up Supabase.

## Scope

### In scope

| Component | What changes |
|---|---|
| Offline-mode invocation surface | A single, named CLI flag (the exact name is a design choice) enables offline mode. Whether the same mode can also be opted into via an environment variable is a design choice; if it can, the env-var name is also a design choice. There is one invocation surface (flag or flag-plus-env), not two competing flags. The surface is discoverable from `fit-landmark --help`. |
| Coverage across the eleven gated commands | Offline mode applies to every command listed in the Problem section above: `org`, `snapshot`, `evidence`, `readiness`, `timeline`, `coverage`, `practice`, `practiced`, `health`, `voice`, `sources`. Each command's offline output is shape-identical to its authenticated output — same columns, same headings, same `--format text\|json\|markdown` behavior — and is distinguishable as offline output via a documented marker (banner, header line, or footer — design choice) that names the data source. `marker` is unchanged. |
| Authentication-gate placement | When offline mode is requested, `resolveIdentity()` is not called and `LANDMARK_AUTH_TOKEN` is neither read nor referenced. When offline mode is not requested and the command is `needsSupabase: true`, the existing identity gate fires exactly as today, with the existing `IdentityUnresolvedError` class and exit code 4. No third path. |
| Network-egress invariant | Under offline mode, no Supabase client is constructed, no HTTP request is issued to any host derived from `MAP_SUPABASE_URL` or `MAP_SUPABASE_ANON_KEY`, and the values of those environment variables are not read. |
| Privacy and accident-prevention | The mode cannot be silently activated by environment alone — at minimum one explicit, named indicator must be present in the invocation. When the indicator is absent the production auth gate fires as today. The offline path neither reads nor validates `LANDMARK_AUTH_TOKEN`; passing both the offline indicator and `LANDMARK_AUTH_TOKEN` either errors with a documented message or is silently ignored (design choice, but the design must pick one and document it). The marker that distinguishes offline output names the data source plainly enough that a leader pasting output into a peer message does not accidentally represent fixture numbers as their organization's numbers. |
| Authenticated-path baseline | Before this spec's implementation lands, captured output samples of every gated command on `main` — across at least one representative invocation per command and across all three `--format` values — are checked into the repository as a baseline-fixture set under `products/landmark/test/baselines/` (exact directory layout is a design choice). The baseline-capture commit is part of this spec's implementation, not a separate spec. |
| Fixture provenance | The package ships at least one demo dataset that exercises every gated command without errors and renders non-empty output for the three first-on-the-getting-started-page commands a leader runs (`org show`, `org team`, the persona's first analytical command beyond `marker` — `snapshot list` or `practice` per the [Landmark for Leaders guide](../../websites/fit/docs/getting-started/leaders/landmark/index.md); design picks one). The dataset is small enough to ship inside the npm package without bloating it (specific size budget is a design choice). The shape of the dataset on disk — single bundled JSON, multiple YAML files, `./data/`-like directory tree, in-repo constants — is a design choice. The dataset's roster contains only email addresses at the IETF reserved domains `example.com`, `example.org`, or `example.net`, and the dataset's GitHub-like handles are drawn from a documented reserved namespace declared in this spec (handles begin with `demo-` and contain only `[a-z0-9-]` characters). |
| Caller-supplied data path | A leader who already has an activity dump on disk (the BioNova persona's `./data/activity/` case) can point the offline mode at their own files and see the eleven gated commands' output computed against their data. The path-shape contract for those files — what filenames are accepted, what JSON/CSV schemas they conform to, how the loader binds them to the eleven commands — is a design choice. Caller-supplied data and shipped-fixture data are independent paths; a single invocation reads from one source, not a mix. |
| Documentation | The [Landmark for Leaders getting-started guide](../../websites/fit/docs/getting-started/leaders/landmark/index.md) gains a section showing how to run the eleven gated commands in offline mode without first standing up the Map activity layer, placed before the "Prerequisites" block so a reader who cannot yet meet the prerequisites has a path forward. The [Demonstrate Engineering Progress guide](../../websites/fit/docs/products/engineering-outcomes/index.md) carries an entry pointing leaders to the offline-mode section as the recommended first step before activation. The `fit-landmark <command> --help` text and the `fit-landmark` skill ([`.claude/skills/fit-landmark/SKILL.md`](../../.claude/skills/fit-landmark/SKILL.md)) carry the fully-qualified `https://www.forwardimpact.team/docs/getting-started/leaders/landmark/index.md` URL per [products/CLAUDE.md § Linking rule](../../products/CLAUDE.md). |

### Out of scope, deferred

- **Synthetic-data generation in-product.** v1 ships static fixture(s). A
  subcommand that generates synthetic activity for an org of N people over
  M weeks is a separate spec; v1 does not pick or depend on any generator.
- **Write-mode offline.** Commands that today write to Supabase (none in
  Landmark; all writes are in Map's activity-ingestion layer) remain
  authenticated. Offline mode is read-only by construction.
- **`--data` deprecation or renaming.** The existing `--data` global option
  continues to behave as it does today for the `marker` command. Whether the
  offline mode reuses `--data`, introduces a new flag, or both is a design
  choice. Removing or repurposing `--data` is out of scope.
- **Cross-product offline mode.** Other product CLIs (Map, Pathway, Guide,
  Summit, Outpost) have their own auth and data postures. This spec changes
  only `fit-landmark`. Whether a unified offline mode across products makes
  sense is a separate question for a future spec.
- **Demo mode for the production-data path.** A leader who *has* stood up
  Supabase and wants to render Landmark output without contacting it (for
  example, a flaky-network demo at a conference) is not the primary use
  case here. If the offline mode happens to serve that case as a side
  effect, fine; designing for it is not in v1.
- **Multi-tenant fixtures.** v1 ships one or a small fixed number of
  fixture datasets. A registry of fixtures the leader can switch between by
  flag, or community-contributed fixture packs, is a separate spec.
- **Performance budget for fixture loads.** The eleven commands run
  end-to-end in offline mode; whether they run in 100 ms or 2 s on the
  shipped fixture is not constrained by this spec.
- **Replacing or simplifying the authenticated path.** The Map activity
  layer, the Supabase Auth JWT flow, and the `LANDMARK_AUTH_TOKEN`
  contract remain unchanged. v1 is a parallel offline lane, not a
  refactor of the authenticated lane.
- **Telemetry separation.** Landmark today emits only structured logs via
  `libtelemetry`'s `createLogger`; there is no usage/run-counting stream to
  separate. v1 adds no new usage-telemetry stream. If a usage stream is
  introduced in a future spec, that spec is responsible for distinguishing
  offline from authenticated invocations.

## Success Criteria

| Claim | Verification |
|---|---|
| Every gated command runs to non-error completion in offline mode. | Test: for each of the eleven gated commands, invoking the command in offline mode against the shipped fixture exits 0 and writes non-empty output to stdout. The invocation uses the offline indicator and no other data source (`LANDMARK_AUTH_TOKEN` unset; `MAP_SUPABASE_URL` and `MAP_SUPABASE_ANON_KEY` unset; no caller-supplied data path). |
| Offline mode does not require `LANDMARK_AUTH_TOKEN`. | Test: with `LANDMARK_AUTH_TOKEN` unset, every gated command in offline mode against the shipped fixture exits 0. The same invocations without the offline indicator exit non-zero with the existing `IdentityUnresolvedError` message and exit code 4. |
| Offline mode contacts no network. | Test: under offline mode, no Supabase client is constructed and no outbound socket is opened during command execution. Mechanism for asserting the no-socket property is a design choice; the observable property is what this criterion locks in. |
| Authenticated-path behavior is unchanged. | Test: for each gated command, without the offline indicator, command output is byte-identical to the corresponding baseline fixture under `products/landmark/test/baselines/` captured before this change shipped, across all three `--format` values. |
| Offline output is distinguishable from authenticated output. | Test: every gated command in offline mode emits a documented marker (banner, header line, or footer — design choice) that names the data source. The marker is present across all three `--format` values in a form appropriate to each. The marker text is documented in the offline-mode section of the getting-started guide. |
| Caller-supplied data renders. | Test: pointing the offline mode at a caller-supplied directory whose contents match the documented path-shape contract renders gated-command output computed against those files, distinct from output computed against the shipped fixture, for at least the `org show` and `snapshot list` commands. |
| The shipped fixture is privacy-safe by construction. | Test: a checked-in test reads the shipped fixture and asserts that every email address ends in `@example.com`, `@example.org`, or `@example.net` and that every GitHub-like handle matches `^demo-[a-z0-9-]+$`. A documented banner names the fixture data as fictional in every gated command's offline output. |
| `--help` discoverability holds. | Test: `npx fit-landmark --help` mentions offline mode by the name documented in the offline-mode section of the getting-started guide, and at least one per-command `--help` page (one of the three first-on-the-getting-started-page commands) names the mode in its options or examples block. |
| Documentation is in place. | Test: the [Landmark for Leaders getting-started guide](../../websites/fit/docs/getting-started/leaders/landmark/index.md) carries a section showing the offline-mode invocation, placed before the "Prerequisites" block. The [Demonstrate Engineering Progress guide](../../websites/fit/docs/products/engineering-outcomes/index.md) carries an entry pointing to the offline-mode section. The `fit-landmark` skill and CLI both link the getting-started guide URL per the repo's linking rule, with byte-identical entries in the skill's `## Documentation` list and the CLI's `documentation` array. |
| No new usage telemetry is introduced. | Test: the implementation diff introduces no new imports of `@forwardimpact/libtelemetry` symbols other than `createLogger`, and no new code paths that record run counts, command names, or invocation flags to a destination other than `console`/`stderr` via the existing logger. |
