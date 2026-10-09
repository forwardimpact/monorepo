import { test, describe } from "node:test";
import assert from "node:assert";

import { sliceLabel } from "../src/format.js";

describe("sliceLabel", () => {
  test('renders "*" as all rows', () => {
    assert.strictEqual(sliceLabel("*"), "* (all rows)");
  });

  test("renders a name as itself", () => {
    assert.strictEqual(sliceLabel("nightly-review"), "nightly-review");
  });
});
