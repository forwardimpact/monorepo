import { describe, test } from "node:test";
import assert from "node:assert/strict";
import * as nodeFs from "node:fs";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { listSkills } from "../src/skill-roster.js";

describe("listSkills", () => {
  test("empty dir returns []", () => {
    const dir = mkdtempSync(join(tmpdir(), "skills-"));
    assert.deepEqual(listSkills({ skillsDir: dir }, nodeFs), []);
  });

  test("returns only kata-* directories", () => {
    const dir = mkdtempSync(join(tmpdir(), "skills-"));
    mkdirSync(join(dir, "kata-spec"));
    mkdirSync(join(dir, "kata-plan"));
    mkdirSync(join(dir, "fit-wiki"));
    mkdirSync(join(dir, "kata-session"));
    writeFileSync(join(dir, "kata-file.txt"), "not a dir");

    const result = listSkills({ skillsDir: dir }, nodeFs);
    assert.deepEqual(result, ["kata-plan", "kata-session", "kata-spec"]);
  });

  test("ignores dot-prefixed entries", () => {
    const dir = mkdtempSync(join(tmpdir(), "skills-"));
    mkdirSync(join(dir, ".DS_Store_kata-hidden"));
    mkdirSync(join(dir, "kata-real"));

    const result = listSkills({ skillsDir: dir }, nodeFs);
    assert.deepEqual(result, ["kata-real"]);
  });

  test("sorted output is stable", () => {
    const dir = mkdtempSync(join(tmpdir(), "skills-"));
    mkdirSync(join(dir, "kata-z"));
    mkdirSync(join(dir, "kata-a"));
    mkdirSync(join(dir, "kata-m"));

    const r1 = listSkills({ skillsDir: dir }, nodeFs);
    const r2 = listSkills({ skillsDir: dir }, nodeFs);
    assert.deepEqual(r1, ["kata-a", "kata-m", "kata-z"]);
    assert.deepEqual(r1, r2);
  });
});
