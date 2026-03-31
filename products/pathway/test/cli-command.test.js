import { test, describe } from "node:test";
import assert from "node:assert";

import { getCliCommand } from "../src/lib/cli-command.js";

describe("getCliCommand", () => {
  test("maps root to base command", () => {
    assert.strictEqual(getCliCommand("/"), "bunx fit-pathway");
  });

  test("maps entity list routes", () => {
    assert.strictEqual(getCliCommand("/skill"), "bunx fit-pathway skill");
    assert.strictEqual(
      getCliCommand("/behaviour"),
      "bunx fit-pathway behaviour",
    );
    assert.strictEqual(
      getCliCommand("/discipline"),
      "bunx fit-pathway discipline",
    );
    assert.strictEqual(getCliCommand("/track"), "bunx fit-pathway track");
    assert.strictEqual(getCliCommand("/level"), "bunx fit-pathway level");
    assert.strictEqual(getCliCommand("/driver"), "bunx fit-pathway driver");
    assert.strictEqual(getCliCommand("/stage"), "bunx fit-pathway stage");
    assert.strictEqual(getCliCommand("/tool"), "bunx fit-pathway tool");
  });

  test("maps entity detail routes with ID", () => {
    assert.strictEqual(
      getCliCommand("/skill/testing"),
      "bunx fit-pathway skill testing",
    );
    assert.strictEqual(
      getCliCommand("/behaviour/collaboration"),
      "bunx fit-pathway behaviour collaboration",
    );
    assert.strictEqual(
      getCliCommand("/discipline/software_engineering"),
      "bunx fit-pathway discipline software_engineering",
    );
  });

  test("maps job builder route", () => {
    assert.strictEqual(
      getCliCommand("/job-builder"),
      "bunx fit-pathway job --list",
    );
  });

  test("maps job detail with track", () => {
    assert.strictEqual(
      getCliCommand("/job/software_engineering/level_2/backend"),
      "bunx fit-pathway job software_engineering level_2 --track=backend",
    );
  });

  test("maps job detail without track", () => {
    assert.strictEqual(
      getCliCommand("/job/software_engineering/level_2"),
      "bunx fit-pathway job software_engineering level_2",
    );
  });

  test("maps interview routes", () => {
    assert.strictEqual(
      getCliCommand("/interview-prep"),
      "bunx fit-pathway interview --list",
    );
    assert.strictEqual(
      getCliCommand("/interview/se/l2/backend"),
      "bunx fit-pathway interview se l2 --track=backend",
    );
  });

  test("maps career progress routes", () => {
    assert.strictEqual(
      getCliCommand("/career-progress"),
      "bunx fit-pathway progress --list",
    );
    assert.strictEqual(
      getCliCommand("/progress/se/l2/backend"),
      "bunx fit-pathway progress se l2 --track=backend",
    );
  });

  test("maps agent routes", () => {
    assert.strictEqual(
      getCliCommand("/agent-builder"),
      "bunx fit-pathway agent --list",
    );
    assert.strictEqual(getCliCommand("/agent/se"), "bunx fit-pathway agent se");
    assert.strictEqual(
      getCliCommand("/agent/se/backend"),
      "bunx fit-pathway agent se --track=backend",
    );
    assert.strictEqual(
      getCliCommand("/agent/se/backend/code"),
      "bunx fit-pathway agent se --track=backend --stage=code",
    );
  });

  test("strips query parameters", () => {
    assert.strictEqual(
      getCliCommand("/skill?filter=delivery"),
      "bunx fit-pathway skill",
    );
  });

  test("falls back to base command for unknown routes", () => {
    assert.strictEqual(getCliCommand("/unknown/route"), "bunx fit-pathway");
  });
});
