# Spec 2360: Watchdog defaults for the delivered tick, and a defaults-first setup

**Classification:** product-aligned. The change lands on the published
`gemba-watchdog` action README under `products/gemba/actions/`, on the
`gemba-watchdog` CLI help examples, on the `www.gemba.team` guard-activity
guide, on the published `kata-setup` skill in the `kata-skills` pack, and on the
`www.kata.team` getting-started page
([work-definition.md § Product-aligned vs internal](../../.claude/agents/x-work-definition.md#product-aligned-vs-internal)).
The monorepo's own watchdog workflow and `KATA.md` are internal companions of
those surfaces.

**Persona and job:** Teams Using Agents. Part A serves Kata's Big Hire in
[JTBD.md](../../JTBD.md), Run a Continuously Improving Agent Team, whose anxiety
is that autonomy amplifies bad patterns faster than humans can intervene, and
Gemba's Big Hire, Stand Up and Operate an Agent Team, which carries the brake as
specs 2330 and 2350 state. Part B serves Kata's Little Hire, "help me onboard a
Kata installation that runs the Plan-Do-Study-Act loop without per-team prompt
engineering": the operator reaches a safe, complete configuration without
deciding a dozen numbers blind.

## Problem

Two problems, one surface each.

### The watchdog's window assumes a clock GitHub does not deliver

Spec 2330 sized the watchdog by one rule: the window is the tick interval times
the number of missed ticks it tolerates. A 15-minute cron and a 2-hour window
keep a breach observable across seven missed ticks. Spec 2350, whose design is
approved and whose plan is not yet written, tightens the cron to five minutes so
the window holds 24 ticks. Both specs treat the cron as the clock.

GitHub does not honour that clock here. The monorepo watchdog has run 35 times
on its 15-minute cron since it merged on 2026-09-22. Every gap between
consecutive runs exceeds the whole window.

| Delivered tick gap, 34 gaps over 6 days | Hours    |
| --------------------------------------- | -------- |
| Shortest                                | 2.1      |
| Median                                  | 4.0      |
| 90th percentile                         | 5.4      |
| Longest                                 | 5.7      |
| Gaps longer than the 2-hour window      | 34 of 34 |

The delay is repository-wide, not a watchdog fault. The shift crons at 01:00,
10:00, and 18:00 UTC land at about 06:00, 15:00, and 20:30. The 06:00 wiki
curation lands between 10:30 and 11:10. GitHub's own documentation states the
contract: "The `schedule` event can be delayed during periods of high loads of
GitHub Actions workflow runs. High load times include the start of every hour.
If the load is sufficiently high enough, some queued jobs may be dropped."

The consequence for a 2-hour window under a 4-hour median gap: a burst that
crosses the threshold and drains inside one gap is never seen. The incident spec
2350 studied ran for seven hours, so a tick would have landed eventually. The
replay in [spec 2350 appendix A](../2350-dispatch-chain-triage/appendix-a.md)
assumed a tick at 15:15Z. On the delivered cadence the first tick after the
15:03Z comment crossing could have landed at 19:00Z, four hours and about 1,600
comments later. A shorter sprawl escapes entirely.

The guide teaches the same rule to every installation. An operator who copies
the guide's workflow inherits a window the platform cannot serve.

### Setup asks for decisions before the operator can see anything

The `kata-setup` skill asks eight questions before it writes a file: the App,
the secrets, the roster, the timezone, the wiki, the model, the profiles, and
the control plane. A ninth, whether to enable dispatch, follows. A new operator
decides schedules, models, and rosters with no configuration to look at. The
getting-started page compensates with a table of "good first answers", which is
the defaults table in the wrong place.

| Gap                                                        | Evidence                                                                                                                                                                                  |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The operator decides parameters blind.                     | Six of the eight questions have a default the skill names in the question. The skill asks anyway.                                                                                         |
| No surface shows the whole configuration after generation. | The report step lists next steps. It does not list the schedule, the roster, the model, the turn caps, or the timeouts the files carry. An operator reads five YAML files to find them.   |
| Setup emits no watchdog.                                   | Spec 2350 adds the template. The reference consumer ran for one day with no brake, which is the evidence that supersedes spec 2330's exclusion.                                           |
| Reconfiguration re-runs the interview.                     | Adding an agent or moving a shift means answering the same questions again.                                                                                                               |
| The defaults have several homes.                           | The model default appears in two template placeholder tables, the turn cap and timeout as literals in the dispatch template, the crons in the schedules reference, and the rest in prose. |

## Proposal

### Part A: size the watchdog for the delivered tick

1. **The window is sized to the longest delivered gap, not to the cron.** The
   default window is 8 hours. It is 1.4 times the longest delivered gap. GitHub
   documents no bound on the delay, so the margin is the point.
2. **The threshold is 48 per counter.** The largest legitimate work an 8-hour
   window holds is about 27 on three of the four counters. 48 keeps 1.8 times
   headroom over that and sits below every incident counter except commits. §
   Calibration carries the figures and the trade-off against 32 and 64.
3. **The watchdog ticks on the events it counts.** Besides the schedule, the
   workflow runs when an issue opens, a conversation comment lands, a pull
   request opens, and the default branch receives a push. A tick then lands when
   activity happens, which is the only time a breach can exist. The pull-request
   tick uses the base repository's own workflow definition and secrets, and it
   checks nothing out. At most one tick runs and one waits, so a flood cannot
   fill the runner pool with watchdog runs.
4. **The schedule stays as the fallback clock, at five minutes.** It covers
   activity created with the runner's own token, which fires no workflow, and it
   records the latch value on a quiet repository. The monorepo workflow carries
   a 15-minute cron today. This spec sets five minutes when it lands before spec
   2350's plan. The design no longer depends on the cron.
5. **The sizing rule changes in every home.** The guide, the action README, the
   CLI help examples, the watchdog skill examples, `KATA.md`, and the monorepo
   workflow carry the new numbers and the new rule: size the window to the
   longest gap between the ticks the repository receives, and size the threshold
   to the legitimate work one window holds.
6. **The dispatch gate's window stays at 2 hours.** Spec 2350's gate runs at run
   start and needs no scheduler. Its budget of 24 over 2 hours is unchanged. The
   two brakes now measure different things: the gate bounds a burst rate, the
   latch bounds sustained volume. Self-caused activity that stays under the gate
   can still latch after about four hours at the gate's ceiling. That is the
   intended division, because 48 per counter in 8 hours is above every
   legitimate figure in § Calibration.
7. **The resume window equals the measurement window.** A human who clears the
   latch gets 8 quiet hours instead of 2. The engage command accepts its own
   window, so a shorter resume window is possible, but it would re-engage on the
   burst that has not yet drained out of the 8-hour count, which is the
   oscillation spec 2330 designed out. Accepted: the human who cleared it is
   present, and under the default landing order the gate still bounds
   self-caused runs. This is why setup must not write the latch (item 10).

### Part B: defaults first, then one review

8. **Setup asks only what it cannot default.** Before it writes anything, the
   skill settles the prerequisites: the control plane mode, then the installed
   App and its three secrets on the self-hosted path, or the OIDC variable and
   the API-key secret on the hosted path. Nothing else is a question.
9. **Setup writes a complete default configuration.** One pass emits the shift,
   dispatch, storyboard, coaching, and watchdog workflows and the Dependabot
   config. The defaults: all six agents in producer → reviewer → shipper order,
   a timezone inferred from the repository's own history and shown on the sheet,
   with UTC when nothing can be inferred, the default model, the wiki on,
   dispatch on, the watchdog at 48 over 8 hours with event ticks.
10. **Setup leaves the killswitch variable alone.** The resume rule treats any
    falsy value written inside the window as a fresh clear, so a value written
    at setup would silence the brake for its first 8 hours. Setup reads the
    variable and shows its state. It writes nothing.
11. **Setup verifies, then shows one parameter sheet.** After the files parse
    and the checks pass, the skill shows one table per generated file: each
    parameter, its value, where it lives, and one line on why the default is
    what it is. The sheet cannot disagree with the files, because it is taken
    from them.
12. **One question, then a loop.** The skill asks whether the operator wants to
    change anything on the sheet. It applies each change, regenerates the files
    it touches, re-verifies, and re-renders. The loop ends when the operator
    accepts the sheet. No parameter question precedes the sheet.
13. **Reconfiguration is the same loop.** On an existing installation the skill
    adds any file the default set has and the repository lacks, reads every
    workflow file, shows the sheet, and asks the same question. Adding an agent
    is a change to the roster row. Every default has one home, and every
    existing template resolves its defaults from that home.
14. **Hosted mode gets an assess-only watchdog that fails red on a breach.** The
    engage job mints its own down-scoped token from the App key, which a hosted
    installation does not hold. The hosted variant measures, and a breach
    verdict fails the run so the operator sees it. The sheet says so on the
    watchdog row. Until the follow-up in § Follow-up findings lands, a hosted
    installation has measurement and a red run, not an automatic stop.

## Relation to spec 2350

Spec 2350's design is approved and its plan is not yet written. Both specs touch
the watchdog workflow, the guide, and the `kata-setup` skill. This spec changes
four claims spec 2350 makes and leaves the rest untouched.

| Spec 2350 claim                                                                                    | This spec                                                                                | Why                                                       |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Proposal item 4 and success criteria 13 and 14: threshold 32, window 2 hours, tick `*/5`.          | Threshold 48, window 8 hours, tick `*/5` plus four event triggers.                       | The window assumed a delivered tick.                      |
| The `kata-setup` watchdog template is one more template beside four.                               | The template is one row of the defaults-first setup.                                     | The setup flow changes shape.                             |
| Design 2350-a: the gate window and the watchdog window coincide by choice.                         | They differ. The gate keeps 2 hours.                                                     | The gate has no scheduler between it and the event.       |
| Design 2350-a: the budget of 24 is three quarters of the latch threshold and sits below the latch. | 24 is half of 48. The gate bounds a burst rate, the latch bounds sustained volume.       | Proposal item 6 states the division and accepts it.       |
| Follow-up finding: the killswitch gate reads absent and cleared the same.                          | Still open. Setup writes no value, so the finding stays with the `kata-agent` gate step. | A value written at setup would blind the brake (item 10). |

The default landing order: this spec lands after spec 2350's watchdog and setup
parts and changes them, so every criterion below reads against a repository
where spec 2350 has shipped. The exception is the approver's: spec 2350's plan
adopts this spec's numbers and template instead, which needs an amendment to
design 2350-a wherever it fixes 32, 2 hours, `*/5`, "equal to the watchdog's
window", and "three quarters of the latch threshold": its component map, its
component row for the template, its defaults table, and its key-decision row.
Either order is one plan part.

## Calibration

### The delivered tick

The 35 monorepo watchdog runs between 2026-09-22T14:07Z and 2026-09-28T06:28Z
give the gap table in § Problem. The three other scheduled workflows in the
repository show the same 2 to 6 hour lag against their crons, so the figure
describes the repository's scheduler, not the watchdog. Each tick takes 11 to 15
seconds on recent runs and 45 seconds at the slowest observed.

### The window

| Candidate | Delivered gaps it covers         | Legitimate work one window holds | Verdict                                                                               |
| --------- | -------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------- |
| 2 hours   | 0 of 34                          | one batch                        | Never observable here.                                                                |
| 6 hours   | 34 of 34, 1.05 times the longest | two shifts                       | No margin. The longest observed gap sits within 5 % of it, and GitHub bounds nothing. |
| 8 hours   | 34 of 34, 1.4 times the longest  | two shifts and one storyboard    | Chosen.                                                                               |
| 12 hours  | 34 of 34, 2.1 times the longest  | three shifts and one storyboard  | Raises the legitimate load the threshold must clear, so more escapes before a stop.   |

The nominal shift crons sit 7 to 9 hours apart. The delivered day and swing
shifts landed 5.5 to 6.1 hours apart on each of the last three days, so an
8-hour window routinely holds two shifts. The legitimate-work column counts
that.

### The threshold

The monorepo's busiest 8-hour window since 2026-08-10, with the 2026-09-02
incident day removed, held 8 commits, 7 pull requests, 2 issues, and 9 comments.
The repository killswitch has read truthy since 2026-06-17, so the gated
workflows ran nothing in that period. The 2026-08-21 burst of 5 pull requests
and the 2026-09-02 burst came from App sessions outside those workflows, which
the watchdog counts regardless. The legitimate batches spec 2330 recorded,
scaled to two shifts plus one storyboard, bound the agent figures. The
storyboard figure of 14 is spec 2330's seven-profile count. The default
six-agent roster files fewer, so it is conservative.

| Counter                | Largest legitimate work in 8 hours                                                | Headroom to 48 | Incident count reaches 48                                                         |
| ---------------------- | --------------------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------- |
| Issues                 | About 26: 14 from a storyboard plus one per agent across two shifts               | 1.8 times      | About 15:25Z, from 32 at 15:12Z and 99 in the 15:00 hour                          |
| Pull requests          | About 27: 15 from a weekly Dependabot run plus one per agent, two shifts          | 1.8 times      | After 15:43Z, when 32 crossed. The peak 2-hour count was 49 and the day held 142. |
| Default-branch commits | About 27: 15 merges from a security-update session plus one per agent, two shifts | 1.8 times      | Never. The day held 22 direct pushes and merges, so no 8-hour window reaches 48.  |
| Comments               | Unknown. 9 observed with agents mostly idle.                                      | Unknown        | About 15:06Z, three minutes after the 32 crossing                                 |

When the human 8-hour maxima coincide with the agent maxima, the headroom on
pull requests and commits falls to about 1.4 times. The monorepo runs eight
agents per shift, not six, so its own coincident headroom is about 1.25 times. A
threshold of 64 would give 1.9 times on that same base, and it would have caught
the monorepo's own 2026-09-02 burst of 67 issues in six hours only near its end,
where 48 catches it three hours earlier. An unnecessary stop costs idle agent
time until a human clears it. A missed sprawl costs an unbounded spend. 48
stands, and the sheet shows it so an installation with a bigger legitimate load
raises it in one line.

Comments lead every other counter by about twenty minutes, so 48 detects the
incident at the first tick after 15:06Z. With event ticks that is the next
comment. The sustained rate every counter tolerates falls from 16 per hour to 6
per hour, and comments is the counter a busy human review day can push past
that. The comments counter stays the least grounded number, which is why
[spec 2350 appendix B](../2350-dispatch-chain-triage/appendix-b.md) names
per-counter thresholds as the first add-back once a baseline exists.

### Event ticks

| Measure             | Value                                                                                                                                                                                                                                                                                                                |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trigger classes     | Issue opened, conversation comment created, pull request opened, push to the default branch. These are the four counters' own events.                                                                                                                                                                                |
| Cost per tick       | One pinned binary download and four REST reads, no checkout. 11 to 15 seconds on recent runs.                                                                                                                                                                                                                        |
| Bound under a flood | One running tick and one pending tick per repository. Each new event replaces the pending tick, so a flood leaves cancelled watchdog runs in the run list and collapses to back-to-back ticks.                                                                                                                       |
| Runner pool         | A tick queues like any run. In the incident, runs waited 105 to 321 minutes for a runner. Spec 2350's gate stands self-caused runs down before checkout, but each still holds a runner for about a minute. The 8-hour window is what keeps a breach observable across that wait.                                     |
| Trust surface       | A fork pull request or an outside comment can start a tick. The tick runs the base branch's workflow file with the base repository's secrets, checks nothing out, and runs a SHA-pinned action. A breach it causes stops the team, which is the safe direction. The watchdog surface stays trust-sensitive at merge. |

## Scope

### Included

| Surface                                                               | Change                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/watchdog.yml`                                      | Threshold 48, window 8, and a five-minute cron, each written once. Four event triggers beside the schedule. At most one tick runs and one waits.                                                                                                                    |
| `products/gemba/actions/gemba-watchdog/README.md`                     | The usage section links the guide's wiring instead of carrying a second copy. The sizing rule names the delivered gap.                                                                                                                                              |
| `products/gemba/bin/gemba-watchdog.js`                                | The help examples carry the new numbers. The next gear release carries them. Nothing pins them.                                                                                                                                                                     |
| `websites/gemba/docs/guard-activity/index.md`                         | The threshold-and-window section teaches the delivered-gap rule with this repository's figures as the worked example. The CI wiring carries the new shape and is the one published copy.                                                                            |
| `.claude/skills/gemba-watchdog/SKILL.md`                              | The example invocations carry the new numbers, and the sizing sentence names the delivered gap.                                                                                                                                                                     |
| The Killswitch paragraph in `KATA.md`                                 | Names the window, the threshold, and the event ticks.                                                                                                                                                                                                               |
| `.claude/skills/kata-setup/SKILL.md`                                  | Writes defaults before it asks, and asks once after verification. The interview and its checklist items leave, which is what pays for the sheet and the watchdog within the layer caps. The checklists verify the watchdog and the sheet.                           |
| `.claude/skills/kata-setup/references/`                               | A watchdog workflow template and a Dependabot template. Parameter references that are the one home of every default and of the sheet's row shape. Every literal default and every per-template placeholder table in the existing references gives way to that home. |
| `websites/kata/docs/getting-started/index.md`                         | The setup section describes the defaults-first flow and drops the "good first answer" table. The App permission paragraph gains Variables.                                                                                                                          |
| `websites/kata/docs/continuous-improvement/daily-storyboard/index.md` | The one sentence on what setup writes names the whole default set.                                                                                                                                                                                                  |
| Checks                                                                | `jidoka instructions`, the `skill-genericity` invariant, and the `byok-boundary` invariant pass on the rewritten skill and its references.                                                                                                                          |

### Excluded

| Item                                                     | Why                                                                                                                                                                                                                    |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Changes to the `gemba-watchdog` action or CLI logic      | Every new value is a workflow input the action already accepts. The CLI change is help text only. No release and no sibling tag is needed.                                                                             |
| Per-counter thresholds                                   | Appendix B of spec 2350 names the trigger: a comments baseline. None exists yet. The sheet makes the single number visible instead.                                                                                    |
| A fifth counter for workflow runs                        | A new probe is a library and CLI change, and comments led runs by minutes in the incident.                                                                                                                             |
| Engage in hosted mode                                    | The action accepts no caller-minted token, and its own mint is what down-scopes the write. A hosted installation holds no App key. The sheet states the gap and the follow-up. Extending the action is its own change. |
| A resume window shorter than the measurement window      | It would re-engage on a burst still inside the longer count. Item 7 accepts the 8-hour quiet window instead.                                                                                                           |
| Changing the dispatch gate's budget or window            | The gate runs at event time. Spec 2350 owns it.                                                                                                                                                                        |
| Watchdog thresholds through `.kata/settings.json`        | Spec 2330 excluded it. The watchdog must not depend on repository content.                                                                                                                                             |
| A timezone question                                      | The repository's history gives a usable default for every repository that has one, and UTC otherwise. The sheet shows the inference, and one line corrects it.                                                         |
| Measuring the scheduler's delay from inside the watchdog | It needs a run-history probe, which is a CLI change, and the sheet already tells the operator to observe the delivered gap.                                                                                            |

### Follow-up findings

No issue tracks these yet. This section is their record until the owning agent
files them.

| Finding                                                                                           | Owner surface                  |
| ------------------------------------------------------------------------------------------------- | ------------------------------ |
| A hosted installation cannot engage the latch, because the action accepts no caller-minted token. | `gemba-watchdog` action inputs |
| The killswitch gate reads absent and cleared the same, per spec 2350's own follow-up table.       | `kata-agent` killswitch step   |

**Compatibility stance:** clean break. The interview leaves the skill. The
"interval times missed ticks" rule leaves every home. The 32, 2-hour, and
15-minute literals leave the guide, the README, the CLI help, the skill
examples, and the monorepo workflow. The README's second copy of the workflow
leaves. Installations regenerate their workflows through `kata-setup`.

## Success criteria

| #   | Claim                                                                                   | Verification                                                                                                                                                                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The monorepo watchdog runs at 48 over 8 hours on a five-minute cron, each written once. | The workflow carries the three literals once each, and the action's inputs stay required and default-free.                                                                                                                                                                                    |
| 2   | The watchdog ticks on the counted events.                                               | The workflow's triggers include issue opened, conversation comment created, pull request opened in the base context, push to the default branch, the schedule, and manual dispatch.                                                                                                           |
| 3   | A flood cannot multiply the watchdog.                                                   | With two events in flight, at most one tick runs and one waits, and an in-flight tick is never cancelled.                                                                                                                                                                                     |
| 4   | The watchdog stays outside the Kata family and gates on nothing.                        | The workflow file name is unchanged, it carries no killswitch gate, and the `kata-workflows` enumeration topic is unchanged.                                                                                                                                                                  |
| 5   | The sizing rule has one form in every home.                                             | The guide, the README, the CLI help, the watchdog skill, and `KATA.md` each state the delivered-gap rule, no file outside `specs/` contains "run interval" or "missed runs" in a sizing sentence, and the README carries no workflow YAML.                                                    |
| 6   | Setup asks only prerequisites before it writes.                                         | The skill's process names the control plane, and then the App and three secrets or the OIDC variable and API-key secret, as the only questions before generation.                                                                                                                             |
| 7   | Setup writes the whole default set.                                                     | A rehearsal on an empty scratch repository produces the shift, dispatch, storyboard, coaching, and watchdog workflows and the Dependabot config, with the timezone at UTC, and writes no killswitch variable. The transcript is attached to the implementation PR.                            |
| 8   | Every default has one home.                                                             | The parameters reference lists every default with its file and key, and every other file in the skill carries a placeholder where it carried a default.                                                                                                                                       |
| 9   | The generated watchdog matches the monorepo's.                                          | The template differs from the monorepo workflow only in its placeholders and comments, and it carries 48, 8 hours, the five-minute cron, the four event triggers, the tick bound, a SHA-pinned action, the latch value wired to the summary, and a name outside the agent workflows' pattern. |
| 10  | The sheet cannot disagree with the files.                                               | In the rehearsal, every Value cell equals the value in the file and key its row names, and a hand edit to one file changes the sheet on the next render.                                                                                                                                      |
| 11  | The operator reviews after, not before.                                                 | The rehearsal transcript shows one change question after verification and none before generation, and a second change round after the first.                                                                                                                                                  |
| 12  | Reconfiguration uses the sheet.                                                         | A rehearsal on a repository with the four agent workflows and no watchdog adds the watchdog with defaults, keeps the four files' values, and shows the sheet.                                                                                                                                 |
| 13  | Hosted mode is honest.                                                                  | The hosted watchdog variant emits the assess job only, fails the run on a breach verdict, and the sheet's watchdog row states that engage is unavailable and why.                                                                                                                             |
| 14  | The instruction layers stay within budget and generic.                                  | `jidoka instructions` passes with the skill procedure within its caps. The DO-CONFIRM block drops its timezone and profile items, absorbs the READ-DO pin item, gains the sheet and watchdog items, and stays at eight of nine. The `skill-genericity` and `byok-boundary` invariants pass.   |
| 15  | The getting-started page matches the skill.                                             | The page describes prerequisites, defaults, and the sheet, lists Variables among the App permissions, and carries no "good first answer" table.                                                                                                                                               |
| 16  | Repository checks stay green.                                                           | The repository's check, test, and invariants commands pass.                                                                                                                                                                                                                                   |
