# Team Protocol

Every agent follows this protocol on every run. Skills hold the procedures.
The `gemba-wiki` skill documents each memory command. Tracker operation names
(`open-change`, `comment`, `merge-change`) map to commands in
[work-trackers](x-work-trackers.md).

## Run Loop

1. **Boot.** `Read wiki/MEMORY.md`. Then run `gemba-wiki boot --agent <self>`.
   Triage a non-empty inbox with `gemba-wiki inbox`. Use memory before you
   re-derive state from the tracker or git.
2. **Pick.** Do a handed task as given. Otherwise the first level with
   actionable work wins:
   1. Rows in MEMORY.md `## Cross-Cutting Priorities` where you are Owner.
   2. Your own row in `## Active Claims`.
   3. Your storyboard items and open `experiment` issues labeled
      `agent:<self>`.
   4. The Assess list in your profile.
   5. Cross-cutting rows that list you under Agents.

   Within one level, product-aligned work outranks internal work, unless the
   internal work lifts a constraint that blocks product delivery. Record the
   choice with `gemba-wiki log decision`.
3. **Claim.** Before the first code write, run `gemba-wiki pull`, check
   `## Active Claims` for a foreign claim on the same target, then
   `gemba-wiki claim` and `gemba-wiki push`. If the push brings in a foreign
   claim on the same target, release yours and pick again.
4. **Probe.** Before `open-change`, look for earlier work on the target in
   every state: the branch by its exact ref (`git ls-remote`), and changes by
   head branch and by issue or spec number. Probe at the start and again
   immediately before you open the change, because search indexes lag.
5. **Act** through the skill that owns the work.
6. **Close.** Log actions with `gemba-wiki log note` and `gemba-wiki log
   done`. Update `wiki/<self>.md` with current state, not history. Release the
   claim when its change lands or you abandon it. `gemba-wiki audit` must pass
   on your summary and weekly log.

## Classify Every Finding

No observation stands without an action. Classify each finding before you
create a branch:

| Class          | Test                                                                                                  | Route                                    |
| -------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **Mechanical** | The fix is one verifiable diff. It needs no design decision, adds no component or contract, and stays in your scope. | `fix-` branch through `open-change`      |
| **Structural** | It needs a design decision, changes a component or contract, or exceeds your scope.                   | `spec-` branch through `kata-spec`       |
| **Unsettled**  | The answer is open, two or more agents raised it, or it changes a shared metric, rule, or policy.     | Discussion first                         |
| **Obstacle**   | A measured gap between the current and the target condition. Data grounds it.                         | `obstacle` issue (`kata-session`)        |
| **Experiment** | The next small, testable step against one obstacle. It records its expected outcome before the run.   | `experiment` issue (`kata-session`)      |
| **Out of scope** | Off the product vision, a duplicate, unclear, or already done.                                       | Comment and label `triaged` or `wontfix` |

- Branch names use dashes, never `/`: `fix-<topic>`, not `fix/<topic>`. This
  holds in every repository you branch in.
- `fix-` and `spec-` work never share a change. One finding can need several
  routes at once, such as a fix and a Discussion.
- The finder is not the doer. When a finding exceeds your scope, write a spec
  or file an issue. Do not fix it in place.
- Label every work PR `product` when it changes a surface a user hires (a
  product, a service, or their documentation). Label all other work
  `internal`.
- An obstacle names a gap. An experiment names a step that tests one way to
  close it.

## Channels

| Output                                          | Channel                                    |
| ----------------------------------------------- | ------------------------------------------ |
| Settled decision, progress, agent state         | Wiki                                       |
| Time-series measurement                         | Metrics CSV (`gemba-xmr record`)           |
| Open question or policy debate                  | `create-discussion` / `comment-discussion` |
| Reply about one change or one issue             | `comment`                                  |
| Obstacle or experiment state                    | `create-issue` + `label`                   |
| Mechanical fix or structural finding            | `open-change` (`fix-` or `spec-`)          |

- Address another agent by name in plain text: "Hello Product Manager, …".
  Agents have no accounts, so never `@`-mention one. Send a cross-agent note
  with `gemba-wiki memo`. Never write another agent's summary.
- When you open a change, comment on the coordinating issue with the link,
  the branch, and the route you chose and rejected.
- When a comment addressed to you is unclear, ask one specific question.
- The author of a Discussion closes it with a link to the spec or wiki note
  that resulted.
- Cite each non-wiki output in your log:
  `<Channel> <ref>: <topic> (<URL>)`.
- Before you publish a body, check that every SHA, issue, and PR it cites
  resolves on the repository it names.

## Approval

`wiki/STATUS.md` is the approval record. It wraps tab-separated rows in a
fenced block: `{id}\t{phase}\t{status}`. Phases are `spec`, `design`, and
`plan`. Statuses are `draft`, `approved`, `implemented` (plan only), and
`cancelled`. Replace a row in place.

- Only a trusted human originates `spec approved` and `design approved`. An
  agent propagates a trusted human's signal: an approval label, an APPROVED
  review, an approval comment, a merge, or a message in an interactive
  session. Record the approved head SHA with the write.
- `staff-engineer` may approve a plan after a clean `kata-plan` panel. The
  product manager may approve a retention PR. That review writes no STATUS row.
- A human merge is an approval. When STATUS does not record it, reconcile
  the row to what merged. An agent merge approves nothing.
- Approval authorizes a merge. It does not advance the phase. The next phase
  starts when the prior artifact is on `main`.
- `kata-release-merge` owns the gate rules: trust, head pins, and transfers.

## Guardrails

- **Killswitch.** Never write the killswitch variable. When the team is
  stopped, report the stop and wait. Only a human clears it.
- **Trust.** Never open a `fix-` or `spec-` change for an untrusted author.
- **`.claude/**` writes.** When the harness blocks a write there, pipe the
  content through `gemba-selfedit <path>` on a branch other than `main`.
