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

Eleven findings the spec and the design do not settle. Each is the approver's to
overturn. The plan resolves nine. The approver settled the last two by amending
success criterion 12 on 2026-09-04.

| Finding | Detail |
| ------- | ------ |
| `kata-agent` prose is already qualified | design-a.md § Contracts expects an unqualified "every workflow" claim in `products/kata/actions/kata-agent/action.yml`. The file reads "one variable halts every kata-\* workflow at once" at lines 105-106 and repeats the qualified form at line 138. Its README names the killswitch nowhere. No edit lands there. |
| The two unqualified claims are elsewhere | `websites/kata/docs/getting-started/index.md:105` and `websites/kata/docs/continuous-improvement/index.md:264`. `websites/kata/docs/spec-to-shipped/approval-gates/index.md:156` already says "Every Kata workflow" and needs only its resume line fixed. |
| Resume homes resolve to four files | `KATA.md:193`, `.claude/skills/kata-setup/SKILL.md:199`, `websites/kata/docs/continuous-improvement/index.md:270`, and `websites/kata/docs/spec-to-shipped/approval-gates/index.md:158`. `websites/kata/docs/getting-started/index.md` carries no resume instruction. |
| Loop-step name | design-a.md names the site's sixth step `Stop`. spec.md § Included names it `Guard`. The plan follows the design, because `.claude/skills/gemba/SKILL.md` already heads a `Guard the loop:` block for `gemba-selfedit`. The guide slug stays `guard-activity`. |
| No golden CLI capture | `products/gemba/test/golden/` holds manual capture dirs. Only `gemba-wiki` has an automated golden test, and no test enumerates the dirs. The plan extends the `bin-smoke` list only. |
| The action's `variable` input is optional | design-a.md makes `--variable` a required CLI option, and spec success criterion 2 requires `threshold` and `window-hours` to be required and default-free on the action. `assess` needs no variable, so declaring the action input required would make every measurement call pass an argument it does not use. The action input is optional, the engage step fails fast on an empty value, and the CLI option stays required for `engage`. |
| The comments probe drops the timestamp coverage escape | design-a.md § Window coverage fixes one coverage rule for the three unfiltered probes. `commentsProbe` filters `since` on `updated_at` while counting `created_at`, so an old comment edited in-window would satisfy that escape on a full page and report `covered: true` while newer items stayed hidden. Part 01 uses `page.length < 100` alone for it. |
| The latch policy drops its `verdict` argument | design-a.md § Library surface fixes the policy seam as `(verdict, state, { windowMs }) => …`. `engage` runs only after a breach and carries no counting options, so it holds no verdict to pass. Part 01 uses `decide(state, { windowMs, now })`. |
| The rollout order swaps two middle steps | design-a.md § Contracts orders sibling seed, matrix entry, subtree split, manifest entry, binary release. The plan cuts the binary release before the action lands, so the action can ship a real `gear-release` default rather than a placeholder its published copy would carry to external consumers. |
| The sixth step carries three names | The site step is `Stop` (design), the guide slug is `guard-activity` (spec), and the docs-index heading is "Guard an Agent Team". One concept, three vocabularies. The plan keeps all three because the spec and design each fix one, and the third follows the docs-index heading convention. The approver may collapse them. |
| **Settled: success criterion 12 amended** | The criterion required `kata-release-merge` and `kata-security-update` to name four monorepo paths literally. Both publish in `kata-skills`, where `.claude/skills/CLAUDE.md` § No monorepo leakage forbids that, and spec.md § Excluded ships no watchdog workflow to installations, so the literal list would have taught every installation about files it does not have. The repo-local alternative was closed: agent profiles are exempt from `skill-genericity`, but `release-engineer.md` measures 448 of its 448-word cap. The approver amended the criterion to require the generic surface form part 03 lands. |
| **Settled: success criterion 12's second clause amended** | The clause required "the agent skills that write to GitHub" to carry the killswitch rule. That set is unbounded and grows, restating the rule per skill would read as layer drift, and `x-coordination-protocol.md` sits at 1278 of 1280 words with a § Creating outputs that maps tracker operations rather than write prohibitions. The approver amended the criterion to require one shared agent reference every profile loads, which is what part 03 step 7 creates. |

## Parts

| Part | Title | Route | Depends on |
| ---- | ----- | ----- | ---------- |
| [06 step 1](plan-a-06.md) | Operator: App permissions and sibling repository | operator | — |
| [01](plan-a-01.md) | `libwatchdog` engine, probes, latch, tests | `staff-engineer` | — |
| [02](plan-a-02.md) | `gemba-watchdog` CLI, launcher, binary, guide, skill | `staff-engineer` | 01 |
| [06 step 2](plan-a-06.md) | Operator: publish the npm packages | operator | 02 |
| [06 step 3](plan-a-06.md) | Operator: cut the gear release carrying the binary | operator | 06 step 2 |
| [03](plan-a-03.md) | Composite action, publish matrix, trust-sensitive review | `staff-engineer` | 06 steps 1-3 |
| [06 step 4](plan-a-06.md) | Operator: publish and tag the sibling action | operator | 03 |
| [04](plan-a-04.md) | Operator contract, Gemba loop, orientation pages | `technical-writer` + `staff-engineer` | 03 |
| [05](plan-a-05.md) | `watchdog.yml` and `KATA.md` § Killswitch | `staff-engineer` | 04, 06 step 4 |

## Execution

- **Sequential, in the table's order.** No two parts run in parallel. Parts 02
  and 04 both edit files under `websites/gemba/`, and part 05 cannot resolve its
  two pins before part 06 step 3. Part 03 touches no site file.
- **The operator interleaves three times.** Step 1 must precede part 03, because
  part 03 adds a `publish-actions.yml` matrix leg that fires on merge and fails
  against an absent sibling. Steps 2 and 3 must precede part 03, so the action
  lands with a real `gear-release` tag and installer digest. Step 4 must precede
  part 05, so the workflow pins a SHA that exists. This ordering removes the
  circular pin the first draft carried.
- **Agent route.** Parts 01, 02, 03, and 05 go to `staff-engineer`. Each carries
  library code, CLI wiring, workflow YAML, or an invariant reseed. Part 04 is
  split: steps 1 to 4, 7, and 8 go to `technical-writer`, because they are prose
  and skill instruction text. Steps 5 and 6 go to `staff-engineer`, because they
  rewrite bezier geometry across four SVG copies and recompute two
  animation-delay ladders, a keyframe period, and its lit window in `main.css`.
  The two routes share one branch, so they run in sequence, never concurrently:
  `technical-writer` lands steps 1 to 4, pushes, and hands off; `staff-engineer`
  then lands steps 5 and 6 and pushes before steps 7 and 8 return. That
  handshake is what the coordination protocol requires of a shared workspace.
- **Landing shape.** One pull request per part. Every part leaves
  `bun run check`, `bun run test`, and `bunx jidoka invariants` green on its own
  head. Part 05 step 3 is the one exception the plan names, because GitHub
  serves `workflow_dispatch` only from the default branch.

## Cross-cutting concerns

- **Instruction-layer budgets are at or near their caps.** Every part that edits
  a capped layer measures first and trims the same file by at least what it
  adds. Measure with the checker's own algorithm: strip a leading `---`
  frontmatter block, then count `\n` for lines and `\S+` runs for words
  (`libraries/libinvariant/src/instructions.js`). `bunx jidoka instructions`
  passes clean on `main` today, so every breach below would be one this change
  introduced.

  | File | Layer | Cap | Measured | Headroom |
  | ---- | ----- | --- | -------- | -------- |
  | `.github/CLAUDE.md` | L1 subdir | 768 w / 128 l | 768 / 118 | **0 w** / 10 l |
  | `CLAUDE.md` | L1 root | 896 w / 192 l | 892 / 189 | 4 w / 3 l |
  | `.claude/agents/x-coordination-protocol.md` | L4 | 1280 w / 192 l | 1278 / 186 | 2 w / 6 l |
  | `.claude/skills/kata-setup/SKILL.md` | L5 | 1280 w / 192 l | 1268 / 192 | 12 w / **0 l** |
  | `.claude/skills/kata-setup/references/github-app.md` | L6 | 768 w / 128 l | 680 / 114 | 88 w / 14 l |
  | `.claude/skills/kata-security-update/SKILL.md` | L5 | 1280 w / 192 l | 1216 / 177 | 64 w / 15 l |
  | `.claude/skills/kata-release-merge/SKILL.md` | L5 | 2304 w / 320 l | 1849 / 287 | 455 w / 33 l |

  Two checklist caps bind separately: `L7_MAX_ITEMS = 9` and
  `L7_MAX_WORDS_PER_ITEM = 32`. `kata-security-update`'s DO-CONFIRM block holds
  9 of 9 items, so it takes no more. Any new checklist item anywhere must run 32
  words or fewer.
- **Published-pack genericity.** `.claude/skills/kata-*/SKILL.md` and
  `.claude/agents/x-*.md` sync into installations. `.claude/skills/CLAUDE.md`
  § No monorepo leakage forbids this monorepo's package names, workflow names,
  and file paths there, and `skill-genericity.rules.mjs` enforces it.
  `temporal.rules.mjs` additionally rejects `spec 2330` anywhere under
  `.claude/**`. Its exclusions are root-anchored (`specs/**`, `references/**`,
  `wiki/**`), so a nested `.claude/skills/*/references/` directory is still in
  scope. Write both in generic form.
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
  `KATA_KILLSWITCH`. Part 02 step 1's verify runs the grep that success
  criterion 13 names.
- **JSDoc on every export.** `eslint.config.js` applies `jsdoc/require-jsdoc`
  with `publicOnly: true` to `libraries/**/*.js`, and `bun run check` runs it.
  Every exported function part 01 creates carries a JSDoc block with `@param`
  and `@returns`.
- **Test-gate floor.** `scripts/test-gate.mjs` requires the floor in
  `scripts/test-gate.floor.json` to move in the same change that moves the test
  population. It reads `{ "floor": 4611 }` today. Part 01 runs
  `bun run test:gate` and commits the printed value.
- **Ambient dependencies.** `libwatchdog` source reads no `Date.now`, no
  `new Date(...)` in any form, no `setTimeout`, and no `node:fs`. It takes
  `clock`, `fs`, and `request` by injection.
  `.jidoka/invariants/ambient-deps.rules.mjs` flags every `NewExpression` on
  `Date` regardless of its arguments. Its allow-list carries named
  `libraries/*/src/**` entries (`libutil/src/calendar.js`, `libui`,
  `libsyntheticgen`, and others), and `libwatchdog` is on neither it nor the
  monotone deny-list. Use `isoTimestamp` from
  `libraries/libutil/src/calendar.js`.

## Risks

| Risk | Detail |
| ---- | ------ |
| The installer falls through to npm | `fit-install.sh` `channels_for` returns `brew_gear release_gear npm` for any `gemba-*` name. A failed release download silently installs the npm launcher, which resolves the whole `@forwardimpact/gemba` closure the design rejected, inside a 5-minute timeout. Part 03 step 1 fails the step on the installer's own `(npm)` channel marker. |
| A full page of edited comments engages on a count under the threshold | `commentsProbe` filters `since` on `updated_at` and reports `covered: false` on a full page. One hundred comments merely edited inside the window therefore engage the killswitch while the created-in-window count sits far below 32. The threshold cannot tune this away, because coverage outranks it. |
| The comment counter has no baseline | spec.md § Threshold records no measured comment rate. The first busy review day can engage the killswitch on ordinary activity. Recalibrate after the first weeks, before it stops the team. |
| The App grant is operator-only and silent | Without `Variables: read & write` at repository scope and read at organization scope, the engage job exits 1 on the read or the write. That is a red run every 15 minutes with the brake absent, not a stopped team. Part 06 step 1 is the only place this can be fixed. |
| A large force-push trips the commits counter | `since` filters on committer date, so a rewrite that restamps 32 or more default-branch commits engages the killswitch. design-a.md § Interfaces names this as the intended fail-safe. |
| The action's two release pins move in lockstep or not at all | `gear-release` and `installer-sha256` name one release and that release's own `fit-install.sh` digest. Bumping either alone fails `sha256sum -c` and takes the brake down. Dependabot bumps no composite-action input default and no invariant guards the pair, so a CLI change needs a hand bump of both. This plan names no owner for that, and no follow-up issue exists. |
| The live write path never runs before it matters | Every unit test stubs the transport, and the engage job is gated on a real breach, so nothing in CI exercises `latch.write` against a real Actions variable. Part 05 step 3 proves it once, by hand, against a throwaway variable name. |
| Runs can overlap | A run is `assess` (≤5 min) then `engage` (≤5 min) plus GitHub's scheduled-dispatch delay, which can exceed the 15-minute interval under load. Two engage jobs racing is harmless: the second reads a truthy value and skips. The plan adds no `concurrency` group, because cancelling an in-flight engage would drop the write. |

## Clean break

The plan removes no path. The killswitch contract is the path the watchdog
uses. It adds no second brake, no second credential, no shim, and no fallback.
The truthy predicate gains one home in `libwatchdog/src/truthy.js` and no fifth
shell copy, so spec.md's exclusion on consolidating the four existing shell
copies still stands. No file gains a `KATA_KILLSWITCH` default outside
`.github/workflows/watchdog.yml`.
