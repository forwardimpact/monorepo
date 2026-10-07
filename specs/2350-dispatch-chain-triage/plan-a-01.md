# Plan 2350-a Part 01: The actor line, `stand_down`, and the trace verbs

The `libharness` half of [design-a.md](design-a.md): the composer renders the
actor class it is handed, the lead can stand down, the participants no longer
own that rule, and the trace verbs print the verdict.

Depends on: nothing. Route: `staff-engineer`.

## Step 1: The composer renders the actor line

Prepend one line to every event template from the class and login the action
hands over, and render the sender on the label templates.

Modified: `libraries/libharness/src/events/github.js`

```js
// The actor line. The action classifies the acting account before checkout
// and hands the class and login over as environment. The composer renders
// what it is handed and classifies nothing. A self or bot actor carries the
// stand-down rule, which the lead alone reads.
export const ACTOR_LINE = "Caused by: ${ACTOR_CLASS} (@${ACTOR_LOGIN}).";

export const ACTOR_LINE_STAND_DOWN =
  ACTOR_LINE +
  " Engage nobody unless the body hands new actionable work to a named agent. Otherwise end with verdict stand_down.";

export const TASK_TEMPLATE_ISSUE_LABELED =
  'Label "${LABEL}" was added to issue "${ISSUE_TITLE}" (#${NUMBER}) by @${SENDER}. Issue URL: ${URL}.';

export const TASK_TEMPLATE_PR_LABELED =
  'Label "${LABEL}" was added to PR "${PR_TITLE}" (#${NUMBER}) by @${SENDER}. PR URL: ${URL}.';
```

- `extractCommonFields` gains `SENDER: payload.sender?.login ?? "unknown"`,
  placed before `BODY`.
- `composeTaskFromGitHubEvent(payload, eventName, actor = {})` takes a third
  argument `{ actorClass, actorLogin }`. After it renders the template it
  prepends the actor line when `actorClass` is a non-empty string:
  `ACTOR_LINE_STAND_DOWN` for `self` and `bot`, `ACTOR_LINE` for every other
  class, joined to the task with `"\n\n"`. The `workflow_dispatch` branch is
  unchanged and returns no line. An absent `actorClass` renders no line.

Verify: `bun test libraries/libharness/test/events-github.test.js` passes after
step 7.

## Step 2: The task input reads the actor from the environment

Read the two variables the action sets, as `GITHUB_EVENT_NAME` is read.

Modified: `libraries/libharness/src/commands/task-input.js`

```js
const payload = JSON.parse(runtime.fsSync.readFileSync(taskEvent, "utf8"));
const { KATA_ACTOR_CLASS: actorClass, KATA_ACTOR_LOGIN: actorLogin } =
  runtime.proc.env;
const composed = composeTaskFromGitHubEvent(payload, eventName, {
  actorClass,
  actorLogin,
});
```

The docstring names the two variables beside `GITHUB_EVENT_NAME`.

Verify: `bun test libraries/libharness/test/task-input.test.js` passes after
step 7.

## Step 3: `Conclude` and `Adjourn` accept `stand_down`

Widen the facilitator's `Conclude` and the discuss `Adjourn`. Leave the
supervisor and judge tools on their two verdicts. One constant carries the
verdict.

Modified: `libraries/libharness/src/orchestration-toolkit.js`,
`libraries/libharness/src/discuss-tools.js`,
`libraries/libharness/src/orchestration-loop.js`,
`libraries/libharness/src/discusser.js`

| File                       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `orchestration-toolkit.js` | Export `STAND_DOWN = "stand_down"`, `FACILITATOR_VERDICTS = ["success", "failure", STAND_DOWN]`, `BINARY_VERDICTS = ["success", "failure"]`, and `DISCUSS_VERDICTS = ["adjourned", "failed", STAND_DOWN]`. `concludeTool(ctx, verdicts)` builds the enum from its argument; the facilitator server passes `FACILITATOR_VERDICTS`, the supervisor and judge servers `BINARY_VERDICTS`. `terminalDesc(verb, verdicts, tail = "")` builds both descriptions: the lead line, the quoted verdict list, the sentence "`stand_down` ends a run the task asked you to stand down on and counts as a successful exit." only when the list includes `STAND_DOWN`, then `tail`. `CONCLUDE_DESC(verdicts)` calls it; `ADJOURN_DESC` calls it with `DISCUSS_VERDICTS` and the existing "Cancels any unanswered Asks." tail. The comment above the descriptions names the facilitator's third verdict. |
| `discuss-tools.js`         | The `Adjourn` enum is `DISCUSS_VERDICTS`, imported from the toolkit.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `orchestration-loop.js`    | `const success = this.ctx.concluded && (this.ctx.verdict === "success" \|\| this.ctx.verdict === STAND_DOWN);`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `discusser.js`             | `const success = verdict === "adjourned" \|\| verdict === STAND_DOWN;`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

Verify:
`bun test libraries/libharness/test/orchestration-toolkit-handlers.test.js libraries/libharness/test/discuss-tools.test.js libraries/libharness/test/facilitator-orchestration.test.js libraries/libharness/test/discusser.test.js`
passes after step 7.

## Step 4: The participant prompts drop the stand-down sentence

Remove the one line that made each participant a reader of the rule.

Modified: `libraries/libharness/src/facilitator.js`,
`libraries/libharness/src/supervisor.js`,
`libraries/libharness/src/discuss-tools.js`

| Prompt                            | Line removed                                                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `FACILITATED_AGENT_SYSTEM_PROMPT` | `"If the task already contains a completed response with no new human input after it, \`Answer\` that no further action is needed.\n" +`               |
| `AGENT_SYSTEM_PROMPT`             | The same line.                                                                                                                                         |
| `DISCUSS_AGENT_SYSTEM_PROMPT`     | `"The task can already contain a completed response with no new human input after it. In that case, \`Answer\` that no further action is needed.\n" +` |

`"Do not redo completed work."` stays in all three.

Verify: `rg -n 'no further action' libraries/libharness/src` prints nothing.

## Step 5: The trace document carries the orchestrator summary

Expose the collector's capture of the last orchestrator summary to the query
layer.

Modified: `libraries/libharness/src/trace-collector.js`,
`libraries/libharness/src/trace-query.js`

```js
  // trace-collector.js toJSON()
    return {
      version: "1.3.0",
      metadata: …,
      initEvent: this.initEvent ?? null,
      // The last orchestrator summary, when the trace carries one. A run-mode
      // trace and a split lane carry no orchestrator source and omit it.
      ...(this.orchestratorSummary && { orchestrator: this.orchestratorSummary }),
      turns: this.turns,
      summary: …,
    };
```

```js
  // trace-query.js
  constructor(trace) {
    …
    this.orchestrator = trace.orchestrator ?? null;
  }

  overview() {
    …
    return {
      metadata: this.metadata,
      summary: this.summary,
      verdict: this.orchestrator?.verdict ?? null,
      …
    };
  }
```

The `#formatResultTail` docstring in `trace-collector.js` names `stand_down`
beside `success` and `failure`.

Verify:
`bun test libraries/libharness/test/trace-collector-output.test.js libraries/libharness/test/trace-query.test.js libraries/libharness/test/trace-parity.test.js libraries/libharness/test/fixture-equivalence.test.js libraries/libharness/test/trace-1220-equivalence.test.js`
passes after step 7.

## Step 6: One NDJSON scanner for the cost and callback verbs

**As shipped (#2172):** this step did not ship as written. `readTraceSummary`
reads a missing verdict as `"failed"`. With that reader, `cost` reported
`failed` and `overview` reported null for the same trace when the run had no
`Conclude`. The cost verb reads the NDJSON verdict through the trace collector
instead, the one reader design-a.md names. `trace-summary.js` does not exist,
and `callback.js` changed only in its docstring. The `computeTraceCost` shape
and the `Verdict:` line ship as written below.

Move the callback command's scanner into its own module and read the verdict
through it in the cost verb.

Created: `libraries/libharness/src/trace-summary.js`

Modified: `libraries/libharness/src/commands/callback.js`,
`libraries/libharness/src/commands/trace.js`

| File               | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `trace-summary.js` | `export function readTraceSummary(content)`: the function moved verbatim from `callback.js`, with its docstring's verdict list widened to name `stand_down`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `callback.js`      | Imports `readTraceSummary` from `../trace-summary.js`. The local function and its docstring leave.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `trace.js`         | Imports `readTraceSummary` from `../trace-summary.js`. `computeTraceCost(content)` returns `{ totalCostUsd, bySource, verdict }`: the structured-JSON branch adds `verdict: parsed.orchestrator?.verdict ?? null`, the NDJSON branch adds `verdict: readTraceSummary(content)?.verdict ?? null`. `runCostCommand` keeps its early return on a missing file first and passes the object through unchanged: `writeJSON` prints it, and `renderCostMarkdown(cost)` appends `""` and `` `Verdict: \`${cost.verdict}\`` `` after the participant sentence when `cost.verdict` is set. The three docstrings that fix the shape as `{totalCostUsd, bySource}` (`runCostCommand`, `renderCostMarkdown`'s `@param`, `computeTraceCost`'s `@returns`) gain `verdict`. |

Verify:
`bun test libraries/libharness/test/trace-cost.test.js libraries/libharness/test/callback.test.js`
passes after step 7.

## Step 7: Tests

Add the assertions the design names and retire the guard wording.

Modified: `libraries/libharness/test/events-github.test.js`,
`libraries/libharness/test/fixtures/events/issues-labeled.json`,
`libraries/libharness/test/fixtures/events/pr-labeled.json`,
`libraries/libharness/test/fixtures/trace-query-1220/*.json` (regenerated),
`libraries/libharness/test/task-input.test.js`,
`libraries/libharness/test/orchestration-toolkit-handlers.test.js`,
`libraries/libharness/test/discuss-tools.test.js`,
`libraries/libharness/test/facilitator-orchestration.test.js`,
`libraries/libharness/test/discusser.test.js`,
`libraries/libharness/test/prompts.test.js`,
`libraries/libharness/test/trace-collector-output.test.js`,
`libraries/libharness/test/trace-query-helpers.js`,
`libraries/libharness/test/trace-query.test.js`,
`libraries/libharness/test/trace-cost.test.js`

| File                                     | Assertions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `events-github.test.js`                  | One `describe` over every existing fixture: with `{ actorClass: "self", actorLogin: "acme-team[bot]" }` the task starts with `Caused by: self (@acme-team[bot]). Engage nobody` and the template text follows a blank line; with `{ actorClass: "bot", actorLogin: "dependabot[bot]" }` the same form; with `{ actorClass: "human", actorLogin: "alice" }` the task starts with `Caused by: human (@alice).\n\n` and contains no `stand_down`; with no third argument the task carries no `Caused by:` line. The two labeled expectations gain `by @carol` from the fixtures' new `sender`. `workflow_dispatch` with an actor still returns an empty task. |
| `issues-labeled.json`, `pr-labeled.json` | Gain `"sender": { "login": "carol", "type": "User" }`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `trace-query-1220/*.json`                | Regenerate with `bun libraries/libharness/test/fixtures/trace-query-1220/build.mjs`, then `bun run check:fix`; `overview.json` gains `"verdict": null`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `task-input.test.js`                     | `--task-event` with `KATA_ACTOR_CLASS=self` and `KATA_ACTOR_LOGIN=acme-team[bot]` in `env` yields a task that starts with `Caused by: self`; without the variables the task starts with `New issue:`.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `orchestration-toolkit-handlers.test.js` | `createConcludeHandler` with `verdict: "stand_down"` sets `ctx.verdict` to `stand_down`. `FACILITATOR_VERDICTS` includes `STAND_DOWN` and `BINARY_VERDICTS` does not. The SDK enforces the enum at the tool boundary; part 04's acceptance run proves it live.                                                                                                                                                                                                                                                                                                                                                                                             |
| `discuss-tools.test.js`                  | `createAdjournHandler` with `verdict: "stand_down"` sets `ctx.verdict` to `stand_down`. `DISCUSS_VERDICTS` includes `STAND_DOWN`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `facilitator-orchestration.test.js`      | A lead that concludes `stand_down` yields `success: true` from `run()` and a terminal `summary` event with `verdict: "stand_down"`. Use the file's existing mock-runner shape.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `discusser.test.js`                      | `ctx.verdict = "stand_down"` yields `success: true` and `verdict: "stand_down"` on the result and on the last summary event.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `prompts.test.js`                        | Rename the `describe` to `"JIDOKA L0 — agents name Answer and do not redo completed work"`, the inner test to `` `${name} does not redo completed work` ``, and its assertion message to `"must not redo completed work"`. Add one test per agent prompt: `assert.ok(!prompt.includes("no further action"))`.                                                                                                                                                                                                                                                                                                                                              |
| `trace-collector-output.test.js`         | The two version pins read `1.3.0`. A facilitated trace with a summary event yields `trace.orchestrator.verdict`; a run-mode trace yields no `orchestrator` key.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `trace-query-helpers.js`                 | `version: "1.3.0"`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `trace-query.test.js`                    | `overview().verdict` is `null` without the field and `"stand_down"` with `orchestrator: { verdict: "stand_down" }`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `trace-cost.test.js`                     | An NDJSON trace whose last orchestrator summary carries `verdict: "stand_down"` yields `verdict: "stand_down"` in the JSON output and a `Verdict: \`stand_down\``line in the markdown; a structured document with`orchestrator: { verdict: "stand_down" }`yields the same; a trace with no summary yields`verdict: null`and no line. The seeded runtime keeps its`{ fsSync, proc }` shape.                                                                                                                                                                                                                                                                 |

Verify: `bun run test` and `bun run check` pass at the repository root, and
`rg -n 'recursion guard' libraries/libharness` prints nothing.
