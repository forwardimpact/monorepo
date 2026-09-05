# libwatchdog

<!-- BEGIN:description -->

Guardrail engine for agent teams — count repository activity over a window,
compare it against thresholds, and engage an operator latch when the activity
breaches them.

<!-- END:description -->

A guardrail engine. It counts activity signals over a window, compares each
count against a threshold, and engages an operator latch when any count
breaches. Doubt stops the line: a signal the engine cannot read, and a
response that cannot cover the window, both breach.

The library names no tenant. The latch variable's name, the threshold, and
the window all arrive as arguments.

## Seams

| Seam | Contract |
| ---- | -------- |
| Rule | `{ id, threshold, probe }`. `createRule` builds one. `activityRules` builds the four repository-activity rules. |
| Probe | `async ({ request, repo, defaultBranch, cutoff }) => { count, covered }`. It throws when it cannot read. |
| Latch | `{ read, write }`. `createActionsVariableLatch` reads both variable scopes and writes the repository scope. |
| Policy | `decide(state, { windowMs, now }) => "engage" \| "skip"`. It yields to a stop already in place and to a human who cleared the latch inside the window. |

The next guardrail adds a rule set and a probe. It adds no second script.

## Compose

```js
import {
  activityRules,
  createActionsVariableLatch,
  createRequest,
  decide,
  encodeReason,
  evaluate,
} from "@forwardimpact/libwatchdog";

const request = createRequest({ token, clock });
const windowMs = 2 * 3600000;

const verdict = await evaluate(activityRules(32), {
  request,
  repo: "owner/repo",
  defaultBranch: "main",
  clock,
  windowMs,
});

if (verdict.engage) {
  const latch = createActionsVariableLatch({
    request,
    repo: "owner/repo",
    name: "MY_KILLSWITCH",
  });
  const state = await latch.read();
  if (decide(state, { windowMs, now: clock.now() }) === "engage") {
    await latch.write(
      encodeReason({
        name: "watchdog",
        breaches: verdict.breaches,
        at: verdict.cutoff,
      }),
    );
  }
}
```

## Guide

[Guard an Agent Team's Activity](https://www.gemba.team/docs/guard-activity/index.md)
covers the counters, the threshold and the window, the latch contract, the
clearing rule, the CI wiring, and the exit codes.
