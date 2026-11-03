# Spec 2420: The benchmark measures the agent-under-test

**Classification:** product. The change lands on `@forwardimpact/libharness`
behind the `gemba-benchmark` and `gemba-harness` CLIs, on the published
`gemba-harness`, `kata-agent`, and `kata-interview` actions, and on the
`www.gemba.team` guides
([team protocol § Classify Every Finding](../../.claude/agents/x-team-protocol.md#classify-every-finding)).
The `kata-skills` and `jidoka-skills` benchmark families and the `Eval: Kata`,
`Eval: Jidoka`, and `Eval: Guide` workflows are internal companions.

**Persona and job:** Teams Using Agents → Stand Up and Operate an Agent Team,
the Gemba Big Hire in [JTBD.md](../../JTBD.md). The hire includes "measure
outcomes". That step is `gemba-benchmark`, which proves whether a skill-pack
change made agents write better code. A pass@k that does not measure the
agent fails that step and sends the team back to reading CI plumbing.

## Problem

`Eval: Kata` failed on 2026-10-08. The study of that run found that the
failure is the visible edge of a measurement defect, and that the last green
run in July carried the same defect.

| Gap | Evidence |
| --- | -------- |
| The lead does the agent's task itself. | In a stalled cell the supervisor reads the task, loads the skill under test through the `Skill` tool, is refused `Write`, and writes the deliverable through a Bash heredoc. It never calls `Ask`. |
| A session with an idle lead never ends. | The lead returns a terminal result with no `Conclude` and no pending `Ask`. The orchestration loop waits for a message that nothing will send. The loop also discards the lead's session result, so a lead whose session fails with an SDK error waits the same way. The benchmark watchdog ends the wait after 20 minutes. |
| A cell with no agent participation passes. | The record shows an empty agent lane, zero agent cost, zero turns, and a watchdog `agentError`. The judge grades the files the lead wrote and the verdict is `pass`. |
| The invariant hooks grade nothing. | Every `kata-skills` and `jidoka-skills` hook calls `fit-trace`. The binary became `gemba-trace` on 2026-07-20 in #2250, and the runner's tool set followed with the next gear release. Each call is wrapped in `\|\| true` or `\|\| exit 0`, so the hook exits 0 with zero rows. The grade is vacuously healthy with every gate passed. |
| The lead's tool guard is a deny-list. | Commit 7f15d1a0d of 2026-05-25 blocked Bash, Write, and Edit on every lead through a deny-list, because the permission list restricts nothing under the harness's bypass mode. #1536 of 2026-06-10 then restored Bash to the supervisor on purpose, for the kata-interview wrap-up. Four roles now carry four copies of the list, and the supervisor's copy is the one a lead with Bash routes around. |

### Evidence

| Run | Date | Cells with an empty agent lane | Cells whose hook found no binary | Outcome |
| --- | ---- | ------------------------------ | -------------------------------- | ------- |
| 29913504057 | 2026-07-22 | 21 of 30 | 25 of 30 | green |
| 37782823880 | 2026-10-08 | 24 of 30 | 25 of 30 | red, shard 5 timed out |

The five cells with a working grader in each run are `implement-feature`,
which grades through hidden tests and ships no hook. A stalled cell lasts 20.5
to 21.3 minutes and bills no agent cost. A delegated cell lasts 3 to 5 minutes
and bills 0.14 to 0.30 USD of agent cost. Shard 5 drew five stalled cells.
With two cells in flight per machine that is three waves of about 21 minutes,
which is more than the action's 60-minute cap. The other five shards each drew
at least one delegated cell and finished under the cap.

## Proposal

The change has four parts. Part A removes the lead's means to do the task.
Part B removes the cost of a protocol breach. Parts C and D make the record
honest about what it measured.

### A. Read-only roles carry an explicit tool allowlist

Every harness role that must not change the work tree declares the built-in
tools it has. The supervisor, the advisor, and the judge have Read, Glob, and
Grep. The judge adds Bash, because it runs inspection commands after grading.
The facilitator and the discuss lead add Skill, because their profiles declare
the skills that carry their session protocol and the prompt composer inlines
none of them. No other built-in tool exists in those sessions. The
orchestration tools arrive through their own server and are unaffected.

Skill loads a skill's text into the session. A skill file on the lead's path
can run shell preprocessing when it loads, so the facilitator and the discuss
lead trust the skills the repository ships. The roles that load no protocol
skill do not carry the tool.

The `--supervisor-allowed-tools` flag of `gemba-harness supervise` sets the
supervisor's tool set. An eval that wants its lead to verify with Bash opts in
and accepts that a lead with Bash can execute. The facilitator's equivalent is
a factory input with no flag. The per-role deny-lists go away.

The agent-under-test and the facilitated participants keep their current
configuration and semantics. Their list is a permission list, which restricts
nothing under bypass mode, so their effective tool surface stays the full
built-in set. The benchmark's object of measurement does not move.

| Consumer of a lead's tool set | Today | After |
| ----------------------------- | ----- | ----- |
| `Eval: Kata` and `Eval: Jidoka` benchmark cells | Every built-in tool except the six the deny-list names | Read, Glob, Grep |
| `Eval: Guide`, which passes no flag | Same as above | Read, Glob, Grep. Its task has the lead verify by reading the DSL file, so the default suffices. |
| `kata-interview` action, default `Bash,Read,Glob,Grep,Write,Edit,Skill,TodoWrite` | Every built-in tool except the six the deny-list names | The default drops Write and Edit. The lead keeps Bash, the deliberate grant, and Skill. It loses every tool the deny-list missed, NotebookEdit among them. |
| `gemba-harness` and `kata-agent` actions | Forward the flag with no default | Unchanged. Their flag tables state the read-only default. |
| Facilitated and discuss leads in `kata-dispatch`, `kata-coaching`, and `kata-storyboard` | Every built-in tool except the seven the deny-list names | Read, Glob, Grep, Skill. They lose TodoWrite, WebFetch, WebSearch, and NotebookEdit. |

### B. A quiescent session ends

A session is quiescent when no participant is mid-turn, no message is queued,
no `Ask` is pending, no inbox poller is attached, and the lead has not ended
the session with its terminal tool. Nothing can wake such a session. The loop
checks for it whenever any turn ends, the lead's or a participant's. On the
first quiescence the loop gives the lead one synthetic reminder to call `Ask`
or its terminal tool, mirroring the reminder a participant gets for an
unanswered `Ask`. The reminder budget is per idle episode: a lead turn that
asks, a message delivered to the lead, or the session's end resets it. Two
consecutive quiescences record a `lead_idle` event and stop the session. The
lead-turn cap bounds the total.

A lead turn that the harness reports as an error ends the whole session as an
error. That is an SDK failure or a session that did no model work. A terminal
result with an error subtype, such as a spent turn budget, is not an error,
and the loop continues as today. A discuss session with an inbox poller keeps
today's behaviour, since the poller is a wake source the loop cannot observe,
and the workflow timeout bounds it.

The benchmark watchdog stays as the cell's time budget and as the backstop
for a hung SDK subprocess. When it fires it tears the session down instead of
leaving it running.

A session that the idle rule stops is an unsuccessful session. The
`gemba-harness` commands exit as they do for any unsuccessful session. A lead
error exits as a crash does today.

### C. A cell passes only on a complete session

A benchmark cell is complete when the agent-under-test did billed work in the
session. Billed work is token usage on the agent's own messages. It survives
a session end that cuts the agent's final turn short, where the cost the
record reports, which sums terminal results, can read zero. An incomplete cell
fails. Its record names the first reason that applies, in this order: the
watchdog fired, the session threw, the lead session ended in error, the agent
did no billed work. The record tells a lead error from any other throw. The
invariants and the hidden tests still run on an incomplete cell, so the record
keeps its shape. The judge does not run on it. Where the task is scored, the
score is zero.

The lead's own verdict and a `lead_idle` after the agent worked stay in the
trace and do not gate the cell. The agent's work is what the grade and the
judge evaluate. A terminal result with an error subtype, such as a spent turn
budget, is billed work and a measured outcome.

### D. A hook that emits no check rows is a grader fault

A task that ships an invariants script expects at least one check row from
it. Zero rows mark the grader unhealthy, which fails the cell and names the
fault on the record. The seven `kata-skills` and `jidoka-skills` hooks and the
`jidoka-skills` README call `gemba-trace assert`. The wrappers stay, because
the assert exits nonzero on a failed check by contract. A hook that loses one
row out of several grades the remaining rows. That gap is accepted.

## Scope

| Surface | Change |
| ------- | ------ |
| `@forwardimpact/libharness` agent runner | Carries a built-in tool allowlist. Drops the deny-list option. |
| Supervisor, facilitator, discuss lead, advisor factories | Use the read-only allowlist, with Skill added for the two leads that load a protocol skill. Drop their deny-lists and the deny-list inputs. The supervisor and facilitator widening inputs set the allowlist. |
| Judge factory | Uses the read-only allowlist plus Bash. |
| `gemba-harness supervise` | `--supervisor-allowed-tools` sets the supervisor's tool set. Its help text states the default. |
| `kata-interview` action | The `supervisor-allowed-tools` default drops Write and Edit. |
| Orchestration loop | Detects quiescence at every turn end, reminds once per idle episode, stops with `lead_idle`, ends on a lead error, and can be ended by the watchdog. |
| Benchmark runner | Completeness gate on the verdict, judge skipped on incomplete cells, watchdog tears down. |
| Trace summary and grade derivation | Report agent work. Treat a present hook with zero rows as unhealthy, in the runner and in the `grade` command. |
| Result record and `report` command | `agentError` carries a fixed reason and the detail, and the report prints both. An invariants error field. |
| Benchmark families | `kata-skills` (five hooks), `jidoka-skills` (two hooks and the README) call `gemba-trace`. |
| Docs | libharness README (tool surface, event types), the run-eval, run-benchmark, and coordinate-team guides, the `gemba-harness`, `kata-agent`, and `kata-interview` action READMEs. |

Excluded, with the reason:

| Excluded | Reason |
| -------- | ------ |
| Deriving the shard budget from watchdog, concurrency, and cell count; writing records on SIGTERM; running the merge job after a failed shard. | Once B and C land, an idle lead costs a few lead turns instead of the watchdog. Only a hung subprocess still costs the watchdog, and the action's timeout exists for that case. |
| The `fit-wiki` benchmark family and `Eval: Wiki`. | Its hook and task text invoke `fit-wiki`, and its work directory depends on a package that no longer ships that binary. That repair is its own change. |
| A static rule against retired CLI names. | Part D makes a retired name a loud failure where a hook runs. A repository rule would also flag the `fit-wiki` family above. |
| The agent-under-test's and the participants' tool configuration. | Changing them changes what the benchmark measures. |
| The lead's setting sources, working directory, and task wording. | A lead with no write tool cannot do the task, so the prompt needs no change. |

## Compatibility

Clean break. The deny-list inputs of the lead factories, the agent runner's
deny-list option, and the lead's "did not succeed" error disappear. The
`--supervisor-allowed-tools` flag keeps its name and gains the meaning its name
states. A caller that passes a list naming Write or Edit gets a lead with
those tools, where the deny-list removed them before.

## Rollout

Part D's hooks are checked out from the repository and reach `Eval: Kata` and
`Eval: Jidoka` on merge. Parts A to C run inside `gemba-benchmark`, which CI
runs as a pinned gear binary. They reach the two workflows after a libharness
release, a gear release, the `gemba-bootstrap` repin, the benchmark
reusable-workflow repin, and the workflows' SHA bumps. The release engineer
owns that chain. Criteria 1 to 12 verify the implementation PR. Criterion 13
verifies the rollout.

## Success Criteria

| # | Claim | Verification |
| - | ----- | ------------ |
| 1 | Among built-in names, a supervisor, advisor, and judge session loads exactly Read, Glob, and Grep, the judge adds Bash, and a facilitator and discuss-lead session adds Skill. | The libharness factory tests, and the lead's `system/init` event in a live trace. |
| 2 | The agent-under-test's session lists the same built-in tools as before the change. | The agent lane's `system/init` event in a new benchmark trace against the one in run 37782823880's shard-1 trace artifact. |
| 3 | `gemba-harness supervise --supervisor-allowed-tools=Read,Grep,Bash` gives the supervisor exactly those built-in tools. | The libharness supervise command tests. |
| 4 | A lead that ends its turn with nothing queued, nothing pending, and no participant mid-turn receives one reminder, and a consecutive quiescence ends the session with a `lead_idle` event. | The libharness orchestration loop tests. |
| 5 | A participant whose turn ends into silence after the lead's turn has already ended triggers the same reminder, a session with an inbox poller is never ended by quiescence, and a lead turn that asks resets the reminder. | The libharness orchestration loop tests. |
| 6 | A lead turn that the harness reports as an error ends the session as an error, and a spent lead turn budget does not. | The libharness orchestration loop tests. |
| 7 | A cell whose agent lane bills no tokens has `verdict: fail`, an `agentError` whose reason names the missing work, grade and invariants fields, no judge trace, and score zero where the task is scored. | The libharness benchmark runner tests. |
| 8 | When the watchdog fires, the session is torn down within the per-task termination grace, no runner remains in flight, and the record's `agentError` names the watchdog as aborted. | The libharness benchmark runner tests. |
| 9 | A task with an invariants script that emits zero rows grades `fail` with the fault named on the record, in the runner and in the `grade` command. | The libharness grade derivation and grade command tests. |
| 10 | Nothing under the two families names `fit-trace`. | `git grep -l fit-trace -- benchmarks/kata-skills benchmarks/jidoka-skills` returns nothing. |
| 11 | No role carries a hand-maintained forbidden-tool list, and the lead's "did not succeed" error is gone. | A case-insensitive search of the libharness source for "disallowed" and for "did not succeed" returns nothing. |
| 12 | The run-eval guide and the three action READMEs state that the supervisor's default tool set is read-only, that the flag widens it, and that the agent's `allowed-tools` input is a permission list. The run-benchmark guide states when a cell fails as incomplete and that a hook emits at least one row. The coordinate-team guide states the idle stop and its exit. | The pages under `websites/gemba/docs/` and `products/*/actions/*/README.md`. |
| 13 | After the rollout, a `workflow_dispatch` of `Eval: Kata` completes every shard under the cap, no cell records the watchdog reason, and every passing cell carries billed agent tokens. The same holds for `Eval: Jidoka`. | The `benchmark-results` artifact of each run. |

## Assumptions

- A read-only lead still supervises. It asks, reads the result, and ends the
  session. Verification by execution belongs to the judge and the hidden
  tests, or to a caller that widens the flag on purpose.
- The skills a facilitator or discuss lead can load are the repository's own.
  A skill that runs shell at load time is trusted on that basis.
- The hooks find `gemba-trace` on the runner's PATH through the
  `gemba-bootstrap` default tool set, which the failed run's log lists.
- The 20-minute watchdog stays at its value. It is the cell's time budget.
