import { test, describe } from "node:test";
import assert from "node:assert";

import { getCliCommand } from "../src/lib/cli-command.js";

describe("getCliCommand", () => {
  test("maps root to base command", () => {
    assert.strictEqual(getCliCommand("/"), "npx fit-pathway");
  });

  test("maps entity list routes", () => {
    assert.strictEqual(getCliCommand("/skill"), "npx fit-pathway skill");
    assert.strictEqual(
      getCliCommand("/behaviour"),
      "npx fit-pathway behaviour",
    );
    assert.strictEqual(
      getCliCommand("/discipline"),
      "npx fit-pathway discipline",
    );
    assert.strictEqual(getCliCommand("/track"), "npx fit-pathway track");
    assert.strictEqual(getCliCommand("/level"), "npx fit-pathway level");
    assert.strictEqual(getCliCommand("/driver"), "npx fit-pathway driver");
    assert.strictEqual(getCliCommand("/stage"), "npx fit-pathway stage");
    assert.strictEqual(getCliCommand("/tool"), "npx fit-pathway tool");
  });

  test("maps entity detail routes with ID", () => {
    assert.strictEqual(
      getCliCommand("/skill/testing"),
      "npx fit-pathway skill testing",
    );
    assert.strictEqual(
      getCliCommand("/behaviour/collaboration"),
      "npx fit-pathway behaviour collaboration",
    );
    assert.strictEqual(
      getCliCommand("/discipline/software_engineering"),
      "npx fit-pathway discipline software_engineering",
    );
  });

  test("maps job builder route", () => {
    assert.strictEqual(
      getCliCommand("/job-builder"),
      "npx fit-pathway job --list",
    );
  });

  test("maps job detail with track", () => {
    assert.strictEqual(
      getCliCommand("/job/software_engineering/level_2/backend"),
      "npx fit-pathway job software_engineering level_2 --track=backend",
    );
  });

  test("maps job detail without track", () => {
    assert.strictEqual(
      getCliCommand("/job/software_engineering/level_2"),
      "npx fit-pathway job software_engineering level_2",
    );
  });

  test("maps interview routes", () => {
    assert.strictEqual(
      getCliCommand("/interview-prep"),
      "npx fit-pathway interview --list",
    );
    assert.strictEqual(
      getCliCommand("/interview/se/l2/backend"),
      "npx fit-pathway interview se l2 --track=backend",
    );
  });

  test("maps career progress routes", () => {
    assert.strictEqual(
      getCliCommand("/career-progress"),
      "npx fit-pathway progress --list",
    );
    assert.strictEqual(
      getCliCommand("/progress/se/l2/backend"),
      "npx fit-pathway progress se l2 --track=backend",
    );
  });

  test("maps agent routes", () => {
    assert.strictEqual(
      getCliCommand("/agent-builder"),
      "npx fit-pathway agent --list",
    );
    assert.strictEqual(getCliCommand("/agent/se"), "npx fit-pathway agent se");
    assert.strictEqual(
      getCliCommand("/agent/se/backend"),
      "npx fit-pathway agent se --track=backend",
    );
    assert.strictEqual(
      getCliCommand("/agent/se/backend/code"),
      "npx fit-pathway agent se --track=backend --stage=code",
    );
  });

  test("strips query parameters", () => {
    assert.strictEqual(
      getCliCommand("/skill?filter=delivery"),
      "npx fit-pathway skill",
    );
  });

  test("falls back to base command for unknown routes", () => {
    assert.strictEqual(getCliCommand("/unknown/route"), "npx fit-pathway");
  });
});
