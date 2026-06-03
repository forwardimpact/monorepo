import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { libmockFindings } from "../scripts/check-libmock-rules.mjs";

const has = (src, needle) =>
  libmockFindings(src).some((f) => f.includes(needle));

describe("check-libmock collaborator-surface rules", () => {
  test("flags inline createMockSubprocess without a libmock import", () => {
    assert.ok(
      has(
        `function createMockSubprocess() { return {}; }`,
        "createMockSubprocess",
      ),
    );
  });

  test("flags inline createMockFinder/GitClient/GhClient", () => {
    assert.ok(has(`function createMockFinder() {}`, "createMockFinder"));
    assert.ok(has(`function createMockGitClient() {}`, "createMockGitClient"));
    assert.ok(has(`function createMockGhClient() {}`, "createMockGhClient"));
  });

  test("flags an inline { run, spawn, calls } subprocess object", () => {
    const src = `const sub = { run: async () => {}, spawn: () => {}, calls: [] };`;
    assert.ok(has(src, "subprocess fake"));
  });

  test("does not flag when the file imports from libmock", () => {
    const src = `import { createMockSubprocess } from "@forwardimpact/libmock";\nfunction createMockFinder() {}`;
    assert.equal(libmockFindings(src).length, 0);
  });

  test("still catches the pre-existing mock.fn shape", () => {
    assert.ok(has(`const fn = mock.fn();`, "mock.fn"));
  });

  test("flags inline GraphIndex mock triple (createMockStorage + new GraphIndex)", () => {
    const src = `import { createMockStorage } from "@forwardimpact/libmock";
const mockStorage = createMockStorage();
const graphIndex = new GraphIndex(mockStorage, n3Store, {}, "test.jsonl");`;
    assert.ok(has(src, "GraphIndex mock triple"));
  });

  test("does not flag GraphIndex triple when the fixture is imported", () => {
    const src = `import { createMockStorage, createGraphIndexFixture } from "@forwardimpact/libmock";
const { mockStorage, graphIndex } = createGraphIndexFixture({ GraphIndex, Store });
// Some test below still does \`new GraphIndex(...)\` for ctor validation:
new GraphIndex(mockStorage, n3Store, {}, "x.jsonl");`;
    assert.equal(
      libmockFindings(src).filter((f) => f.includes("GraphIndex")).length,
      0,
    );
  });

  test("does not flag a real GraphIndex over LocalStorage (no createMockStorage)", () => {
    // products/map/test/pipeline.test.js builds a real GraphIndex over
    // LocalStorage (integration construction, not the mock triple). The rule
    // must not trip on bare `new GraphIndex(...)` without a createMockStorage
    // call in the same file.
    const src = `import { LocalStorage } from "@forwardimpact/libstorage";
import { GraphIndex } from "@forwardimpact/libgraph";
const storage = new LocalStorage("/tmp/x");
const graphIndex = new GraphIndex(storage, n3Store, {}, "test.jsonl");`;
    assert.equal(
      libmockFindings(src).filter((f) => f.includes("GraphIndex")).length,
      0,
    );
  });

  test("flags inline gRPC health definition mock literal", () => {
    const src = `const healthDefinition = {
  Check: {
    path: "/grpc.health.v1.Health/Check",
    requestStream: false,
    responseStream: false,
  },
};`;
    assert.ok(has(src, "gRPC health definition"));
  });

  test("does not flag the gRPC mock literal when the fixture is imported", () => {
    const src = `import { createMockGrpcHealthDefinition } from "@forwardimpact/libmock";
const healthDefinition = {
  Check: {
    path: "/grpc.health.v1.Health/Check",
    requestStream: false,
    responseStream: false,
  },
};`;
    assert.equal(
      libmockFindings(src).filter((f) => f.includes("gRPC health")).length,
      0,
    );
  });

  test("does not flag librpc's real-definition assertions (no Check: { mock literal)", () => {
    // librpc/health.test.js exercises the real healthDefinition by asserting
    // on its properties — no `Check: { … requestStream: … responseStream: …}`
    // object literal appears. The rule must not trip on bare path assertions.
    const src = `import { healthDefinition } from "../src/index.js";
test("Check has the required service definition fields", () => {
  const check = healthDefinition.Check;
  assert.strictEqual(check.path, "/grpc.health.v1.Health/Check");
  assert.strictEqual(check.requestStream, false);
  assert.strictEqual(check.responseStream, false);
});`;
    assert.equal(
      libmockFindings(src).filter((f) => f.includes("gRPC health")).length,
      0,
    );
  });

  test("flags inline repl environment bundle (createInterface + _exitCalled)", () => {
    const src = `const mockReadline = {
  createInterface: () => ({ on: () => {}, prompt: () => {}, close: () => {} }),
};
const mockProcess = {
  exit: (code) => { mockProcess._exitCalled = true; mockProcess._exitCode = code; },
  _exitCalled: false,
};`;
    assert.ok(has(src, "repl environment bundle"));
  });

  test("does not flag the repl bundle when the fixture is imported", () => {
    const src = `import { createReplEnvironment } from "@forwardimpact/libmock";
const { readline, process: mockProcess } = createReplEnvironment();
// downstream assertions still touch the _exitCalled flag and createInterface
if (mockProcess._exitCalled) {/* … */}`;
    assert.equal(
      libmockFindings(src).filter((f) => f.includes("repl environment")).length,
      0,
    );
  });
});
