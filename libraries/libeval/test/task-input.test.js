import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import { resolveTaskContent } from "../src/commands/task-input.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const EVENT_FIXTURE = join(HERE, "fixtures", "events", "issues-opened.json");

describe("resolveTaskContent mutual exclusion", () => {
  test("none of the three set throws", () => {
    assert.throws(
      () => resolveTaskContent({}),
      /one of --task-file, --task-text, --task-event is required/,
    );
  });

  test("--task-file + --task-text together throws", () => {
    assert.throws(
      () => resolveTaskContent({ "task-file": "/dev/null", "task-text": "x" }),
      /mutually exclusive/,
    );
  });

  test("--task-text + --task-event together throws", () => {
    assert.throws(
      () =>
        resolveTaskContent({
          "task-text": "x",
          "task-event": EVENT_FIXTURE,
        }),
      /mutually exclusive/,
    );
  });

  test("--task-file + --task-event together throws", () => {
    assert.throws(
      () =>
        resolveTaskContent({
          "task-file": "/dev/null",
          "task-event": EVENT_FIXTURE,
        }),
      /mutually exclusive/,
    );
  });
});

describe("resolveTaskContent dispatch", () => {
  let tmpDir;
  let savedEventName;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "task-input-"));
    savedEventName = process.env.GITHUB_EVENT_NAME;
    delete process.env.GITHUB_EVENT_NAME;
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    if (savedEventName === undefined) {
      delete process.env.GITHUB_EVENT_NAME;
    } else {
      process.env.GITHUB_EVENT_NAME = savedEventName;
    }
  });

  test("--task-file returns file contents and undefined amend", () => {
    const path = join(tmpDir, "task.md");
    writeFileSync(path, "from a file");
    assert.deepStrictEqual(resolveTaskContent({ "task-file": path }), {
      task: "from a file",
      amend: undefined,
    });
  });

  test("--task-text returns inline text and undefined amend", () => {
    assert.deepStrictEqual(resolveTaskContent({ "task-text": "inline" }), {
      task: "inline",
      amend: undefined,
    });
  });

  test("--task-amend on --task-text returns both", () => {
    assert.deepStrictEqual(
      resolveTaskContent({ "task-text": "inline", "task-amend": "PS" }),
      { task: "inline", amend: "PS" },
    );
  });

  test("--task-event composes from GITHUB_EVENT_NAME", () => {
    process.env.GITHUB_EVENT_NAME = "issues";
    const { task, amend } = resolveTaskContent({ "task-event": EVENT_FIXTURE });
    assert.ok(task.includes('New issue: "Investigate flaky CI" (#42)'));
    assert.strictEqual(amend, "");
  });

  test("--task-event without GITHUB_EVENT_NAME throws", () => {
    assert.throws(
      () => resolveTaskContent({ "task-event": EVENT_FIXTURE }),
      /GITHUB_EVENT_NAME/,
    );
  });

  test("--task-event with workflow_dispatch returns empty task + inputs.prompt as amend", () => {
    process.env.GITHUB_EVENT_NAME = "workflow_dispatch";
    const dispatchFixture = join(tmpDir, "dispatch.json");
    writeFileSync(
      dispatchFixture,
      JSON.stringify({ inputs: { prompt: "Hello world" } }),
    );
    assert.deepStrictEqual(
      resolveTaskContent({ "task-event": dispatchFixture }),
      { task: "", amend: "Hello world" },
    );
  });

  test("explicit --task-amend overrides payload.inputs.prompt on --task-event", () => {
    process.env.GITHUB_EVENT_NAME = "issues";
    const path = join(tmpDir, "with-input.json");
    writeFileSync(
      path,
      JSON.stringify({
        action: "opened",
        issue: {
          number: 1,
          title: "t",
          html_url: "u",
          user: { login: "a", type: "User" },
        },
        inputs: { prompt: "from payload" },
      }),
    );
    const { amend } = resolveTaskContent({
      "task-event": path,
      "task-amend": "explicit",
    });
    assert.strictEqual(amend, "explicit");
  });
});
