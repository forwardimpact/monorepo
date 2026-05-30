import { test, describe } from "node:test";
import assert from "node:assert";

import { freezeInvocationContext } from "../src/invocation-context.js";

// Fixture is intentionally identical to libraries/libui/test/invocation-context.test.js
// to serve as a drift gate (design D1). Change both together.
const fixture = {
  data: { skills: ["a", "b"] },
  args: { id: "testing" },
  options: { json: true, format: "table", tag: ["a", "b"] },
};

describe("freezeInvocationContext", () => {
  test("returns a frozen object with data, args, and options", () => {
    const ctx = freezeInvocationContext(fixture);
    assert.strictEqual(Object.isFrozen(ctx), true);
    assert.deepStrictEqual(ctx.data, fixture.data);
    assert.strictEqual(ctx.args.id, "testing");
    assert.strictEqual(ctx.options.json, true);
    assert.strictEqual(ctx.options.format, "table");
    assert.deepStrictEqual(ctx.options.tag, ["a", "b"]);
  });

  test("freezes args", () => {
    const ctx = freezeInvocationContext(fixture);
    assert.strictEqual(Object.isFrozen(ctx.args), true);
    assert.throws(() => {
      ctx.args.id = "other";
    }, TypeError);
  });

  test("freezes options", () => {
    const ctx = freezeInvocationContext(fixture);
    assert.strictEqual(Object.isFrozen(ctx.options), true);
    assert.throws(() => {
      ctx.options.json = false;
    }, TypeError);
  });

  test("freezes array values inside options", () => {
    const ctx = freezeInvocationContext(fixture);
    assert.strictEqual(Object.isFrozen(ctx.options.tag), true);
    assert.throws(() => {
      ctx.options.tag.push("c");
    }, TypeError);
  });

  test("membership test works on frozen options", () => {
    const ctx = freezeInvocationContext(fixture);
    assert.strictEqual("json" in ctx.options, true);
    assert.strictEqual("missing" in ctx.options, false);
  });

  test("does not freeze data (host-owned)", () => {
    const ctx = freezeInvocationContext(fixture);
    assert.strictEqual(Object.isFrozen(ctx.data), false);
  });

  test("copies args and options so mutations to the original do not propagate", () => {
    const raw = {
      data: {},
      args: { id: "x" },
      options: { json: true },
    };
    const ctx = freezeInvocationContext(raw);
    raw.args.id = "mutated";
    raw.options.json = false;
    assert.strictEqual(ctx.args.id, "x");
    assert.strictEqual(ctx.options.json, true);
  });

  // Spec 1370: the deps slot carries host-injected collaborators.
  test("freezes deps when provided", () => {
    const deps = { runtime: { clock: {} } };
    const ctx = freezeInvocationContext({ ...fixture, deps });
    assert.strictEqual(Object.isFrozen(ctx.deps), true);
    assert.strictEqual(ctx.deps.runtime, deps.runtime);
  });

  test("deps defaults to undefined when omitted", () => {
    const ctx = freezeInvocationContext(fixture);
    assert.strictEqual(ctx.deps, undefined);
  });
});
