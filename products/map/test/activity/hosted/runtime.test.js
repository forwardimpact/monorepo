import { test, describe } from "node:test";
import assert from "node:assert";
import { createHostedRuntime } from "../../../supabase/functions/_shared/runtime.ts";

describe("createHostedRuntime", () => {
  test("exposes a clock with now() and is frozen", () => {
    const runtime = createHostedRuntime();
    assert.strictEqual(typeof runtime.clock.now(), "number");
    assert.ok(Object.isFrozen(runtime));
    assert.ok(Object.isFrozen(runtime.clock));
  });
});
