import { describe, test } from "node:test";
import assert from "node:assert";

import { mergeConfigFragment, mergeEnvEntries } from "../src/merge.js";

describe("mergeConfigFragment — namespace ownership table", () => {
  test("absent top-level key → write subtree", () => {
    const { result, conflicts } = mergeConfigFragment({
      existing: { a: { x: 1 } },
      fragment: { b: { y: 2 } },
    });
    assert.deepEqual(result, { a: { x: 1 }, b: { y: 2 } });
    assert.deepEqual(conflicts, []);
  });

  test("present, deep-equal subtree → no-op", () => {
    const { result, conflicts } = mergeConfigFragment({
      existing: { a: { x: 1, y: 2 } },
      fragment: { a: { y: 2, x: 1 } }, // key order intentionally different
    });
    assert.deepEqual(result, { a: { x: 1, y: 2 } });
    assert.deepEqual(conflicts, []);
  });

  test("present, leaf disagrees → refuse with leaf-path diagnostic", () => {
    const { result, conflicts } = mergeConfigFragment({
      existing: { product: { x: { foo: "a" } } },
      fragment: { product: { x: { foo: "b" } } },
    });
    assert.deepEqual(result, { product: { x: { foo: "a" } } });
    assert.deepEqual(conflicts, [{ kind: "config", path: "product.x.foo" }]);
  });

  test("present, leaf disagrees but top-level in overwrites → write", () => {
    const { result, conflicts } = mergeConfigFragment({
      existing: { product: { x: { foo: "a" } } },
      fragment: { product: { x: { foo: "b" } } },
      overwrites: ["product"],
    });
    assert.deepEqual(result, { product: { x: { foo: "b" } } });
    assert.deepEqual(conflicts, []);
  });

  test("scalar/object shape mismatch → conflict at parent path", () => {
    const { conflicts } = mergeConfigFragment({
      existing: { product: { x: "scalar" } },
      fragment: { product: { x: { foo: "b" } } },
    });
    assert.deepEqual(conflicts, [{ kind: "config", path: "product.x" }]);
  });

  test("array contents differ → conflict at the array path", () => {
    const { conflicts } = mergeConfigFragment({
      existing: { product: { items: [1, 2] } },
      fragment: { product: { items: [1, 3] } },
    });
    assert.deepEqual(conflicts, [{ kind: "config", path: "product.items" }]);
  });

  test("disjoint sub-keys under shared top-level key deep-merge (cross-namespace one level deeper)", () => {
    const { result, conflicts } = mergeConfigFragment({
      existing: { product: { guide: { sys: "g" } } },
      fragment: { product: { map: { sys: "m" } } },
    });
    assert.deepEqual(result, {
      product: { guide: { sys: "g" }, map: { sys: "m" } },
    });
    assert.deepEqual(conflicts, []);
  });

  test("disjoint sub-keys plus matching leaves under shared top-level merge", () => {
    const { result, conflicts } = mergeConfigFragment({
      existing: { product: { shared: { v: 1 }, guide: { sys: "g" } } },
      fragment: { product: { shared: { v: 1 }, map: { sys: "m" } } },
    });
    assert.deepEqual(result, {
      product: {
        shared: { v: 1 },
        guide: { sys: "g" },
        map: { sys: "m" },
      },
    });
    assert.deepEqual(conflicts, []);
  });

  test("disjoint sibling plus one leaf disagreement → refuse at the disagreeing leaf", () => {
    const { conflicts } = mergeConfigFragment({
      existing: { product: { guide: { sys: "g" }, shared: { v: 1 } } },
      fragment: { product: { map: { sys: "m" }, shared: { v: 2 } } },
    });
    assert.deepEqual(conflicts, [{ kind: "config", path: "product.shared.v" }]);
  });
});

describe("mergeConfigFragment — convergence (production nested encoding)", () => {
  // Use the nested form fit-guide actually emits — top-level keys
  // `init`/`product`/`service` with product/service slices nested
  // beneath. Tests that use literal-dotted top-level keys
  // (`"product.guide"`) wouldn't catch a regression in the
  // disjoint-sub-key merge path the real callers walk.
  test("disjoint nested namespaces under shared top-level: A→B and B→A produce identical canonical bytes", () => {
    const fragA = { product: { guide: { systemPrompt: "g" } } };
    const fragB = { product: { map: { systemPrompt: "m" } } };
    const ab = mergeConfigFragment({
      existing: mergeConfigFragment({ existing: {}, fragment: fragA }).result,
      fragment: fragB,
    }).result;
    const ba = mergeConfigFragment({
      existing: mergeConfigFragment({ existing: {}, fragment: fragB }).result,
      fragment: fragA,
    }).result;
    assert.equal(canonical(ab), canonical(ba));
  });

  test("A→B→A→B converges to the post-AB state byte-for-byte (nested form)", () => {
    const fragA = { product: { guide: { v: 1 } }, service: { mcp: { v: 1 } } };
    const fragB = { product: { map: { v: 2 } }, service: { other: { v: 2 } } };
    let state = {};
    state = mergeConfigFragment({ existing: state, fragment: fragA }).result;
    state = mergeConfigFragment({ existing: state, fragment: fragB }).result;
    const ab = canonical(state);
    state = mergeConfigFragment({ existing: state, fragment: fragA }).result;
    state = mergeConfigFragment({ existing: state, fragment: fragB }).result;
    assert.equal(canonical(state), ab);
  });
});

describe("mergeEnvEntries — namespace ownership table", () => {
  test("absent key → write", () => {
    const { result, conflicts } = mergeEnvEntries({
      existing: { A: "1" },
      fragment: { B: "2" },
    });
    assert.deepEqual(result, { A: "1", B: "2" });
    assert.deepEqual(conflicts, []);
  });

  test("present, same value → no-op", () => {
    const { result, conflicts } = mergeEnvEntries({
      existing: { A: "1" },
      fragment: { A: "1" },
    });
    assert.deepEqual(result, { A: "1" });
    assert.deepEqual(conflicts, []);
  });

  test("present, different value → refuse with bare-key path", () => {
    const { result, conflicts } = mergeEnvEntries({
      existing: { MCP_TOKEN: "old" },
      fragment: { MCP_TOKEN: "new" },
    });
    assert.deepEqual(result, { MCP_TOKEN: "old" });
    assert.deepEqual(conflicts, [{ kind: "env", path: "MCP_TOKEN" }]);
  });

  test("present, different value, overwrites contains key → write", () => {
    const { result, conflicts } = mergeEnvEntries({
      existing: { MCP_TOKEN: "old" },
      fragment: { MCP_TOKEN: "new" },
      overwrites: ["MCP_TOKEN"],
    });
    assert.deepEqual(result, { MCP_TOKEN: "new" });
    assert.deepEqual(conflicts, []);
  });

  test("empty-string fragment value distinct from undefined existing → write", () => {
    const { result, conflicts } = mergeEnvEntries({
      existing: {},
      fragment: { A: "" },
    });
    assert.deepEqual(result, { A: "" });
    assert.deepEqual(conflicts, []);
  });
});

function canonical(obj) {
  const keys = Object.keys(obj).sort();
  return JSON.stringify(obj, keys);
}
