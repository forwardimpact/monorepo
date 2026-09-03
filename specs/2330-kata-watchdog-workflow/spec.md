# Spec 2330: Kata Watchdog Workflow

**Classification:** internal. Every changed surface lands under `.github/`,
`.claude/`, `.jidoka/`, and `KATA.md`. Nothing lands under `products/` or
`services/`. The shared rubric's decision test therefore classifies the change
internal
([work-definition.md § Product-aligned vs internal](../../.claude/agents/x-work-definition.md#product-aligned-vs-internal)).

**Persona and job:** Teams Using Agents → Run a Continuously Improving Agent
Team (Kata's Big Hire in [JTBD.md](../../JTBD.md)). The job names the anxiety
this spec answers: autonomy might amplify bad patterns faster than humans can
intervene.

## Problem

The Kata team can enter a self-sustaining event chain. `kata-dispatch` fires on
`issues`, `issue_comment`, `pull_request_target`, and `pull_request_review`.
An agent run answers an event with a comment, an issue, or a pull request. That
output is itself one of the four trigger classes. The output therefore fires the
next run. The per-artifact concurrency group sets `cancel-in-progress: false`,
so simultaneous events stack instead of coalescing. The only brake is a prose
recursion guard inside the task text. An agent interprets that guard. The stop
condition is therefore a model judgment, and no deterministic limit exists.

The repository holds evidence of the resulting sprawl.

| Signal | Steady state | Observed burst |
| ------ | ------------ | -------------- |
| Issues created | 3 in the 30 days to 2026-09-01 (#1978, #1979, #2021) | 67 in under 7 hours on 2026-09-02 (#2053 at 14:49Z to #2119 at 21:34Z), peaking at 31 in the 60 minutes from 14:49Z |
| Pull requests created | About 2.2 per day across #1950 to #2052 (2026-07-18 to 2026-09-02) | 5 inside 2 minutes on 2026-08-21 (#2027 to #2031) |
| Default-branch commits | About 1.6 per day between 2026-08-20 and 2026-09-02 | 2 in one hour |

Each event in a chain starts a fresh agent session. Each session loads its
profile, its skills, and its memory before it does any work. The token cost
therefore grows with the length of the chain, and the chain has no fixed end.

A killswitch already exists. `KATA_KILLSWITCH` is a repository Actions variable
that every `kata-*` workflow reads as its first step. A truthy value halts every
surface at once. Nothing sets the variable. A human must notice the sprawl, open
the repository settings, and set it by hand. Between 03:00 and 08:00 Paris time
the scheduled shift and the storyboard both run, and no human watches.

The upstream platform limits do not close this gap. A spend cap on the LLM
platform stops billing after the tokens are spent. It does not stop the event
chain, and it reports no repository-level evidence.

## Proposal

A scheduled watchdog workflow measures repository activity and engages the
existing killswitch when the activity crosses a fixed threshold.

1. **Three counters over one window.** The watchdog counts commits on the
   default branch, pull requests created, and issues created, each within a
   fixed lookback window that ends at the run time.
2. **Fixed thresholds.** Each counter carries one threshold. A count that
   reaches or passes its threshold is a breach. Any one breach engages the
   killswitch. The thresholds and the window are values a reviewer reads in the
   workflow, not values an agent computes.
3. **Frequent schedule.** The watchdog runs on a schedule several times per
   hour. The window is several multiples of the interval, so a delayed or
   skipped run still observes a breach on a later run.
4. **Engage only.** The watchdog sets the killswitch. It never clears it. Only
   a human clears it, after the human understands the cause.
5. **Idempotent.** A killswitch that already holds a truthy value stays
   untouched. The watchdog preserves a reason a human wrote.
6. **Recorded reason.** The value the watchdog writes names the watchdog, the
   breached counter, the count, the threshold, and the time. The run also
   reports the three counts and the verdict on its own run summary.
7. **Fail safe.** A counter the watchdog cannot read after its bounded retries
   engages the killswitch. Doubt stops the line. A silent watchdog is worse than
   an early stop, because a human clears an early stop in seconds.
8. **No agent, no repository code.** The watchdog runs no agent, needs no
   checkout, and needs no repository toolchain. Nothing inside the repository
   changes what the watchdog measures or decides.
9. **Exempt from the killswitch it sets.** The watchdog is the one `kata-*`
   workflow that does not gate on `KATA_KILLSWITCH`. It must keep running after
   it engages, so a later run confirms the state.
10. **Separate write credential.** The watchdog authenticates with a credential
    that is distinct from the Kata agent credential and that carries no
    permission other than the two it needs: read repository metadata, and write
    Actions variables. No agent run may hold a credential that can clear the
    killswitch.
11. **Trust-sensitive surface.** A diff that touches the watchdog workflow
    merges only on a trusted human's explicit signal, under the rule that
    already covers `.kata/` diffs.

**Thresholds.** The defaults sit above every observed steady-state peak and
below the observed burst.

| Counter | Threshold per 60 minutes | Grounding |
| ------- | ------------------------ | --------- |
| Issues created | 20 | 6.7 times the whole 30-day steady-state count; below the observed peak of 31, so the 2026-09-02 burst engages |
| Pull requests created | 12 | 2.4 times the largest observed burst of 5 |
| Default-branch commits | 20 | 10 times the largest observed hour of 2 |

**Compatibility stance:** clean break is not applicable in the removal sense.
The spec adds a surface and removes none. The existing killswitch contract
stays exactly as it is, and the watchdog is one more writer of the same
variable.

## Scope

### Included

| Surface | Change |
| ------- | ------ |
| `.github/workflows/kata-watchdog.yml` | New scheduled workflow. It counts, compares, and engages. It carries the thresholds and the window as reviewable values. |
| `KATA.md` § Killswitch | State that the watchdog engages the variable automatically, name the three counters, and record the watchdog's exemption from the killswitch gate. |
| `kata-setup` skill and a new workflow template reference | Generate the watchdog for a new installation. State the second credential and its two permissions. Carve the watchdog out of the "every generated workflow gates on the killswitch" checklist item. |
| `kata-setup` GitHub App reference | Document the watchdog credential: its permissions, why it stays separate from the Kata App, and the secrets it needs. |
| `kata-release-merge` skill | Add the watchdog workflow to the trust-sensitive path rule that already covers `.kata/`. |
| `enumeration-drift` invariant topic `kata-workflows` | Exclude the watchdog from the PDSA workflow table the topic checks, as `kata-interview.yml` is already excluded. |
| Kata website getting-started page | State that the watchdog exists and what it does. |

### Excluded

| Item | Why |
| ---- | --- |
| Cost, token, and agent-turn limits | The spec measures external evidence in the repository. Each LLM platform carries its own spend cap, configured there. |
| Comment-rate and branch-push counters | The three named counters miss a chain that only comments, and a chain that only pushes to an existing branch. Each needs its own measurement and its own baseline. Add them once the three counters prove out. |
| Automatic clearing of the killswitch | A watchdog that clears its own stop can oscillate. A human owns the resume decision. |
| Per-agent or per-workflow throttling | A narrower brake needs a model of which agent caused the sprawl. The killswitch already halts every surface with one value. |
| Author or actor filters on the counts | Total repository churn is the evidence. A filter adds a judgment the watchdog must make and a way for the sprawl to hide behind an identity. |
| Threshold selection through `.kata/settings.json` | That file configures skills that agents read. The watchdog runs no agent and must not depend on repository content. |
| Alerting to chat, email, or a paging service | The run summary, the recorded reason, and the failed run status carry the signal. Another delivery channel is another way for the watchdog to fail. |

## Success criteria

| # | Claim | Verification |
| - | ----- | ------------ |
| 1 | The watchdog runs on a frequent schedule. | `.github/workflows/kata-watchdog.yml` carries a `schedule` trigger at an interval of 15 minutes or less, and a `workflow_dispatch` trigger. |
| 2 | The watchdog measures the three counters over one window. | The workflow counts default-branch commits, created pull requests, and created issues over a single lookback window, and the window is at least four times the schedule interval. |
| 3 | The thresholds are fixed and reviewable. | The three thresholds and the lookback window appear as literal numbers in `.github/workflows/kata-watchdog.yml`. A reader changes them in that file alone. |
| 4 | Any single breach engages the killswitch. | The workflow sets `KATA_KILLSWITCH` to a truthy value when any one counter reaches its threshold. A test run against forced counts proves each of the three paths. |
| 5 | An unreadable counter engages the killswitch. | The workflow engages when a count cannot be read after its bounded retries. A test run with an unreachable counter proves it. |
| 6 | The watchdog never clears the killswitch. | `rg -n 'KATA_KILLSWITCH' .github/workflows/kata-watchdog.yml` shows writes of truthy values only. No path writes an empty, `0`, `false`, `no`, or `off` value. |
| 7 | An engaged killswitch stays untouched. | The workflow reads the current value first and exits without a write when the value is already truthy. |
| 8 | The reason is recorded. | The written value names the watchdog, the breached counter, the count, the threshold, and the time. The run summary carries all three counts and the verdict. |
| 9 | The watchdog does not gate on the killswitch. | The workflow contains no killswitch gate step, and `KATA.md` states the exemption. |
| 10 | The watchdog runs no agent and needs no checkout. | The workflow uses no `kata-agent`, `gemba-*`, or checkout action, and reads no file from the repository tree. |
| 11 | The write credential is separate and minimal. | The `kata-setup` GitHub App reference documents a watchdog credential with repository Metadata read and Variables write, and no other permission. The Kata App permission table gains no Variables entry. |
| 12 | The watchdog workflow is trust-sensitive. | The `kata-release-merge` skill names `.github/workflows/kata-watchdog.yml` in the same rule as `.kata/`. |
| 13 | A new installation gets the watchdog. | `kata-setup` generates the workflow from a template reference, and its checklist carves the watchdog out of the killswitch-gate item. |
| 14 | Repository checks stay green. | `bun run check` and `bun run test` pass. `bun run invariants` passes with the `kata-workflows` topic updated. |
