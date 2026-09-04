# Spec 2330: Repository Activity Watchdog

**Classification:** product-aligned. The brake ships as Gemba platform surface:
a new `libwatchdog` library, a seventh `gemba-*` command, a published composite
action, and a guide on `www.gemba.team`. Only the schedule and the thresholds
stay as repository CI under `.github/`. The change also corrects two pages under
`websites/kata/` that state the Kata killswitch contract without the `Kata`
qualifier
([work-definition.md § Product-aligned vs internal](../../.claude/agents/x-work-definition.md#product-aligned-vs-internal)).

**Persona and job:** Teams Using Agents → Run a Continuously Improving Agent
Team (Kata's Big Hire in [JTBD.md](../../JTBD.md)). The job names the anxiety
this spec answers: autonomy might amplify bad patterns faster than humans can
intervene. Gemba's Big Hire, Stand Up and Operate an Agent Team, carries the
brake, because every team that runs agents in CI meets the same event chain.

## Problem

The Kata team can enter a self-sustaining event chain. `kata-dispatch` fires on
`issues`, `issue_comment`, `pull_request_target`, and `pull_request_review`. An
agent run answers an event with a comment, an issue, or a pull request. That
output is itself one of the four trigger classes, so it fires the next run. The
concurrency group is keyed per artifact, so a chain that creates new artifacts
creates new groups and the runs proceed in parallel rather than queueing behind
each other.

Deterministic brakes exist, and none of them bounds the total volume. The
dispatcher narrows `labeled` to `agent:*` and `*:approved`, restricts `closed`
to `merged: true`, and omits the review-comment trigger. Each of those bounds
which events count. None bounds how many artifacts a chain may create. The only
brake on volume is a prose recursion guard inside the task text, which an agent
interprets. The stop condition on volume is therefore a model judgment.

The repository holds evidence of the resulting sprawl. Each figure below comes
from a typed GitHub query, not from a number range: issues from an issues-only
listing, pull requests from a pull-requests-only listing, commits from the
default-branch commit listing.

| Signal | Steady state | Observed burst |
| ------ | ------------ | -------------- |
| Issues created | 1 in the 30 days to 2026-09-01 (#2021) | 67 between 14:49Z and 21:34Z on 2026-09-02 (#2053 to #2119), of which 47 fell inside the 2 hours from 14:49Z |
| Pull requests created | The 100 most recently created all fall between 2026-07-18T09:22Z and 2026-09-02T07:51Z, so exactly 100 in those 46 days, about 2.2 per day | 5 inside 2 minutes on 2026-08-21 (#2027 to #2031) |
| Default-branch commits | 22 between 2026-08-20 and 2026-09-02, about 1.7 per day | 6 in the 60 minutes from 2026-08-02 17:59Z, of which 5 landed inside 31 seconds |
| Comments | Not measured. The issue listings expose a comment count of 0 or 1 on every issue in the corpus, which does not describe pull-request threads | Not measured |

Every steady-state figure understates the unsuppressed rate. `KATA_KILLSWITCH`
held a truthy value from 2026-08-31, so the last two days of all three measured
baseline windows carried no scheduled agent work.

Each event in a chain starts a fresh agent session. Each session loads its
profile, its skills, and its memory before it does any work. The token cost
therefore grows with the length of the chain, and the chain has no fixed bound.

A killswitch already exists. `KATA_KILLSWITCH` is a repository or organization
Actions variable that every `kata-*` workflow reads as its first step. A truthy
value stops every surface from starting new work. Nothing sets the variable. A
human must notice the sprawl, open the repository settings, and set it by hand.
Between 03:00 and 08:00 Paris time the scheduled shift and the storyboard both
run, and no human watches.

The upstream platform limits do not close this gap. A spend cap on the LLM
platform stops billing after the tokens are spent. It does not stop the event
chain, and it reports no repository-level evidence.

## Proposal

A scheduled watchdog measures repository activity and engages the existing
killswitch when the activity crosses a fixed threshold.

1. **Four counters over one window.** The watchdog counts commits on the default
   branch, pull requests created, issues created, and comments created, each
   within a 2-hour window that ends at the run time. Comments cover issue and
   pull-request conversation comments, which is the `issue_comment` trigger
   surface.
2. **One threshold, 32.** Every counter carries the same threshold. A count that
   reaches or passes 32 is a breach. Any one breach engages the killswitch. A
   reviewer reads the threshold and the window in one file and changes them in
   that file alone.
3. **A 15-minute schedule.** The window is eight times the interval, so a breach
   stays observable across seven missed runs. The watchdog also accepts a manual
   run.
4. **Measurement and engagement are separate.** Measurement is read-only and
   mints no App token. Engagement runs only after a breach. This keeps the
   privileged step off every quiet run and lets a measurement-only run execute
   from any branch.
5. **Engage only.** The watchdog sets the killswitch. It never clears it. Only a
   human clears it, by writing a falsy value. Deleting the variable is not
   clearing it, and the action README says so.
6. **Idempotent, and it yields after a human clears.** The watchdog writes
   nothing while the effective killswitch value is truthy, resolved the way
   every `kata-*` gate resolves it: the repository variable when it exists, and
   the organization variable otherwise. It also writes nothing for one window
   after a human clears the repository variable, so the burst that caused the
   stop drains out of the window and the team resumes. Clearing by deleting the
   variable, or at organization scope, leaves no timestamp and gets no quiet
   window, so every home that documents the killswitch tells the operator to
   write a falsy value instead.
7. **Recorded reason.** The value the watchdog writes names the watchdog, every
   breached counter with its count and threshold, and the time. Every run
   reports every count it obtained and the verdict on its own run summary. An
   engaging run fails, so it stands out red in the Actions list.
8. **Fail safe.** A counter the watchdog cannot read, or cannot cover for the
   whole window, engages the killswitch. Doubt stops the line. An unnecessary
   stop costs idle agent time until a human clears it. A silent watchdog costs
   an unbounded token spend. Retries inside the run absorb a transient failure
   before the fail-safe applies.
9. **No agent, no repository data.** The watchdog runs no agent and reads
   nothing from the repository. It never checks the repository out. It installs
   one pinned, SHA-verified CLI binary and no toolchain.
10. **Not a `kata-*` workflow.** The watchdog does not gate on
    `KATA_KILLSWITCH`. It must keep running after it engages. Its name places it
    outside the `kata-*` family, so the "every `kata-*` workflow gates on the
    killswitch" contract stays true as written.
11. **One credential, scoped to variables.** The watchdog authenticates with the
    existing Kata App. That App gains `Variables: read & write` at repository
    scope and read access at organization scope, because the effective value
    spans both. It gains no `Secrets` permission, so the same credential that
    halts the team can never read or write a secret. The killswitch is an
    Actions variable today in every workflow, action, and setup template, which
    is what makes this scoping possible. The operator registers and rotates one
    App, not two.
12. **The containment is a gate, not a permission boundary.** Agent sessions run
    under that same Kata App token, so an agent that calls the variables API can
    clear the switch that stopped it. Three controls stand against that, and
    none is a permission boundary: the agent skills state that no agent writes
    the killswitch; the trust-sensitive merge rule that already covers `.kata/`
    extends to all four watchdog paths, in both the merge gate and the
    Dependabot triage; and the run summary of every watchdog run records the
    variable's current value, so an unexplained clear is visible within 15
    minutes. Moving the logic into a published library widens that review
    surface and adds no new route, because the action pins one exact CLI
    version, so a release alone changes nothing CI runs. The residual is
    deliberate and stated: this brake is robust against an agent chain that is
    not trying to defeat it, not against one that is.
13. **Tested logic.** The counting, comparison, and reason-building logic sits
    in a library the test suite exercises against fixture payloads. A component
    that must not fail is not verified by review alone.
14. **Platform surface, not CI glue.** A generic `libwatchdog` library holds the
    guardrail engine. A thin `gemba-watchdog` CLI wires it to argv. A published
    `gemba-watchdog` composite action runs the CLI in CI. Every tenant-specific
    value, the killswitch variable name included, arrives as an input, so the
    platform names no tenant and any installation can pin the same brake. The
    library's seams are rule, probe, latch, and policy, so the next guardrail
    adds a rule set and a probe instead of a second script.

**Threshold.** One number, 32 per 2-hour window, on every counter. It clears the
largest legitimate batch the repository produces and sits below the recorded
incident.

| Counter | Largest legitimate batch | Headroom to 32 |
| ------- | ------------------------ | -------------- |
| Issues created | About 14 from a full storyboard session, which files one obstacle issue and one experiment issue for each of 7 agent profiles | 18, and the 2026-09-02 burst of 47 in 2 hours engages |
| Pull requests created | Up to 15 from one weekly Dependabot run: 10 `bun` plus `github-actions` up to GitHub's default limit of 5 | 17, and about 175 times the steady-state rate |
| Default-branch commits | Up to 15 squash merges from a security-update session clearing that same batch | 17, and over 2.5 times the largest observed hour of 6 |
| Comments | Not measured | Unknown. The comment threshold is the one counter with no baseline behind it. Recalibrate it after the first weeks of observation, before it stops the team on a busy review day. |

## Scope

### Included

| Surface | Change |
| ------- | ------ |
| `.github/workflows/watchdog.yml` | New scheduled workflow. It carries the schedule, the threshold, the window, the killswitch variable name, the manual inputs, and two jobs: a read-only measurement job and an engagement job that mints the Kata App token. |
| `libraries/libwatchdog/` | New import-only library: the guardrail engine, the four GitHub activity probes, the Actions-variable latch, the latch policy, the reason grammar, the truthy predicate, and the run-summary renderer. |
| `products/gemba/bin/gemba-watchdog.js` | New CLI, the seventh `gemba-*` command. Two subcommands, `assess` and `engage`. It holds the command definition and the exit-code wiring, and no guardrail logic. |
| `products/gemba/actions/gemba-watchdog/` | New composite action, published to `forwardimpact/gemba-watchdog` by the subtree split: `action.yml`, `LICENSE`, and a README that documents the credential scope, the threshold grounding, the clearing rule, and the containment residual. |
| `launchers/gemba-watchdog/` | The launcher package that makes `npx gemba-watchdog` resolve, as the `public-cli-set` invariant computes for every public CLI. External users reach the CLI that way. CI installs the compiled binary instead. |
| `build/cli-manifest.json`, `.github/workflows/publish-actions.yml` | The manifest gains `gemba-watchdog` in the `gear` bundle, so the binary compiles and ships. The publish workflow gains a `paths:` entry and a matrix entry, so the sibling action publishes. Both lists name every member explicitly. |
| `libraries/CLAUDE.md` | The runtime-command list and the `www.gemba.team` citation list each gain `libwatchdog`, so the seventh command and its guide match the stated convention. |
| The killswitch operator contract | Four homes carry a resume instruction the rule cannot honour. `KATA.md` and `kata-setup`'s SKILL.md say "unset it". Two `websites/kata/` pages say "clear it", which reads either way. Each becomes "write a falsy value". The `kata-agent` action prose also drops its unqualified "every workflow" claim. |
| `libraries/libwatchdog/test/` | Tests that drive the engine against fixture payloads: each counter over threshold, unreadable, uncovered, quiet, already engaged, and cleared inside the window. |
| `.claude/skills/gemba-watchdog/SKILL.md`, `.claude/skills/gemba/SKILL.md` | The new skill is the third progressive-documentation artifact beside the guide and the CLI `--help`. The composing Gemba skill gains the guard step. |
| `websites/gemba/docs/guard-activity/index.md`, `websites/gemba/docs/index.md` | New task guide for the job: the counters, the threshold and window, the latch contract, the clearing rule, the CI wiring, and the exit codes. The docs index gains one card for it. |
| `websites/gemba/index.md`, `websites/gemba/llms.txt` | The loop gains a sixth step, `Guard`. The command count moves from five to six, and the published-action count from four to five. |
| `kata-setup` GitHub App reference | The Kata App permission table gains `Variables: read & write`. The page states that the App holds no `Secrets` permission and why. |
| `kata-setup` SKILL.md | The setup report names the variables permission and the reason for it. |
| Agent skills that write to GitHub | One rule: no agent writes `KATA_KILLSWITCH`. Only a human clears it, and only the watchdog sets it. |
| `KATA.md` § Killswitch | State that this repository also runs a watchdog that engages the variable automatically, name the four counters, and state that the watchdog itself does not gate on the variable. |
| `.github/CLAUDE.md` § Third-party actions, and the generated tables | Add the `gemba-watchdog` row to the sibling-action table, then reseed the `sibling-composite-actions` fences in `CLAUDE.md`, `KATA.md`, and `.github/CLAUDE.md`. Regenerate the library catalog and count with `bun run context:fix`. |
| `kata-release-merge` and `kata-security-update` skills | Add the four watchdog paths (workflow, action, CLI bin, library) to the trust-sensitive rule that already covers `.kata/`. The merge gate carries it in both of its homes. The security-update skill needs it because Dependabot pull requests against the action route around the merge gate. |
| `websites/kata/docs/continuous-improvement/index.md`, `websites/kata/docs/getting-started/index.md` | Qualify the two unqualified "every workflow" claims as "every Kata workflow", which is what they already mean and what the other two homes already say. |

### Excluded

| Item | Why |
| ---- | --- |
| Cost, token, and agent-turn limits | The watchdog measures external evidence in the repository. Each LLM platform carries its own spend cap, configured there. |
| A second GitHub App, or an Actions Environment for the write credential | Either would make the containment a permission boundary rather than a gate. The operator chose one App and one rotation over that isolation, with the residual in item 12 accepted. |
| Inline pull-request review comments | They are not a `kata-dispatch` trigger, and one review panel legitimately posts many, so counting them would stop the team on ordinary review activity. The comment counter covers conversation comments only. |
| Branch-push counters | A chain that only pushes to an existing branch stays unmeasured. Its work reaches the default branch through a pull request, which the pull-request counter sees. |
| Cancelling runs already in flight | Accepted. The killswitch gates each workflow's first step. `kata-shift` and `kata-dispatch` both pass `timeout-minutes: "300"`, so a session already past that step can keep creating artifacts for up to 300 minutes after engagement, plus up to 15 minutes of detection lag. The watchdog stops the next run, not the current one. |
| Automatic clearing of the killswitch | A watchdog that clears its own stop can oscillate and hides the cause. Item 6 gives the human a quiet window instead. |
| Telling a legitimate burst from sprawl | The watchdog compares counts. It makes no judgment about who acted or why. The threshold clears the known legitimate batches, and a human clears a false stop. |
| Author or actor filters on the counts | Total repository churn is the evidence. A filter adds a judgment the watchdog must make and gives sprawl a place to hide behind an identity. |
| Rollout of the watchdog workflow to installations through `kata-setup` | Every installation has its own baselines, and this repository has no engagement yet to calibrate against. The App permission change, the published action, and the guide reach installations. No `kata-setup` template emits the workflow yet. |
| Threshold selection through `.kata/settings.json` | That file configures skills that agents read. The watchdog must not depend on repository content. |
| Engaging at organization scope | The watchdog reads both scopes so an organization-scope stop suppresses it, but it writes the repository-scoped variable only. |
| One shared home for the truthy predicate | The `""`/`0`/`false`/`no`/`off` test is already restated in four shell places. `libwatchdog` gives it one JavaScript home and adds no fifth shell copy. Consolidating the four shell copies is its own change. |
| Refreshing the stale local-action table | `.github/CLAUDE.md` lists 7 of the 11 directories under `.github/actions/` and no invariant guards it. This change adds no row there, because the watchdog action is published rather than local. Completing and guarding that table is a separate devex change. |
| Reworking the other four `gemba-*` commands onto the new library | `libwatchdog` is new surface. The existing commands carry no guardrail logic to move into it. |
| A second guardrail on top of the new seams | The library ships the seams the next guardrail needs. It ships one rule set, the four activity counters this spec grounds. |
| A dedicated alerting channel | The red run and the recorded reason carry the signal, alongside whatever notification GitHub already sends for a failed scheduled run. Another delivery channel is another way for the watchdog to fail. The accepted cost is that an engagement between 03:00 and 08:00 Paris time may wait for the morning. |

## Success criteria

| # | Claim | Verification |
| - | ----- | ------------ |
| 1 | The watchdog runs every 15 minutes and by hand. | `.github/workflows/watchdog.yml` carries a `schedule` trigger at a 15-minute interval and a `workflow_dispatch` trigger. |
| 2 | The window is 2 hours and the threshold is 32, each written once. | Both appear as literal numbers in `.github/workflows/watchdog.yml`, and the action declares the two inputs required and default-free, so no second copy exists. |
| 3 | Four counters are measured. | `libwatchdog` counts default-branch commits, pull requests created, issues created, and issue and pull-request conversation comments created, each against the same cutoff. |
| 4 | Any single breach engages the killswitch. | The test suite drives the engine with each counter over the threshold in turn and asserts an engage verdict naming that counter. |
| 5 | An unreadable or uncovered counter engages the killswitch. | The test suite drives the engine with a failed probe and with a response that cannot cover the window, and asserts an engage verdict with the reason `unreadable` or `uncovered`. |
| 6 | The watchdog never clears the killswitch. | The library has one code path that writes the latch. Every write carries a non-empty reason string. The test suite asserts no path produces a falsy value. |
| 7 | An engaged killswitch stays untouched, and a cleared one gets a quiet window. | `gemba-watchdog engage` reads the repository variable, then pages the organization listing. It writes nothing when the effective value is truthy, and nothing when the repository value is falsy and its `updated_at` is inside the window. The test suite covers both, plus the case a truthy organization variable under a falsy repository variable engages, because the team is still running. |
| 8 | The reason is recorded and the run is red. | The written value names the watchdog, every breached counter with its count and threshold, and the time. The run summary carries every count obtained, the killswitch's current value, and the verdict. An engaging run exits non-zero. |
| 9 | The watchdog is outside the `kata-*` family and does not gate on the killswitch. | The workflow file does not match `.github/workflows/kata-*.yml`, it contains no killswitch gate step, and `bunx jidoka invariants` passes with no change to the `kata-workflows` enumeration topic. |
| 10 | The watchdog runs no agent and reads no repository data. | The workflow uses no agent-running action and no `actions/checkout` step. The action installs the CLI as a pinned, SHA-verified binary, so no dependency tree resolves at run time. |
| 11 | The credential is scoped to variables and excludes secrets. | The `kata-setup` GitHub App permission table carries `Variables: read & write` and no `Secrets` row, and states why. The watchdog uses `secrets.KATA_APP_ID` and `secrets.KATA_APP_PRIVATE_KEY`, so no new secret is added. |
| 12 | The containment is stated, not implied. | The agent skills that write to GitHub carry the "no agent writes `KATA_KILLSWITCH`" rule. `.claude/skills/kata-release-merge/SKILL.md` names the four watchdog paths in both the checklist item and the prose that carries the `.kata/` rule, and `.claude/skills/kata-security-update/SKILL.md` names them for Dependabot pull requests. The action README states the residual. |
| 13 | The brake is platform surface, and it names no tenant. | `libwatchdog` and the CLI contain no occurrence of `KATA_KILLSWITCH`, and the variable name reaches the CLI as a required option. `libraries/libwatchdog/` ships `package.json` metadata, a README, `src/`, and `test/`. `products/gemba/package.json` declares the bin and the dependency. The guide, the skill, and the CLI `documentation` array carry the same entry. |
| 14 | Orientation is current. | `KATA.md` § Killswitch states the automatic writer, the four counters, and the exemption. `.github/CLAUDE.md` lists `gemba-watchdog` among the published actions. The Gemba site names the sixth loop step. Neither of the two Kata pages carries an unqualified "every workflow" claim. |
| 15 | Repository checks stay green. | `bun run check`, `bun run test`, and `bunx jidoka invariants` pass, including `public-cli-set` and `enumeration-drift`. |
