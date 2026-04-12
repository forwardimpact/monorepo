import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { EMPTY_STATES } from "../src/lib/empty-state.js";

describe("EMPTY_STATES", () => {
  it("has a NO_EVIDENCE constant", () => {
    assert.equal(typeof EMPTY_STATES.NO_EVIDENCE, "string");
    assert.ok(EMPTY_STATES.NO_EVIDENCE.includes("Guide"));
  });

  it("NO_MARKERS_FOR_SKILL is a function returning skill-specific message", () => {
    const msg = EMPTY_STATES.NO_MARKERS_FOR_SKILL("task_completion");
    assert.ok(msg.includes("task_completion"));
    assert.ok(msg.includes("markers"));
  });

  it("has a NO_MARKERS_AT_TARGET constant", () => {
    assert.equal(typeof EMPTY_STATES.NO_MARKERS_AT_TARGET, "string");
  });

  it("has a NO_SNAPSHOTS constant", () => {
    assert.ok(EMPTY_STATES.NO_SNAPSHOTS.includes("GetDX"));
  });

  it("has a NO_COMMENTS constant", () => {
    assert.ok(EMPTY_STATES.NO_COMMENTS.includes("getdx_snapshot_comments"));
  });

  it("has a NO_INITIATIVES constant", () => {
    assert.ok(EMPTY_STATES.NO_INITIATIVES.includes("getdx_initiatives"));
  });

  it("PERSON_NOT_FOUND includes the email", () => {
    const msg = EMPTY_STATES.PERSON_NOT_FOUND("alice@example.com");
    assert.ok(msg.includes("alice@example.com"));
  });

  it("MANAGER_NOT_FOUND includes the email", () => {
    const msg = EMPTY_STATES.MANAGER_NOT_FOUND("boss@example.com");
    assert.ok(msg.includes("boss@example.com"));
  });

  it("NO_HIGHER_LEVEL includes the level id", () => {
    const msg = EMPTY_STATES.NO_HIGHER_LEVEL("J060");
    assert.ok(msg.includes("J060"));
  });

  it("NO_ARTIFACTS_FOR_PERSON includes the email", () => {
    const msg = EMPTY_STATES.NO_ARTIFACTS_FOR_PERSON("dan@example.com");
    assert.ok(msg.includes("dan@example.com"));
  });

  it("has a NO_ORGANIZATION constant", () => {
    assert.ok(EMPTY_STATES.NO_ORGANIZATION.includes("organization"));
  });
});
