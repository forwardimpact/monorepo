# Spec 2330: Repository Activity Watchdog

**Classification:** internal. Every changed surface lands under `.github/`,
`.claude/`, and `KATA.md`. Nothing lands under `products/`, `services/`, or
`websites/`, so the shared rubric's decision test classifies the change
internal
([work-definition.md § Product-aligned vs internal](../../.claude/agents/x-work-definition.md#product-aligned-vs-internal)).
The watchdog is this repository's own safety valve. It is not a `kata-*`
workflow, and `kata-setup` does not generate it.

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
| Pull requests created | 100 created between 2026-07-18T09:22Z and 2026-09-02T07:51Z, about 2.2 per day | 5 inside 2 minutes on 2026-08-21 (#2027 to #2031) |
| Default-branch commits | 22 between 2026-08-20 and 2026-09-02, about 1.7 per day | 6 in the 60 minutes from 2026-08-02 17:59Z, of which 5 landed inside 31 seconds |

The issue baseline understates the unsuppressed rate. `KATA_KILLSWITCH` held a
truthy value from 2026-08-31, so the last two days of that 30-day window carried
no scheduled agent work.

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
3. **A 15-minute schedule.** The window is four times the interval, so a
   breach stays observable across three missed runs. The watchdog also accepts
   a manual run.
4. **Engage only.** The watchdog sets the killswitch. It never clears it. Only
   a human clears it.
5. **Idempotent, and it yields after a human clears.** The watchdog writes
   nothing while the killswitch already holds a truthy value. It also writes
   nothing for one window after a human clears the switch, so the burst that
   caused the stop drains out of the window and the team resumes.
6. **Recorded reason.** The value the watchdog writes names the watchdog, the
   breached counter, the count, the threshold, and the time. The run also
   reports every count and the verdict on its own run summary, and the run
   fails so that it stands out red in the Actions list.
7. **Fail safe.** A counter the watchdog cannot read, or cannot cover for the
   whole window, engages the killswitch. Doubt stops the line. An unnecessary
   stop costs idle agent time until a human clears it. A silent watchdog costs
   an unbounded token spend.
8. **No agent, no repository data.** The watchdog runs no agent, installs no
   toolchain, and reads no data file from the repository. It checks out only
   its own action directory. Nothing an agent writes changes what the watchdog
   measures or decides.
9. **Not a `kata-*` workflow.** The watchdog does not gate on
   `KATA_KILLSWITCH`. It must keep running after it engages. Its name places it
   outside the `kata-*` family, so the "every `kata-*` workflow gates on the
   killswitch" contract stays true as written.
10. **Contained write credential.** The watchdog authenticates with a
    credential that is distinct from the Kata App and that carries no
    permission other than repository Metadata read and Variables read and
    write. Its secrets live in a GitHub Actions Environment restricted to the
    default branch, never as repository secrets, so a branch workflow cannot
    read them. This follows the isolation the repository already applies to
    the macOS signing material.
11. **Trust-sensitive surface.** A diff that touches the watchdog workflow or
    its action merges only on a trusted human's explicit signal, under the rule
    that already covers `.kata/` diffs.

**Thresholds.** Each threshold clears the largest legitimate batch the
repository produces on a normal day and stays below the recorded incident.

| Counter | Threshold per 60 minutes | Grounding |
| ------- | ------------------------ | --------- |
| Issues created | 25 | Above a full storyboard session, which files one obstacle issue and one experiment issue for each of 7 agent profiles, plus triage headroom. Below the observed peak of 31, so the 2026-09-02 burst engages. |
| Pull requests created | 25 | Above the largest scheduled batch the repository can produce: Dependabot may open 5 `github-actions` pull requests and 10 `bun` pull requests in one weekly run. About 270 times the steady-state rate. |
| Default-branch commits | 20 | Over 3 times the largest observed hour of 6, and about 12 times the daily steady state. |

No runaway has been recorded for pull requests or commits. Those two thresholds
therefore come from the legitimate ceiling plus headroom, not from an incident.
Recalibration follows the first engagement.

**Compatibility stance:** clean break. The watchdog replaces no existing path.
The killswitch contract is unchanged and gains one automatic writer.

## Scope

### Included

| Surface | Change |
| ------- | ------ |
| `.github/workflows/watchdog.yml` | New scheduled workflow. It carries the schedule, the three thresholds, the window, the concurrency group, the timeout, and the Environment that holds the write credential. |
| `.github/actions/watchdog/` | New local composite action with a README. It counts, compares, engages, and writes the run summary. |
| `KATA.md` § Killswitch | State that this repository also runs a watchdog that engages the variable automatically, name the three counters, and state that the watchdog itself does not gate on the variable. |
| `.github/CLAUDE.md` § Local composite actions | Add the `watchdog` row to the table of local actions. |
| `kata-release-merge` skill | Add the watchdog workflow and its action to the trust-sensitive path rule that already covers `.kata/`. |
| Repository configuration | A second GitHub App and a `watchdog` Actions Environment restricted to the default branch, holding the two App secrets. Documented in the action README. |

### Excluded

| Item | Why |
| ---- | --- |
| Cost, token, and agent-turn limits | The watchdog measures external evidence in the repository. Each LLM platform carries its own spend cap, configured there. |
| Comment-rate and branch-push counters | A chain that only comments, and a chain that only pushes to an existing branch, stay unmeasured. This is the known coverage gap and the first follow-up. The three counters named here are the deterministic contract this spec commits to. |
| Cancelling runs already in flight | The killswitch gates each workflow's first step. A session already past that step keeps working, so artifacts can still appear for up to the agent action's 45-minute timeout after engagement. Cancelling a live session needs a different mechanism. |
| Automatic clearing of the killswitch | A watchdog that clears its own stop can oscillate and hides the cause. Item 5 gives the human a quiet window instead. |
| Telling a legitimate burst from sprawl | The watchdog compares counts. It makes no judgment about who acted or why. The thresholds clear the known legitimate batches, and a human clears a false stop. |
| Author or actor filters on the counts | Total repository churn is the evidence. A filter adds a judgment the watchdog must make and gives sprawl a place to hide behind an identity. |
| Rollout to Kata installations through `kata-setup` | Every installation has its own baselines, and this repository has no engagement yet to calibrate against. Ship the mechanism here, observe it, then generalize. |
| Threshold selection through `.kata/settings.json` | That file configures skills that agents read. The watchdog must not depend on repository content. |
| An organization-scoped killswitch | The watchdog reads and writes the repository-scoped variable, which shadows an organization value. An installation that engages at organization scope is out of scope. |
| One shared home for the truthy predicate | The `""`/`0`/`false`/`no`/`off` test is already restated in four places. The watchdog adds a fifth. Consolidating all five is its own change. |
| Alerting to chat, email, or a paging service | The red run and the recorded reason carry the signal. Another delivery channel is another way for the watchdog to fail. The accepted cost is that an engagement between 03:00 and 08:00 Paris time waits for the morning. |

## Success criteria

| # | Claim | Verification |
| - | ----- | ------------ |
| 1 | The watchdog runs every 15 minutes and by hand. | `.github/workflows/watchdog.yml` carries a `schedule` trigger at a 15-minute interval and a `workflow_dispatch` trigger with a `dry-run` input. |
| 2 | The window is 60 minutes. | The workflow passes a 60-minute window to the action. No other window value appears. |
| 3 | The thresholds are fixed and reviewable in one file. | The three thresholds and the window appear as literal numbers in `.github/workflows/watchdog.yml`, and `rg -n 'watchdog' .github/workflows/ .github/actions/watchdog/` shows no second copy of any of them. |
| 4 | Any single breach engages the killswitch. | Three dry runs, one per counter with that counter's threshold lowered to 0, each report `engage` and name that counter. A dry run writes nothing. |
| 5 | An unreadable or uncovered counter engages the killswitch. | A dry run against a repository the credential cannot read reports `engage` with the reason `unreadable`. A counter whose first page is full and still inside the window reports `engage` with the reason `uncovered`. |
| 6 | The watchdog never clears the killswitch. | `.github/actions/watchdog/action.yml` holds exactly one call that writes the variable. Its value is always a non-empty reason string. No other call writes it. |
| 7 | An engaged killswitch stays untouched, and a cleared one gets a quiet window. | The action reads the variable first. It exits without a write when the value is truthy, and when the value is falsy and its `updated_at` is inside the window. |
| 8 | The reason is recorded and the run is red. | The written value names the watchdog, the breached counter, the count, the threshold, and the time. The run summary carries every count it obtained and the verdict. An engaging run exits non-zero. |
| 9 | The watchdog is outside the `kata-*` family and does not gate on the killswitch. | The workflow file does not match `.github/workflows/kata-*.yml`, it contains no killswitch gate step, and `bunx jidoka invariants` passes with no change to the `kata-workflows` enumeration topic. |
| 10 | The watchdog runs no agent and reads no repository data. | The workflow uses no `kata-agent` or `gemba-*` action. Its checkout is limited to `.github/actions/watchdog`. |
| 11 | The write credential is contained. | The workflow job declares the `watchdog` Environment. The action README documents the second App with repository Metadata read and Variables read and write, and no other permission. The Kata App permission table in `kata-setup` stays unchanged. |
| 12 | The watchdog surfaces are trust-sensitive. | `.claude/skills/kata-release-merge/SKILL.md` names `.github/workflows/watchdog.yml` and `.github/actions/watchdog/` in the same rule as `.kata/`, in both the checklist item and the prose that carries it. |
| 13 | Orientation is current. | `KATA.md` § Killswitch states the automatic writer, the three counters, and the exemption. `.github/CLAUDE.md` lists the `watchdog` local action. |
| 14 | Repository checks stay green. | `bun run check` passes. |
