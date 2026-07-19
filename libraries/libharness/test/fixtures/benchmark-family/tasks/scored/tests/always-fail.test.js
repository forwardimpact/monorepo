const test = require("node:test");
const assert = require("node:assert");

test("trivially fails", () => {
  assert.fail("hidden check exercises the failing-row path");
});
