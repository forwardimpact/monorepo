# Plan 2170: Reusable interview action + CLI split

Executes [design-a.md](design-a.md) for [spec.md](spec.md).

## Approach

The work splits along the publish boundary. First land the two tested CLI
verbs the action will call (`fit-map substrate stage --emit-env`,
`fit-harness scan-logs`). Then land the composite action, its README, and its
publish wiring — merging to `main` splits the action to the
`forwardimpact/kata-interview` sibling. Only then flip the consumer surfaces
(the wrapper workflow, the shape test, the skill, the reference prose) onto the
now-published action, pinning the SHA the split produced. The verbs and the
action carry no monorepo-specific assumptions; the wrapper supplies the
monorepo's own `website-url` literal and `substrate` choice as inputs.

## Part Index

| Part | Title | Depends on |
| --- | --- | --- |
| [01](plan-a-01.md) | CLI verbs — `fit-map substrate stage --emit-env` + `fit-harness scan-logs`, each unit-tested | — |
| [02](plan-a-02.md) | Composite action `kata-interview` + README + publish wiring | 01 (logical) |
| [03](plan-a-03.md) | Consumer flip — wrapper workflow, shape test, skill + reference parameterization, BioNova reference prose | 02 published |

## Execution

Land the parts in order **01 → 02 → 03**. Parts 01 and 02 may be *drafted* in
parallel, but 01 lands first so the published action never references verbs that
do not yet exist on `main`. Merging part 02 to `main` triggers
`publish-actions.yml`, which splits the action to the sibling's `main`; part 03
then pins that published commit SHA on the wrapper's `uses:` line. Part 03's
manual acceptance (spec Success Criterion 1) runs after the sibling exists.

Route all three parts to an engineering agent (`staff-engineer`). Part 03's
final step (BioNova reference prose) may hand to `technical-writer`.

## Cross-cutting concerns

- **Composite-action constraints** (`.github/CLAUDE.md`): a composite action
  cannot read `secrets.*`, declare `concurrency`, or set a job
  `timeout-minutes`. Substrate secrets are therefore action **inputs** the
  wrapper passes from its own `secrets.*`; `concurrency` and `timeout-minutes`
  stay on the wrapper workflow. `IS_SANDBOX=1` stays on the agent-spawning step
  inside the action.
- **`fit-map` off PATH**: `fit-map` ships in the `map@v*` release, not the gear
  bundle, so the action invokes it as `bunx fit-map` — the documented exception,
  kept verbatim. Every other CLI (`fit-terrain`, `fit-harness`, `fit-trace`,
  `fit-wiki`) runs as a bootstrap-installed binary.
- **SHA-pin publish loop**: consumers reach the action via a Dependabot SHA-bump,
  never by moving `v1`. Part 02 adds the sibling to `.github/dependabot.yml` so
  future bumps flow.
- **`bun run context:fix`** is not needed — no `package.json` `description`/`jobs`
  metadata changes (the verbs are new subcommands on existing CLIs).

## Risks

- **First-publish bootstrap.** The `forwardimpact/kata-interview` sibling does
  not exist until part 02 merges to `main` and `publish-actions.yml` runs. Part
  03's wrapper cannot pin a real SHA before then. Do not merge part 03 until the
  publish job for part 02 has succeeded and the split commit SHA is resolvable on
  the sibling — otherwise the wrapper points at a non-existent ref. The wrapper
  is `workflow_dispatch`-only, so a stale ref does not break push/PR CI, but a
  dispatch would fail until the SHA resolves.
- **App installation `Actions: Read` scope.** `scan-logs --run-id` downloads the
  run's own log archive through the GitHub API; the minting App must carry
  `Actions: Read`. This is unchanged from today's inline scan, but the verb now
  fails closed (non-zero) if the download 403s, so a missing scope surfaces as a
  hard failure rather than a silent skip.
- **`WEBSITE_URL` must always be set.** The skill errors rather than inventing a
  URL when `WEBSITE_URL` is absent. The action sets it unconditionally from
  `inputs.website-url` (a required input), so the only way to hit the error is a
  malformed wrapper — surface it loudly in the skill rather than defaulting.

Libraries used: libcli (`createCli`, `dispatch`), libutil (`runtime` — `fs`,
`fsSync`, `subprocess`), and the existing `trace-github.js` archive
download/unzip pattern in libharness.
