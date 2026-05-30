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
});
