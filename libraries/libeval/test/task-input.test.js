import { describe, test } from "node:test";
import assert from "node:assert";

import { createMockFs } from "@forwardimpact/libmock";

import { resolveTaskContent } from "../src/commands/task-input.js";

const EVENT_FIXTURE = "/events/issues-opened.json";
const ISSUES_OPENED = JSON.stringify({
  action: "opened",
  issue: {
    number: 42,
    title: "Investigate flaky CI",
    html_url: "https://github.com/acme/repo/issues/42",
    user: { login: "alice", type: "User" },
  },
});

/**
 * Build a runtime over an in-memory fs seeded with `files` and a
 * test-controlled env map. `resolveTaskContent` loads `--task-file` /
 * `--task-event` via `runtime.fsSync.readFileSync`.
 */
function makeRuntime({ env = {}, files = {} } = {}) {
  return {
    fsSync: createMockFs(files),
    proc: { env: { ...env } },
  };
}

describe("resolveTaskContent mutual exclusion", () => {
  test("none of the three set throws", () => {
    assert.throws(
      () => resolveTaskContent({}, makeRuntime()),
      /one of --task-file, --task-text, --task-event is required/,
    );
  });

  test("--task-file + --task-text together throws", () => {
    assert.throws(
      () =>
        resolveTaskContent(
          { "task-file": "/dev/null", "task-text": "x" },
          makeRuntime(),
        ),
      /mutually exclusive/,
    );
  });

  test("--task-text + --task-event together throws", () => {
    assert.throws(
      () =>
        resolveTaskContent(
          {
            "task-text": "x",
            "task-event": EVENT_FIXTURE,
          },
          makeRuntime(),
        ),
      /mutually exclusive/,
    );
  });

  test("--task-file + --task-event together throws", () => {
    assert.throws(
      () =>
        resolveTaskContent(
          {
            "task-file": "/dev/null",
            "task-event": EVENT_FIXTURE,
          },
          makeRuntime(),
        ),
      /mutually exclusive/,
    );
  });
});

describe("resolveTaskContent dispatch", () => {
  test("--task-file returns file contents and undefined amend", () => {
    assert.deepStrictEqual(
      resolveTaskContent(
        { "task-file": "/work/task.md" },
        makeRuntime({ files: { "/work/task.md": "from a file" } }),
      ),
      {
        task: "from a file",
        amend: undefined,
      },
    );
  });

  test("--task-text returns inline text and undefined amend", () => {
    assert.deepStrictEqual(
      resolveTaskContent({ "task-text": "inline" }, makeRuntime()),
      {
        task: "inline",
        amend: undefined,
      },
    );
  });

  test("--task-amend on --task-text returns both", () => {
    assert.deepStrictEqual(
      resolveTaskContent(
        { "task-text": "inline", "task-amend": "PS" },
        makeRuntime(),
      ),
      { task: "inline", amend: "PS" },
    );
  });

  test("--task-event composes from GITHUB_EVENT_NAME", () => {
    const { task, amend } = resolveTaskContent(
      { "task-event": EVENT_FIXTURE },
      makeRuntime({
        env: { GITHUB_EVENT_NAME: "issues" },
        files: { [EVENT_FIXTURE]: ISSUES_OPENED },
      }),
    );
    assert.ok(task.includes('New issue: "Investigate flaky CI" (#42)'));
    assert.strictEqual(amend, "");
  });

  test("--task-event without GITHUB_EVENT_NAME throws", () => {
    assert.throws(
      () =>
        resolveTaskContent(
          { "task-event": EVENT_FIXTURE },
          makeRuntime({ files: { [EVENT_FIXTURE]: ISSUES_OPENED } }),
        ),
      /GITHUB_EVENT_NAME/,
    );
  });

  test("--task-event with workflow_dispatch returns empty task + inputs.prompt as amend", () => {
    const dispatchFixture = "/work/dispatch.json";
    assert.deepStrictEqual(
      resolveTaskContent(
        { "task-event": dispatchFixture },
        makeRuntime({
          env: { GITHUB_EVENT_NAME: "workflow_dispatch" },
          files: {
            [dispatchFixture]: JSON.stringify({
              inputs: { prompt: "Hello world" },
            }),
          },
        }),
      ),
      { task: "", amend: "Hello world" },
    );
  });

  test("explicit --task-amend overrides payload.inputs.prompt on --task-event", () => {
    const path = "/work/with-input.json";
    const { amend } = resolveTaskContent(
      {
        "task-event": path,
        "task-amend": "explicit",
      },
      makeRuntime({
        env: { GITHUB_EVENT_NAME: "issues" },
        files: {
          [path]: JSON.stringify({
            action: "opened",
            issue: {
              number: 1,
              title: "t",
              html_url: "u",
              user: { login: "a", type: "User" },
            },
            inputs: { prompt: "from payload" },
          }),
        },
      }),
    );
    assert.strictEqual(amend, "explicit");
  });
});
