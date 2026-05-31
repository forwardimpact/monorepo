import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import { KBManager } from "../src/kb-manager.js";
import { createMockFs, createTestRuntime } from "@forwardimpact/libmock";

function noop() {}

/**
 * Build a runtime over a mock async fs seeded with `files`.
 * @param {Record<string, string>} files
 */
function makeRuntime(files = {}) {
  const fs = createMockFs(files);
  return { runtime: createTestRuntime({ fs }), fs };
}

describe("KBManager", () => {
  describe("constructor validation", () => {
    test("throws when runtime.fs is missing", () => {
      assert.throws(() => new KBManager({}, noop), /runtime.fs is required/);
    });

    test("throws when logFn is missing", () => {
      const { runtime } = makeRuntime();
      assert.throws(() => new KBManager(runtime, null), /logFn is required/);
    });
  });

  describe("copyBundledFiles", () => {
    let fs;
    let km;

    beforeEach(() => {
      const built = makeRuntime({
        "/tpl/CLAUDE.md": "# Instructions",
        "/tpl/apm.yml":
          "name: outpost\nversion: 0.0.0\ndependencies:\n  apm:\n    - forwardimpact/fit-skills\n",
        "/tpl/.claude/settings.json": '{"permissions":{}}',
        "/tpl/.claude/agents/postman.md": "postman content",
        "/tpl/.claude/agents/librarian.md": "librarian content",
        "/tpl/.claude/skills/draft-emails/SKILL.md": "draft skill",
        "/tpl/.claude/skills/meeting-prep/SKILL.md": "meeting skill",
        "/dest/CLAUDE.md": "# Old Instructions",
        "/dest/.claude/settings.json": '{"permissions":{}}',
      });
      fs = built.fs;
      km = new KBManager(built.runtime, noop);
    });

    test("copies CLAUDE.md to destination", async () => {
      await km.copyBundledFiles("/tpl", "/dest");
      assert.strictEqual(fs.data.get("/dest/CLAUDE.md"), "# Instructions");
    });

    test("copies agent files recursively", async () => {
      await km.copyBundledFiles("/tpl", "/dest");
      assert.strictEqual(
        fs.data.get("/dest/.claude/agents/postman.md"),
        "postman content",
      );
      assert.strictEqual(
        fs.data.get("/dest/.claude/agents/librarian.md"),
        "librarian content",
      );
    });

    test("copies skill files recursively", async () => {
      await km.copyBundledFiles("/tpl", "/dest");
      assert.strictEqual(
        fs.data.get("/dest/.claude/skills/draft-emails/SKILL.md"),
        "draft skill",
      );
      assert.strictEqual(
        fs.data.get("/dest/.claude/skills/meeting-prep/SKILL.md"),
        "meeting skill",
      );
    });

    test("uses cp for skill and agent trees", async () => {
      await km.copyBundledFiles("/tpl", "/dest");
      // One cp per top-level subdir: skills, agents.
      assert.strictEqual(fs.cp.mock.callCount(), 2);
    });

    test("copies apm.yml to destination root", async () => {
      await km.copyBundledFiles("/tpl", "/dest");
      assert.ok(
        fs.data.get("/dest/apm.yml").includes("forwardimpact/fit-skills"),
      );
    });

    test("skips apm.yml when template has none", async () => {
      const built = makeRuntime({
        "/tpl/CLAUDE.md": "# Instructions",
        "/tpl/.claude/settings.json": '{"permissions":{}}',
        "/dest/CLAUDE.md": "# Old",
        "/dest/.claude/settings.json": '{"permissions":{}}',
      });
      const km2 = new KBManager(built.runtime, noop);
      await km2.copyBundledFiles("/tpl", "/dest");
      assert.strictEqual(built.fs.data.has("/dest/apm.yml"), false);
    });
  });

  describe("init", () => {
    test("creates knowledge base structure", async () => {
      const built = makeRuntime({
        "/tpl/CLAUDE.md": "# Instructions",
        "/tpl/USER.md": "# User",
        "/tpl/apm.yml": "name: outpost\nversion: 0.0.0\n",
        "/tpl/.claude/settings.json": '{"permissions":{}}',
        "/tpl/.claude/agents/postman.md": "postman",
      });
      const km = new KBManager(built.runtime, noop);
      const result = await km.init("/kb", "/tpl");

      assert.strictEqual(result.ok, true);
      assert.ok(built.fs.data.has("/kb/CLAUDE.md"));
      assert.ok(built.fs.data.has("/kb/USER.md"));
      assert.ok(built.fs.data.has("/kb/apm.yml"));
      assert.ok(built.fs.data.has("/kb/.claude/agents/postman.md"));
    });

    test("returns error envelope when KB already exists", async () => {
      const built = makeRuntime({ "/kb/CLAUDE.md": "# Existing" });
      const km = new KBManager(built.runtime, noop);
      const result = await km.init("/kb", "/tpl");

      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.code, 1);
      assert.match(result.error, /already exists/);
    });
  });

  describe("update", () => {
    test("returns error envelope when no KB found", async () => {
      const built = makeRuntime({ "/tpl/CLAUDE.md": "# Instructions" });
      const km = new KBManager(built.runtime, noop);
      const result = await km.update("/kb", "/tpl");

      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.code, 1);
      assert.match(result.error, /No knowledge base found/);
    });
  });

  describe("mergeSettings", () => {
    test("adds new permission entries without duplicating", async () => {
      const built = makeRuntime({
        "/tpl/.claude/settings.json": JSON.stringify({
          permissions: { allow: ["Bash(ls *)"], deny: ["Bash(rm *)"] },
        }),
        "/dest/.claude/settings.json": JSON.stringify({
          permissions: { allow: ["Bash(ls *)"] },
        }),
      });
      const km = new KBManager(built.runtime, noop);
      await km.mergeSettings("/tpl", "/dest");

      const result = JSON.parse(
        built.fs.data.get("/dest/.claude/settings.json"),
      );
      assert.strictEqual(result.permissions.allow.length, 1);
      assert.deepStrictEqual(result.permissions.deny, ["Bash(rm *)"]);
    });
  });
});
