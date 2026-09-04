# Plan 2330-a: Repository Activity Watchdog

Executes [design-a.md](design-a.md) for [spec.md](spec.md).

## Approach

The design's rollout order fixes the sequence, so the work splits by
publication boundary rather than by feature. `libwatchdog` lands first with no
consumer. The CLI, the launcher, the binary manifest, the guide, and the skill
land together, because `public-cli-set` computes the launcher from a published
`npx` invocation that only the guide and the skill supply. An operator then cuts
the gear release that carries the binary, so the action can land with a real
release tag rather than a placeholder. The action and the publish matrix follow,
the operator seeds and tags the sibling, and the workflow lands last against a
SHA and a tag that both already exist. The operator contract and the orientation
pages land before the workflow, so the resume rule is in print the first time
the brake engages.

Libraries used: libwatchdog (new: rules, probes, latch, policy), libutil
(`createRetry`, `isoTimestamp`, the runtime bag), libpreflight (Node 22 floor),
libmock (`createTestRuntime` in tests). The CLI bin imports libcli. The library
does not.

## Scope notes for the approver

Eight findings the spec and the design do not settle. Each is the approver's to
overturn. The first six the plan resolves. The last two it cannot.

| Finding | Detail |
| ------- | ------ |
| `kata-agent` prose is already qualified | design-a.md § Contracts expects an unqualified "every workflow" claim in `products/kata/actions/kata-agent/action.yml`. The file reads "one variable halts every kata-\* workflow at once" at lines 105-106 and repeats the qualified form at line 138. Its README names the killswitch nowhere. No edit lands there. |
| The two unqualified claims are elsewhere | `websites/kata/docs/getting-started/index.md:105` and `websites/kata/docs/continuous-improvement/index.md:264`. `websites/kata/docs/spec-to-shipped/approval-gates/index.md:156` already says "Every Kata workflow" and needs only its resume line fixed. |
| Resume homes resolve to four files | `KATA.md:193`, `.claude/skills/kata-setup/SKILL.md:199`, `websites/kata/docs/continuous-improvement/index.md:270`, and `websites/kata/docs/spec-to-shipped/approval-gates/index.md:158`. `websites/kata/docs/getting-started/index.md` carries no resume instruction. |
| Loop-step name | design-a.md names the site's sixth step `Stop`. spec.md § Included names it `Guard`. The plan follows the design, because `.claude/skills/gemba/SKILL.md` already heads a `Guard the loop:` block for `gemba-selfedit`. The guide slug stays `guard-activity`. |
| No golden CLI capture | `products/gemba/test/golden/` holds manual capture dirs. Only `gemba-wiki` has an automated golden test, and no test enumerates the dirs. The plan extends the `bin-smoke` list only. |
| The action's `variable` input is optional | design-a.md makes `--variable` a required CLI option, and spec success criterion 2 requires `threshold` and `window-hours` to be required and default-free on the action. `assess` needs no variable, so declaring the action input required would make every measurement call pass an argument it does not use. The action input is optional, the engage step fails fast on an empty value, and the CLI option stays required for `engage`. |
| **Unresolved: success criterion 12 conflicts with the pack rule** | spec.md:219 requires `kata-release-merge` and `kata-security-update` to name the four watchdog paths (`libraries/libwatchdog/`, `products/gemba/bin/gemba-watchdog.js`, `products/gemba/actions/gemba-watchdog/`, `.github/workflows/watchdog.yml`). Both skills publish in the `kata-skills` pack, where `.claude/skills/CLAUDE.md` § No monorepo leakage forbids naming this monorepo's packages, workflows, and file paths, and `.jidoka/invariants/skill-genericity.rules.mjs` scans exactly those files. Part 03 lands the rule in the generic form the pack permits. Satisfying the criterion literally needs a spec amendment or a named exemption in that invariant. The approver decides which. |
| **Unresolved: success criterion 12's second clause has no home that fits** | spec.md:219 also requires "the agent skills that write to GitHub" to carry the "no agent writes `KATA_KILLSWITCH`" rule. `.claude/agents/x-coordination-protocol.md` measures 1261 of its 1280-word cap, its § Creating outputs maps output types to tracker operations rather than carrying write prohibitions, and `kata-security-update` and `kata-setup` do not reference it at all. Part 03 creates a new agent reference instead and points the two named skills at it. That is a placement the spec does not describe. |

## Parts

| Part | Title | Route | Depends on |
| ---- | ----- | ----- | ---------- |
| [06 step 1](plan-a-06.md) | Operator: App permissions and sibling repository | operator | — |
| [01](plan-a-01.md) | `libwatchdog` engine, probes, latch, tests | `staff-engineer` | — |
| [02](plan-a-02.md) | `gemba-watchdog` CLI, launcher, binary, guide, skill | `staff-engineer` | 01 |
| [06 step 2](plan-a-06.md) | Operator: cut the gear release carrying the binary | operator | 02 |
| [03](plan-a-03.md) | Composite action, publish matrix, trust-sensitive review | `staff-engineer` | 06 steps 1-2 |
| [06 step 3](plan-a-06.md) | Operator: publish and tag the sibling action | operator | 03 |
| [04](plan-a-04.md) | Operator contract, Gemba loop, orientation pages | `technical-writer` | 03 |
| [05](plan-a-05.md) | `watchdog.yml` and `KATA.md` § Killswitch | `staff-engineer` | 04, 06 step 3 |

## Execution

- **Sequential, in the table's order.** No two parts run in parallel. Parts 03
  and 04 both edit `websites/gemba/` counts, and part 05 cannot resolve its two
  pins before part 06 step 3.
- **The operator interleaves three times.** Step 1 must precede part 03, because
  part 03 adds a `publish-actions.yml` matrix leg that fires on merge and fails
  against an absent sibling. Step 2 must precede part 03, so the action lands
  with a real `gear-release` default. Step 3 must precede part 05, so the
  workflow pins a SHA that exists. This ordering removes the circular pin the
  first draft carried.
- **Agent route.** Parts 01, 02, 03, and 05 go to `staff-engineer`. Each carries
  library code, CLI wiring, workflow YAML, or an invariant reseed. Part 04 goes
  to `technical-writer`. It is prose, site markup, and skill instruction text.
- **Landing shape.** One pull request per part. Every part leaves
  `bun run check`, `bun run test`, and `bunx jidoka invariants` green on its own
  head. Part 05 step 3 is the one exception the plan names, because GitHub
  serves `workflow_dispatch` only from the default branch.

## Cross-cutting concerns

- **Instruction-layer budgets are at or near their caps.** Every part that edits
  a capped layer measures first with `bunx jidoka instructions` and trims the
  same file by at least what it adds. Measured today:

  | File | Cap | Measured | Headroom |
  | ---- | --- | -------- | -------- |
  | `.github/CLAUDE.md` | 768 words | 768 | 0 |
  | `CLAUDE.md` | 896 words / 192 lines | 850 / 189 | 46 / 3 |
  | `.claude/agents/x-coordination-protocol.md` | 1280 words / 192 lines | 1261 / 186 | 19 / 6 |
  | `.claude/skills/kata-setup/SKILL.md` | 1280 words / 192 lines | over on both | negative |
  | `.claude/skills/kata-security-update/SKILL.md` DO-CONFIRM | 9 items | 9 | 0 |

- **Published-pack genericity.** `.claude/skills/kata-*/SKILL.md` and
  `.claude/agents/x-*.md` sync into installations. `.claude/skills/CLAUDE.md`
  § No monorepo leakage forbids this monorepo's package names, workflow names,
  and file paths there, and `skill-genericity.rules.mjs` enforces it.
  `temporal.rules.mjs` additionally rejects `spec 2330` in any `.claude/**` file
  outside a `references/` directory. Write both in generic form.
- **`.claude/**` writes.** Parts 02, 03, and 04 write skill and agent files.
  When repository settings block the edit, use
  `echo … | bunx gemba-selfedit <path>` per
  [CLAUDE.md § Contributor Workflow](../../CLAUDE.md).
- **Generated blocks.** Run `bun run context:fix` after any `package.json`
  `description`, `keywords`, or `jobs` edit, and after adding a library README.
  It writes the `BEGIN:description` and `BEGIN:catalog` blocks. Run
  `bunx jidoka invariants --seed enumeration-drift` after the
  `.github/CLAUDE.md` action-table row lands, then reconcile each fence body by
  hand. `--seed` prints the canonical set. It has no write mode.
- **Formatting.** Every inline manifest and YAML block in these parts is
  illustrative. Run `bun run check:fix` before `bun run check`, because biome
  reflows hand-written JSON.
- **Tenant neutrality.** No file under `libraries/libwatchdog/` or
  `products/gemba/bin/gemba-watchdog.js` may contain the string
  `KATA_KILLSWITCH`. Success criterion 13 greps for it.
- **Ambient dependencies.** `libwatchdog` source reads no `Date.now`, no
  `new Date(...)` in any form, no `setTimeout`, and no `node:fs`. It takes
  `clock`, `fs`, and `request` by injection.
  `.jidoka/invariants/ambient-deps.rules.mjs` flags every `NewExpression` on
  `Date` regardless of its arguments, and its allow-list reaches
  `libraries/*/bin/*.js` but no `libraries/*/src/**` outside `libcli` and
  `libmock`. Use `isoTimestamp` from `libraries/libutil/src/calendar.js`.

## Risks

| Risk | Detail |
| ---- | ------ |
| The installer falls through to npm | `fit-install.sh` `channels_for` returns `brew_gear release_gear npm` for any `gemba-*` name. A failed release download silently installs the npm launcher, which resolves the whole `@forwardimpact/gemba` closure the design rejected, inside a 5-minute timeout. Part 03 step 1 fails the step on the installer's own `(npm)` channel marker. |
| The comment counter has no baseline | spec.md § Threshold records no measured comment rate. The first busy review day can engage the killswitch on ordinary activity. Recalibrate after the first weeks, before it stops the team. |
| The App grant is operator-only and silent | Without `Variables: read & write` at repository scope and read at organization scope, the engage job exits 1 on the read or the write. That is a red run every 15 minutes with the brake absent, not a stopped team. Part 06 step 1 is the only place this can be fixed. |
| A large force-push trips the commits counter | `since` filters on committer date, so a rewrite that restamps 32 or more default-branch commits engages the killswitch. design-a.md § Interfaces names this as the intended fail-safe. |
| An unseeded sibling reddens one publish leg | `publish-actions.yml` sets `fail-fast: false`, so an absent `forwardimpact/gemba-watchdog` fails that leg alone and leaves the other seven green. Part 06 step 1 still precedes part 03. |
| Runs can overlap | A run is `assess` (≤5 min) then `engage` (≤5 min) plus GitHub's scheduled-dispatch delay, which can exceed the 15-minute interval under load. Two engage jobs racing is harmless: the second reads a truthy value and skips. The plan adds no `concurrency` group, because cancelling an in-flight engage would drop the write. |

## Clean break

The plan removes no path. The killswitch contract is the path the watchdog
uses. It adds no second brake, no second credential, no shim, and no fallback.
The truthy predicate gains one home in `libwatchdog/src/truthy.js` and no fifth
shell copy, so spec.md's exclusion on consolidating the four existing shell
copies still stands. No file gains a `KATA_KILLSWITCH` default outside
`.github/workflows/watchdog.yml`.
