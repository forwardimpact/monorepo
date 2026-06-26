---
paths:
  - "**/test/**"
  - "**/tests/**"
---

# Test-file shape

Target ≤400 LOC per `*.test.js`. When a file grows past the ceiling, split it
**by behaviour family** along existing top-level `describe` boundaries: each
sibling owns one cohesive family and is named `<original>-<family>.test.js`
(e.g. `trace-collector-tojson.test.js`). Lift setup shared across the new
siblings into a `test/helpers.js` rather than copy-pasting. A split changes
shape only — it does not alter assertions, rename `src`, or change coverage.

A file whose only over-ceiling cause is a single indivisible behaviour (no
clean family seam) may exceed the ceiling; record it on the allow-list below.
This is judgement, not a lint — there is no automated gate.

## Allow-list (deliberately over 400 LOC)

- `tests/model-validation-data.test.js` — one `validateAllData` contract, no
  describe seam.
- `libraries/libdoc/test/libdoc-llms.test.js` — one llms.txt augmentation
  behaviour.
- `libraries/libbridge/test/callback-handler.test.js` — one
  `createCallbackHandler` request flow.
- `libraries/libharness/test/agent-runner.test.js` — one `AgentRunner` run/resume
  surface.
- `libraries/libbridge/test/dispatcher.test.js` — one `Dispatcher.dispatch`
  flow.
- `libraries/libbridge/test/resume-scheduler.test.js` — one `ResumeScheduler`
  lifecycle.
- `products/pathway/test/build-packs.integration.test.js` — one `generatePacks`
  build over a shared expensive fixture.
