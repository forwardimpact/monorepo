const test = require("node:test");
const assert = require("node:assert");

// Fails by design to exercise the engine's failing-row path. The engine runs
// each check with `bun test` under the hook env, so `$TASK_ID` is set only
// there. Keying the skip on that env var — not on the runtime — keeps the
// check failing where it must while a bare `bun test` sweep that discovers
// the fixture skips it instead of going red.
test("trivially fails", { skip: !process.env.TASK_ID }, () => {
  assert.fail("hidden check exercises the failing-row path");
});
