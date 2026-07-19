const test = require("node:test");
const assert = require("node:assert");

// Runs under the harness engine's `node --test`, where it fails by design to
// exercise the failing-row path. A bare `bun test` sweep that discovers this
// fixture skips it instead of reddening the suite.
test("trivially fails", { skip: typeof Bun !== "undefined" }, () => {
  assert.fail("hidden check exercises the failing-row path");
});
