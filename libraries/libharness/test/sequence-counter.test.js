import { describe, test } from "node:test";
import assert from "node:assert";

import {
  SequenceCounter,
  createSequenceCounter,
} from "../src/sequence-counter.js";

describe("SequenceCounter", () => {
  test("starts at 0 and increments monotonically", () => {
    const counter = new SequenceCounter();
    assert.strictEqual(counter.next(), 0);
    assert.strictEqual(counter.next(), 1);
    assert.strictEqual(counter.next(), 2);
  });

  test("multiple counters are independent", () => {
    const a = new SequenceCounter();
    const b = new SequenceCounter();
    assert.strictEqual(a.next(), 0);
    assert.strictEqual(a.next(), 1);
    assert.strictEqual(b.next(), 0);
    assert.strictEqual(a.next(), 2);
    assert.strictEqual(b.next(), 1);
  });

  test("createSequenceCounter factory returns instance", () => {
    const counter = createSequenceCounter();
    assert.ok(counter instanceof SequenceCounter);
    assert.strictEqual(counter.next(), 0);
  });
});
