# Plan 2330-a: Repository Activity Watchdog

Executes [design-a.md](design-a.md) for [spec.md](spec.md).

## Approach

The design's rollout order fixes the sequence, so the work splits by
publication boundary rather than by feature. `libwatchdog` lands first with no
consumer. The CLI, the launcher, the guide, and the skill land together,
because `public-cli-set` computes the launcher from a published `npx`
invocation that only the guide and the skill supply. The action and the publish
matrix follow the CLI. An operator seeds the sibling repository, grants the App
permission, and cuts the gear release between the action landing and the
workflow landing, because the workflow pins a SHA and a release tag that do not
exist before then. The operator contract and the orientation pages land before
the workflow, so the resume rule is in print the first time the brake engages.

Libraries used: libwatchdog (new: rules, probes, latch, policy), libcli
(command definition and dispatch), libutil (`createRetry`, the runtime bag),
libpreflight (Node 22 floor), libmock (`createTestRuntime` in tests).

## Scope notes for the approver

Six findings the spec and the design do not settle. Each is the approver's to
overturn.

| Finding | Detail |
| ------- | ------ |
| `kata-agent` prose is already qualified | design-a.md § Contracts expects an unqualified "every workflow" claim in `products/kata/actions/kata-agent/action.yml`. The file reads "one variable halts every kata-\* workflow at once" at lines 105-106 and repeats the qualified form at line 138. `products/kata/actions/kata-agent/README.md` names the killswitch nowhere. No edit lands there. |
| The two unqualified claims are elsewhere | `websites/kata/docs/getting-started/index.md:105` ("halt every workflow at once") and `websites/kata/docs/continuous-improvement/index.md:264` ("Every workflow checks one repository variable"). `websites/kata/docs/spec-to-shipped/approval-gates/index.md:156` already says "Every Kata workflow" and needs only its resume line fixed. |
| Resume homes resolve to four files, not the same four | `KATA.md:193`, `.claude/skills/kata-setup/SKILL.md:199`, `websites/kata/docs/continuous-improvement/index.md:270`, and `websites/kata/docs/spec-to-shipped/approval-gates/index.md:158`. `websites/kata/docs/getting-started/index.md` carries no resume instruction. |
| Loop-step name | design-a.md names the site's sixth step `Stop`. spec.md § Included names it `Guard`. The plan follows the design, because `.claude/skills/gemba/SKILL.md` already heads a `Guard the loop:` block for `gemba-selfedit`. The guide slug stays `guard-activity`. |
| One home for the killswitch rule | The "no agent writes `KATA_KILLSWITCH`" rule lands once, in `.claude/agents/x-coordination-protocol.md` § Creating outputs, which every agent profile and every GitHub-writing skill already references. Restating it per skill would trip `jidoka instructions` layer restatement. |
| No golden CLI capture | `products/gemba/test/golden/` holds manual capture dirs. Only `gemba-wiki` has an automated golden test, and no test enumerates the dirs. The plan adds `gemba-watchdog` to the `bin-smoke` list and captures no snapshot. |

## Parts

| Part | Title | Route | Depends on |
| ---- | ----- | ----- | ---------- |
| [06 step 1](plan-a-06.md) | Operator: App permission and sibling repository | operator | — |
| [01](plan-a-01.md) | `libwatchdog` engine, probes, latch, tests | `staff-engineer` | — |
| [02](plan-a-02.md) | `gemba-watchdog` CLI, launcher, binary, guide, skill | `staff-engineer` | 01 |
| [03](plan-a-03.md) | Composite action, publish matrix, trust-sensitive review | `staff-engineer` | 02 |
| [04](plan-a-04.md) | Operator contract, Gemba loop, orientation pages | `technical-writer` | 03 |
| [06 step 2](plan-a-06.md) | Operator: publish the action, cut the gear release | operator | 03 |
| [05](plan-a-05.md) | `watchdog.yml` and `KATA.md` § Killswitch | `staff-engineer` | 04, 06 step 2 |

## Execution

- **Sequential.** No two parts run in parallel. Parts 03 and 04 both edit
  `websites/gemba/index.md` and `websites/gemba/llms.txt` counts, and part 05
  cannot resolve its pins before part 06 step 2 publishes them.
- **Agent route.** Parts 01, 02, 03, and 05 go to `staff-engineer`. Each
  carries library code, CLI wiring, workflow YAML, or an invariant reseed.
  Part 04 goes to `technical-writer`. It is prose, site markup, and skill
  instruction text with no executable surface.
- **The operator goes first and again in the middle.** Part 06 step 1 runs
  before part 05 merges, and it can run at any earlier point. Part 06 step 2
  runs after part 03 merges to `main` and before part 05 opens.
- **Landing shape.** One pull request per part. Every part leaves
  `bun run check`, `bun run test`, and `bunx jidoka invariants` green on its
  own head.

## Cross-cutting concerns

- **`.claude/**` writes.** Parts 02, 03, and 04 write skill and agent-reference
  files. When repository settings block the edit, use
  `echo … | bunx gemba-selfedit <path>` per
  [CLAUDE.md § Contributor Workflow](../../CLAUDE.md).
- **Generated blocks.** Run `bun run context:fix` after any `package.json`
  `description`, `keywords`, or `jobs` edit. Run
  `bunx jidoka invariants --seed enumeration-drift` after the
  `.github/CLAUDE.md` action-table row lands, then reconcile each fence body by
  hand. `--seed` prints the canonical set. It has no write mode.
- **Tenant neutrality.** No file under `libraries/libwatchdog/` or
  `products/gemba/bin/gemba-watchdog.js` may contain the string
  `KATA_KILLSWITCH`. Success criterion 13 greps for it.
- **Ambient dependencies.** `libwatchdog` source reads no `Date.now`, no
  `new Date()`, no `setTimeout`, and no `node:fs`. It takes `clock`, `fs`, and
  `request` by injection. `.jidoka/invariants/ambient-deps.rules.mjs` gates
  this, and its allow-list covers only `products/*/bin/*.js`.

## Risks

| Risk | Detail |
| ---- | ------ |
| A workflow that lands before its pins exist | `watchdog.yml` pins a `forwardimpact/gemba-watchdog` commit SHA and a `gear@v*` release tag. Merged before part 06 step 2, it fails red every 15 minutes and pages nobody usefully. Part 05 is the last landing for this reason. |
| An unseeded sibling reddens every action push | `publish-actions.yml` fails the whole matrix leg when the `forwardimpact/gemba-watchdog` repository is absent. Part 03 adds the matrix entry, so the repository must exist first (part 06 step 1). |
| The comment counter has no baseline | spec.md § Threshold records no measured comment rate. The first busy review day can engage the killswitch on ordinary activity. Recalibrate after the first weeks, before it stops the team. |
| The App grant is operator-only and silent | Without `Variables: read & write`, the engage job fails on the write and exits 1. That is a red run every 15 minutes with the brake absent, not a stopped team. Part 06 step 1 is the only place this can be fixed. |
| `--only gemba-watchdog` needs the name in the release | `fit-install.sh` classifies any `gemba-*` name as a gear binary and downloads `gemba-watchdog-bun-linux-x64` with its `.sha256` sidecar. The download 404s against any release cut before part 02's manifest entry shipped. Part 06 step 2 pins the first release that carries it. |
| A large force-push trips the commits counter | `since` filters on committer date, so a rewrite that restamps 32 or more default-branch commits engages the killswitch. design-a.md § Interfaces names this as the intended fail-safe, not a defect. |

## Clean break

The plan removes no path. The killswitch contract is the path the watchdog
uses. It adds no second brake, no second credential, no shim, and no fallback.
The truthy predicate gains one home in `libwatchdog/src/truthy.js` and no fifth
shell copy, so spec.md's exclusion on consolidating the four existing shell
copies still stands. No file gains a `KATA_KILLSWITCH` default outside
`.github/workflows/watchdog.yml`.
