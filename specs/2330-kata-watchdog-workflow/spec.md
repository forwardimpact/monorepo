# Spec 2330: Repository Activity Watchdog

**Classification:** product-aligned. The mechanism itself is repository CI under
`.github/`, but the change also corrects two pages under `websites/kata/` that
state the Kata killswitch contract without the `Kata` qualifier. The shared
rubric's decision test counts documentation of a product surface as
product-aligned
([work-definition.md § Product-aligned vs internal](../../.claude/agents/x-work-definition.md#product-aligned-vs-internal)).

**Persona and job:** Teams Using Agents → Run a Continuously Improving Agent
Team (Kata's Big Hire in [JTBD.md](../../JTBD.md)). The job names the anxiety
this spec answers: autonomy might amplify bad patterns faster than humans can
intervene.

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
| Issues created | 1 in the 30 days to 2026-09-01 (#2021) | 67 between 14:49Z and 21:34Z on 2026-09-02 (#2053 to #2119), peaking at 31 in the 60 minutes from 14:49Z |
| Pull requests created | The 100 most recently created all fall between 2026-07-18T09:22Z and 2026-09-02T07:51Z, so exactly 100 in those 46 days, about 2.2 per day | 5 inside 2 minutes on 2026-08-21 (#2027 to #2031) |
| Default-branch commits | 22 between 2026-08-20 and 2026-09-02, about 1.7 per day | 6 in the 60 minutes from 2026-08-02 17:59Z, of which 5 landed inside 31 seconds |

Every steady-state figure understates the unsuppressed rate. `KATA_KILLSWITCH`
held a truthy value from 2026-08-31, so the last two days of all three baseline
windows carried no scheduled agent work.

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

1. **Three counters over one window.** The watchdog counts commits on the
   default branch, pull requests created, and issues created, each within a
   60-minute window that ends at the run time.
2. **Fixed thresholds.** Each counter carries one threshold. A count that
   reaches or passes its threshold is a breach. Any one breach engages the
   killswitch. A reviewer reads the thresholds and the window in one file and
   changes them in that file alone.
3. **A 15-minute schedule.** The window is four times the interval, so a breach
   stays observable across three missed runs. The watchdog also accepts a
   manual run.
4. **Measurement and engagement are separate.** Measurement is read-only and
   holds no write credential. Engagement runs only after a breach. This keeps
   the privileged step off every quiet run and lets a measurement-only run
   execute from any branch.
5. **Engage only.** The watchdog sets the killswitch. It never clears it. Only
   a human clears it, by writing a falsy value. Deleting the variable is not
   clearing it, and the action README says so.
6. **Idempotent, and it yields after a human clears.** The watchdog writes
   nothing while the killswitch already holds a truthy value at either
   repository or organization scope. It also writes nothing for one window
   after a human clears it, so the burst that caused the stop drains out of the
   window and the team resumes.
7. **Recorded reason.** The value the watchdog writes names the watchdog, every
   breached counter with its count and threshold, and the time. Every run
   reports every count it obtained and the verdict on its own run summary. An
   engaging run fails, so it stands out red in the Actions list.
8. **Fail safe.** A counter the watchdog cannot read, or cannot cover for the
   whole window, engages the killswitch. Doubt stops the line. An unnecessary
   stop costs idle agent time until a human clears it. A silent watchdog costs
   an unbounded token spend. Retries inside the run absorb a transient failure
   before the fail-safe applies.
9. **No agent, no repository data.** The watchdog runs no agent, installs no
   toolchain, and reads no data file from the repository. It checks out only
   its own action directory.
10. **Not a `kata-*` workflow.** The watchdog does not gate on
    `KATA_KILLSWITCH`. It must keep running after it engages. Its name places it
    outside the `kata-*` family, so the "every `kata-*` workflow gates on the
    killswitch" contract stays true as written.
11. **Contained write credential.** The watchdog authenticates with a credential
    that is distinct from the Kata App and that carries no permission other than
    repository Metadata read and Variables read and write. Its secrets live in a
    GitHub Actions Environment restricted to the default branch, never as
    repository secrets. This follows the isolation the repository already
    applies to the macOS signing material.
12. **Trust-sensitive surfaces.** The watchdog's own workflow and action are
    repository content. Two controls guard them. The Environment restriction
    stops any workflow on a branch from minting the write token. The
    trust-sensitive merge rule that already covers `.kata/` extends to the
    watchdog paths, in both the ordinary merge gate and the Dependabot triage
    that maintains the action's pinned dependencies. The residual is the
    repository's known branch-protection gap, recorded in `wiki/MEMORY.md`,
    which lets a direct push to the default branch bypass both.
13. **Tested logic.** The counting, comparison, and reason-building logic sits
    in a script the repository test suite exercises against fixture payloads. A
    component that must not fail is not verified by review alone.

**Thresholds.** Each threshold clears the largest legitimate batch the
repository produces on a normal day. Only the issues threshold has a recorded
incident to sit below.

| Counter | Threshold per 60 minutes | Grounding |
| ------- | ------------------------ | --------- |
| Issues created | 25 | Above a full storyboard session, which files one obstacle issue and one experiment issue for each of 7 agent profiles, plus triage headroom. Below the observed peak of 31, so the 2026-09-02 burst engages. |
| Pull requests created | 25 | Above the largest scheduled batch the repository can produce: one weekly Dependabot run may open 10 `bun` pull requests plus `github-actions` pull requests up to GitHub's default limit of 5. About 270 times the steady-state rate. |
| Default-branch commits | 25 | Above the 15 squash merges a security-update session produces from that same Dependabot batch. Over 4 times the largest observed hour of 6, and about 15 times the daily steady state. |

No runaway has been recorded for pull requests or commits. Those two thresholds
therefore come from the legitimate ceiling plus headroom. Recalibration follows
the first engagement.

**Compatibility stance:** clean break. The watchdog replaces no existing path.
The killswitch contract is unchanged and gains one automatic writer.

## Scope

### Included

| Surface | Change |
| ------- | ------ |
| `.github/workflows/watchdog.yml` | New scheduled workflow. It carries the schedule, the three thresholds, the window, the manual inputs, and the two jobs: a read-only measurement job and an engagement job that declares the `watchdog` Environment. |
| `.github/actions/watchdog/` | New local composite action: `action.yml`, the logic script it runs, and a README that documents the credential, the Environment boundary, the thresholds, and the clearing rule. |
| `tests/` | A test that drives the logic script against fixture payloads: each counter over threshold, unreadable, uncovered, quiet, already engaged, and cleared inside the window. |
| `KATA.md` § Killswitch | State that this repository also runs a watchdog that engages the variable automatically, name the three counters, and state that the watchdog itself does not gate on the variable. |
| `.github/CLAUDE.md` § Local composite actions | Add the `watchdog` row to the table of local actions. |
| `kata-release-merge` and `kata-security-update` skills | Add the watchdog workflow and action paths to the trust-sensitive rule that already covers `.kata/`. The merge gate carries it in both of its homes. The security-update skill needs it because Dependabot pull requests against `.github/actions/*` route around the merge gate. |
| `websites/kata/docs/continuous-improvement/index.md`, `websites/kata/docs/getting-started/index.md` | Qualify the two unqualified "every workflow" claims as "every Kata workflow", which is what they already mean and what the other two homes already say. |
| Repository configuration | A second GitHub App and a `watchdog` Actions Environment restricted to the default branch, holding the two App secrets. |

### Excluded

| Item | Why |
| ---- | --- |
| Cost, token, and agent-turn limits | The watchdog measures external evidence in the repository. Each LLM platform carries its own spend cap, configured there. |
| Comment-rate and branch-push counters | A chain that only comments, and a chain that only pushes to an existing branch, stay unmeasured. This is the known coverage gap and a follow-up. The three counters named here are the deterministic contract this spec commits to. |
| Cancelling runs already in flight | The killswitch gates each workflow's first step. `kata-shift` and `kata-dispatch` both pass `timeout-minutes: "300"`, so a session already past that step can keep creating artifacts for up to 300 minutes after engagement, plus up to 15 minutes of detection lag. Closing that gap needs `actions: write` on the workflow token and a run-cancelling step. It is the highest-value follow-up. |
| Automatic clearing of the killswitch | A watchdog that clears its own stop can oscillate and hides the cause. Item 6 gives the human a quiet window instead. |
| Telling a legitimate burst from sprawl | The watchdog compares counts. It makes no judgment about who acted or why. The thresholds clear the known legitimate batches, and a human clears a false stop. |
| Author or actor filters on the counts | Total repository churn is the evidence. A filter adds a judgment the watchdog must make and gives sprawl a place to hide behind an identity. |
| Rollout to Kata installations through `kata-setup` | Every installation has its own baselines, and this repository has no engagement yet to calibrate against. Ship the mechanism here, observe it, then generalize. No installation gains a non-gating workflow from this change. |
| Threshold selection through `.kata/settings.json` | That file configures skills that agents read. The watchdog must not depend on repository content. |
| Engaging at organization scope | The watchdog reads both scopes so an organization-scope stop suppresses it, but it writes the repository-scoped variable only. |
| One shared home for the truthy predicate | The `""`/`0`/`false`/`no`/`off` test is already restated in four places. The watchdog adds a fifth. Consolidating all five is its own change. |
| Refreshing the stale local-action table | `.github/CLAUDE.md` lists 7 of the 11 directories under `.github/actions/` and no invariant guards it. This change adds its own row. Completing and guarding the table is a separate devex change. |
| A dedicated alerting channel | The red run and the recorded reason carry the signal, alongside whatever notification GitHub already sends for a failed scheduled run. Another delivery channel is another way for the watchdog to fail. The accepted cost is that an engagement between 03:00 and 08:00 Paris time may wait for the morning. |

## Success criteria

| # | Claim | Verification |
| - | ----- | ------------ |
| 1 | The watchdog runs every 15 minutes and by hand. | `.github/workflows/watchdog.yml` carries a `schedule` trigger at a 15-minute interval and a `workflow_dispatch` trigger. |
| 2 | The window is 60 minutes and appears once. | `rg -n '60' .github/workflows/watchdog.yml` shows one window value, and the action declares no default for it. |
| 3 | The thresholds are fixed and reviewable in one file. | The three thresholds appear as literal numbers in `.github/workflows/watchdog.yml`. The action declares the threshold inputs required and default-free, so no second copy exists. |
| 4 | Any single breach engages the killswitch. | The test suite drives the logic script with each counter over its threshold in turn and asserts an engage verdict naming that counter. |
| 5 | An unreadable or uncovered counter engages the killswitch. | The test suite drives the logic script with a failed counter response and with a response that cannot cover the window, and asserts an engage verdict with the reason `unreadable` or `uncovered`. |
| 6 | The watchdog never clears the killswitch. | The logic script has one code path that writes the variable. Every write it makes carries a non-empty reason string. The test suite asserts no path produces a falsy value. |
| 7 | An engaged killswitch stays untouched, and a cleared one gets a quiet window. | The engagement job reads the repository variable and the organization variables first. It writes nothing when either value is truthy, and nothing when the repository value is falsy and its `updated_at` is inside the window. The test suite covers both. |
| 8 | The reason is recorded and the run is red. | The written value names the watchdog, every breached counter with its count and threshold, and the time. The run summary carries every count obtained and the verdict. An engaging run exits non-zero. |
| 9 | The watchdog is outside the `kata-*` family and does not gate on the killswitch. | The workflow file does not match `.github/workflows/kata-*.yml`, it contains no killswitch gate step, and `bunx jidoka invariants` passes with no change to the `kata-workflows` enumeration topic. |
| 10 | The watchdog runs no agent and reads no repository data. | The workflow uses no `kata-agent` or `gemba-*` action. Its checkout is limited to `.github/actions/watchdog`. |
| 11 | The write credential is contained. | Only the engagement job declares the `watchdog` Environment. The Environment is restricted to the default branch and holds both App secrets, and neither name exists as a repository secret (`gh secret list`). The README documents the App's two permissions. The Kata App permission table in `kata-setup` stays unchanged. |
| 12 | The watchdog surfaces are trust-sensitive on both routes. | `.claude/skills/kata-release-merge/SKILL.md` names `.github/workflows/watchdog.yml` and `.github/actions/watchdog/` in both the checklist item and the prose that carries the `.kata/` rule. `.claude/skills/kata-security-update/SKILL.md` names the same paths for Dependabot pull requests. |
| 13 | Orientation is current. | `KATA.md` § Killswitch states the automatic writer, the three counters, and the exemption. `.github/CLAUDE.md` lists the `watchdog` local action. Neither of the two Kata pages carries an unqualified "every workflow" claim. |
| 14 | Repository checks stay green. | `bun run check` and `bun run test` pass. |
