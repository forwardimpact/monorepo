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

  test("--task-file returns file contents", () => {
    const path = join(tmpDir, "task.md");
    writeFileSync(path, "from a file");
    assert.strictEqual(
      resolveTaskContent({ "task-file": path }),
      "from a file",
    );
  });

  test("--task-text returns inline text", () => {
    assert.strictEqual(resolveTaskContent({ "task-text": "inline" }), "inline");
  });

  test("--task-event composes from GITHUB_EVENT_NAME", () => {
    process.env.GITHUB_EVENT_NAME = "issues";
    const out = resolveTaskContent({ "task-event": EVENT_FIXTURE });
    assert.ok(out.includes('New issue: "Investigate flaky CI" (#42)'));
  });

  test("--task-event with explicit --task-event-name overrides env", () => {
    process.env.GITHUB_EVENT_NAME = "wrong";
    const out = resolveTaskContent({
      "task-event": EVENT_FIXTURE,
      "task-event-name": "issues",
    });
    assert.ok(out.startsWith('New issue: "Investigate flaky CI"'));
  });

  test("--task-event without event name throws", () => {
    assert.throws(
      () => resolveTaskContent({ "task-event": EVENT_FIXTURE }),
      /GITHUB_EVENT_NAME or --task-event-name/,
    );
  });

  test("--task-event with workflow_dispatch + dispatch prompt", () => {
    process.env.GITHUB_EVENT_NAME = "workflow_dispatch";
    const out = resolveTaskContent({
      "task-event": EVENT_FIXTURE,
      "task-event-dispatch-prompt": "Hello world",
    });
    assert.strictEqual(out, "Hello world");
  });
});
