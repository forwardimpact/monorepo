# Spec 0950 — Landmark Offline/Demo Mode for Team-Level Commands

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
LANDMARK_AUTH_TOKEN is not set` before any data is read from the resolved
path. A leader evaluating the tool cannot see the workflow's output shape
without first standing up the Map activity layer (Supabase CLI + `fit-map
activity start/migrate/seed` + GitHub webhook ingestion + GetDX sync + auth
user provisioning + JWT minting). The cost of that activation is unbounded
relative to the persona's evaluation horizon — a quarterly review two weeks
out followed by budget season — and requires IT involvement at most
organizations. The global `--data` flag, documented as "Path to Map data
directory" and honored end-to-end by `marker`, has no effect on the
analytical commands: every one of them is auth-walled before `loadMapData()`
reads from the resolved path.

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
`products/landmark/bin/fit-landmark.js` marks every command except `marker`
`needsSupabase: true`. `resolveDataDir(values)` reads `--data` and resolves
the path; `resolveIdentity()` runs next and throws before `buildContext()`
calls `loadMapData()` — so the auth gate fires even when the caller supplies
a complete Map data directory and wants only to see what the workflow would
look like. `marker` is the sole `needsSupabase: false` command, which matches
the persona's report that `marker` worked end-to-end while every other command
did not.

The gated dispatch keys are `org`, `snapshot`, `evidence`, `readiness`,
`timeline`, `coverage`, `practice`, `practiced`, `health`, `voice`, and
`sources`. The user-visible surface includes their subcommands (`org show`,
`org team`, `snapshot list`, `snapshot show`, `snapshot trend`,
`snapshot compare`, and the nine others), enumerated in the libcli definition
under the `commands` array at `products/landmark/bin/fit-landmark.js:67-185`.
Throughout this spec, *gated commands* means the user-visible invocation
surface from that `commands` array — not just the eleven dispatch keys —
because that is the surface a leader actually types and a baseline must cover.
`marker` already runs offline today; this spec does not change `marker`'s
behavior.

Each gated command's handler receives a `supabase` client and queries it
through a typed query module (see for example
`products/landmark/src/commands/org.js:5-29`, which imports
`getOrganization`/`getTeam` from `@forwardimpact/map/activity/queries/org`
and accepts a `queries` parameter for test injection). The offline path is
therefore not a `--data`-loader story alone — it requires a fixture-backed
query layer that the handlers can consume in place of the Supabase-backed
one. The shape of that layer and how the existing test-injection seam is
used to supply it are design choices; the spec scope below names the
observable contract, not the wiring.

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
| Coverage across the gated commands | Offline mode applies to every user-visible gated command in the libcli `commands` array (`org show`, `org team`, the four `snapshot` subcommands, and the nine other dispatch keys — fifteen entries in total). Each command's offline output is shape-identical to its authenticated output — same columns, same headings, same `--format text\|json\|markdown` behavior — and is distinguishable as offline output via a documented marker (banner, header line, or footer — design choice) that names the data source. `marker` is unchanged. |
| Authentication-gate placement | When offline mode is requested, `resolveIdentity()` is not called and `LANDMARK_AUTH_TOKEN` is neither read nor referenced. When offline mode is not requested and the command is `needsSupabase: true`, the existing identity gate fires exactly as today, with the existing `IdentityUnresolvedError` class and exit code 4. No third path. |
| Network-egress invariant | Under offline mode, no Supabase client is constructed, no HTTP request is issued to any host derived from `MAP_SUPABASE_URL` or `MAP_SUPABASE_ANON_KEY`, and the values of those environment variables are not read. |
| Privacy and accident-prevention | The mode cannot be silently activated by environment alone — at minimum one explicit, named indicator must be present in the invocation. When the indicator is absent the production auth gate fires as today. The offline path neither reads nor validates `LANDMARK_AUTH_TOKEN`; passing both the offline indicator and `LANDMARK_AUTH_TOKEN` either errors with a documented message or is silently ignored (design choice, but the design must pick one and document it). The marker that distinguishes offline output names the data source plainly enough that a leader pasting output into a peer message does not accidentally represent fixture numbers as their organization's numbers. |
| Authenticated-path regression guard | Before this spec's implementation lands, the test harness captures shape-equivalent output samples of every gated command against the existing mocked-Supabase fixtures in `products/landmark/test/fixtures.js` — *not* against live Supabase — across all three `--format` values. The captured artifacts are checked into the repository (location is a design choice) and used by the regression test below. "Shape-equivalent" means: same set of section headings or top-level JSON keys, same column set per row class, same banner-absence on the authenticated path. The criterion is shape-equivalence rather than byte-identity because some authenticated outputs include conditionally-rendered sections (for example the `health` command's `Recommendations` trailer at [Landmark for Leaders § health](../../websites/fit/docs/getting-started/leaders/landmark/index.md), which appears only when Summit is installed) and locale- or time-dependent strings, none of which the spec wants to freeze. |
| Fixture provenance | The package ships at least one demo dataset that exercises every gated command without errors and renders non-empty output for the three commands the [Landmark for Leaders guide](../../websites/fit/docs/getting-started/leaders/landmark/index.md) presents first to a new leader (`org show`, `org team`, `practice`). The dataset is small enough to ship inside the npm package without bloating it (specific size budget is a design choice). The shape of the dataset on disk — single bundled JSON, multiple YAML files, `./data/`-like directory tree, in-repo constants, or a fixture-backed query-module implementation — is a design choice. The dataset's roster contains only email addresses at the IETF reserved domains `example.com`, `example.org`, or `example.net`, and the dataset's GitHub-like handles are drawn from a documented reserved namespace named in this spec: handles match `^demo-[a-z0-9-]+$` (a literal `demo-` prefix followed by one or more characters from `[a-z0-9-]`). |
| Caller-supplied data path | A leader who already has an activity dump on disk (the BioNova persona's `./data/activity/` case) can point the offline mode at their own files and see the eleven gated dispatch keys' command output computed against their data. At minimum, the caller-supplied path-shape contract must accept the same row classes the existing Supabase-backed queries consume — roster rows, snapshot rows, score rows, evidence rows, comment rows, practice-pattern rows. The exact on-disk encoding (JSON files per row class, CSV, NDJSON, a single bundled JSON, etc.) and the file-naming convention are design choices. Caller-supplied data and shipped-fixture data are independent paths; a single invocation reads from one source, not a mix. |
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
| Every gated command runs to non-error completion in offline mode. | Test: for each user-visible gated command in the libcli `commands` array, invoking the command in offline mode against the shipped fixture exits 0 and writes non-empty output to stdout. The invocation uses the offline indicator and no other data source (`LANDMARK_AUTH_TOKEN` unset; `MAP_SUPABASE_URL` and `MAP_SUPABASE_ANON_KEY` unset; no caller-supplied data path). |
| Offline mode does not require `LANDMARK_AUTH_TOKEN`. | Test: with `LANDMARK_AUTH_TOKEN` unset, every gated command in offline mode against the shipped fixture exits 0. The same invocations without the offline indicator exit non-zero with the existing `IdentityUnresolvedError` message and exit code 4. |
| Offline mode contacts no network. | Test: under offline mode, no Supabase client is constructed and no outbound socket is opened during command execution. Mechanism for asserting the no-socket property is a design choice; the observable property is what this criterion locks in. |
| Authenticated-path behavior is unchanged. | Test: for each gated command, without the offline indicator and against the existing mocked-Supabase test fixtures (`products/landmark/test/fixtures.js`), command output is shape-equivalent to the baseline captured before this change shipped: same section headings or top-level JSON keys, same column set per row class, same banner-absence. The test runs across all three `--format` values. The shape-equivalence comparator is implemented as part of this spec's diff; its exact normalization rules are a design choice. |
| Offline output is distinguishable from authenticated output. | Test: every gated command in offline mode emits a documented marker (banner, header line, or footer — design choice) that names the data source. The marker is present across all three `--format` values in a form appropriate to each. The marker text is documented in the offline-mode section of the getting-started guide. |
| Caller-supplied data renders. | Test: pointing the offline mode at a caller-supplied directory whose contents satisfy the documented path-shape contract renders gated-command output computed against those files, distinct from output computed against the shipped fixture, for at least one command from each of the three row-class clusters the contract covers — one roster-driven command (`org show` or `org team`), one snapshot-driven command (one of `snapshot list`/`show`/`trend`/`compare`), and one evidence-driven command (`evidence` or `practice`). |
| The shipped fixture is privacy-safe by construction. | Test: a checked-in test reads the shipped fixture and asserts that every email address ends in `@example.com`, `@example.org`, or `@example.net` and that every GitHub-like handle matches `^demo-[a-z0-9-]+$`. A documented banner names the fixture data as fictional in every gated command's offline output. |
| Per-command `--help` advertises offline mode. | Test: the `examples` block in the libcli definition (`products/landmark/bin/fit-landmark.js`) for at least one of the three first-on-the-getting-started-page commands (`org show`, `org team`, `practice`) carries an offline-mode invocation, so a leader reading `--help` sees the indicator in context. The global-options block carrying the flag with its description satisfies the global-help requirement separately. |
| Documentation is in place. | Test: the [Landmark for Leaders getting-started guide](../../websites/fit/docs/getting-started/leaders/landmark/index.md) carries a section showing the offline-mode invocation, placed before the "Prerequisites" block. The [Demonstrate Engineering Progress guide](../../websites/fit/docs/products/engineering-outcomes/index.md) carries an entry pointing to the offline-mode section. If this spec introduces a new guide page, the `fit-landmark` skill `## Documentation` list and the CLI `documentation` array each carry the new entry per [products/CLAUDE.md § Linking rule](../../products/CLAUDE.md); if the offline mode is documented entirely within the existing getting-started page (no new URL), the existing skill/CLI link to that page satisfies the linking rule. |
| No new usage telemetry is introduced. | Test: the implementation diff adds no new telemetry-emitting code paths beyond the existing `createLogger("landmark")` logger declared at `products/landmark/src/lib/cli.js:35`. Run-count, command-name, and invocation-flag emission to any destination other than that logger is absent from the diff. |
