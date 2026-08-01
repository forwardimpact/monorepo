---
paths:
  - "**/test/**"
  - "**/tests/**"
---

# Test-file shape

Target ≤400 LOC per `*.test.js`. When a file grows past the ceiling, split it
**by behaviour family**. Split along the top-level `describe` boundaries that
already exist. Each sibling owns one cohesive family. Name each sibling
`<original>-<family>.test.js` (e.g. `trace-collector-tojson.test.js`). Lift
the setup shared across the new siblings into a `test/helpers.js`. Do not copy
and paste it. A split changes shape only. It does not alter assertions, rename
`src`, or change coverage.

A file may exceed the ceiling when a single indivisible behaviour is the only
cause (no clean family seam). Record that file on the allow-list below. This
is a judgement. It is not a lint. No automated gate exists.

## Allow-list (deliberately over 400 LOC)

- `tests/model-validation-data.test.js` — one `validateAllData` contract, no
  describe seam.
- `libraries/libdoc/test/libdoc-llms.test.js` — one llms.txt augmentation
  behaviour.
- `libraries/libbridge/test/callback-handler.test.js` — one
  `createCallbackHandler` request flow.
- `libraries/libharness/test/agent-runner.test.js` — one `AgentRunner`
  run/resume surface.
- `libraries/libbridge/test/dispatcher.test.js` — one `Dispatcher.dispatch`
  flow.
- `libraries/libbridge/test/resume-scheduler.test.js` — one `ResumeScheduler`
  lifecycle.
- `products/pathway/test/build-packs.integration.test.js` — one `generatePacks`
  build over a shared expensive fixture.
