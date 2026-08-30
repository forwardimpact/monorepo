import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import { join } from "node:path";
import { homedir } from "node:os";
import { KBManager } from "../src/kb-manager.js";
import { createMockFs, createTestRuntime } from "@forwardimpact/libmock";

function noop() {}

/**
 * Build a runtime over a mock async fs. The mock fs holds `files`.
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
      // Expect one cp per top-level subdir: skills, agents.
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
        "/tpl/apm.yml": "name: outpost\nversion: 0.0.0\n",
        "/tpl/registry.yaml": "types: {}\n",
        "/tpl/MIGRATION.md": "# Migration",
        "/tpl/.claude/settings.json": '{"permissions":{}}',
        "/tpl/.claude/agents/postman.md": "postman",
      });
      const km = new KBManager(built.runtime, noop);
      const result = await km.init("/kb", "/tpl");

      assert.strictEqual(result.ok, true);
      assert.ok(built.fs.data.has("/kb/CLAUDE.md"));
      assert.ok(built.fs.data.has("/kb/apm.yml"));
      assert.ok(built.fs.data.has("/kb/.claude/agents/postman.md"));
      // `init` creates the five tier directories and the personal
      // `Briefings/` root, and installs the default registry. The skills
      // create entity subdirs on demand, so every tier starts empty. A fresh
      // KB is not a legacy layout, so MIGRATION.md never installs here.
      for (const d of [
        "0-Draft",
        "1-Management",
        "2-Confidential",
        "3-Team",
        "4-Public",
        "Briefings",
      ])
        assert.ok(built.fs.dirs.has(`/kb/${d}`), d);
      assert.strictEqual(built.fs.data.get("/kb/registry.yaml"), "types: {}\n");
      assert.ok(!built.fs.dirs.has("/kb/Knowledge"));
      assert.ok(!built.fs.dirs.has("/kb/Drafts"));
      assert.ok(!built.fs.dirs.has("/kb/3-Team/People"));
      assert.ok(!built.fs.data.has("/kb/MIGRATION.md"));
    });

    test("links the KB into ~/Documents for easy navigation", async () => {
      const built = makeRuntime({
        "/tpl/CLAUDE.md": "# Instructions",
        "/tpl/.claude/settings.json": '{"permissions":{}}',
      });
      const km = new KBManager(built.runtime, noop);
      await km.init("/home/share/fit/outpost/Team", "/tpl");

      const link = join(homedir(), "Documents", "Team");
      const [target, path] = built.fs.symlink.mock.calls[0].arguments;
      assert.strictEqual(target, "/home/share/fit/outpost/Team");
      assert.strictEqual(path, link);
    });

    test("leaves a pre-existing ~/Documents entry untouched", async () => {
      const link = join(homedir(), "Documents", "Team");
      const built = makeRuntime({
        "/tpl/CLAUDE.md": "# Instructions",
        "/tpl/.claude/settings.json": '{"permissions":{}}',
        [link]: "existing user file",
      });
      const km = new KBManager(built.runtime, noop);
      await km.init("/home/share/fit/outpost/Team", "/tpl");

      assert.strictEqual(built.fs.symlink.mock.callCount(), 0);
      assert.strictEqual(built.fs.data.get(link), "existing user file");
    });

    test("succeeds even when it cannot create the ~/Documents link", async () => {
      const built = makeRuntime({
        "/tpl/CLAUDE.md": "# Instructions",
        "/tpl/.claude/settings.json": '{"permissions":{}}',
      });
      built.fs.symlink.mock.mockImplementation(async () => {
        const err = new Error("EPERM: operation not permitted");
        err.code = "EPERM";
        throw err;
      });
      const km = new KBManager(built.runtime, noop);
      const result = await km.init("/home/share/fit/outpost/Team", "/tpl");

      assert.strictEqual(result.ok, true);
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
    const TPL = {
      "/tpl/CLAUDE.md": "# Instructions",
      "/tpl/registry.yaml": "types: {}\n",
      "/tpl/MIGRATION.md": "# Migration",
      "/tpl/.claude/settings.json": '{"permissions":{}}',
    };

    test("returns error envelope when it finds no KB", async () => {
      const built = makeRuntime({ "/tpl/CLAUDE.md": "# Instructions" });
      const km = new KBManager(built.runtime, noop);
      const result = await km.update("/kb", "/tpl");

      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.code, 1);
      assert.match(result.error, /No knowledge base found/);
    });

    test("installs MIGRATION.md into a legacy layout", async () => {
      const built = makeRuntime({ ...TPL, "/kb/CLAUDE.md": "# Old" });
      built.fs.dirs.add("/kb/Knowledge");
      const km = new KBManager(built.runtime, noop);
      const result = await km.update("/kb", "/tpl");

      assert.strictEqual(result.ok, true);
      assert.strictEqual(built.fs.data.get("/kb/MIGRATION.md"), "# Migration");
    });

    test("does not install MIGRATION.md into a conforming layout", async () => {
      const built = makeRuntime({ ...TPL, "/kb/CLAUDE.md": "# Old" });
      built.fs.dirs.add("/kb/3-Team");
      const km = new KBManager(built.runtime, noop);
      await km.update("/kb", "/tpl");

      assert.ok(!built.fs.data.has("/kb/MIGRATION.md"));
    });

    test("installs the registry when absent and never overwrites it", async () => {
      const built = makeRuntime({
        ...TPL,
        "/kb/CLAUDE.md": "# Old",
        "/kb/registry.yaml": "types: {Ours: person}\n",
      });
      const km = new KBManager(built.runtime, noop);
      await km.update("/kb", "/tpl");
      assert.strictEqual(
        built.fs.data.get("/kb/registry.yaml"),
        "types: {Ours: person}\n",
      );

      const fresh = makeRuntime({ ...TPL, "/kb/CLAUDE.md": "# Old" });
      const km2 = new KBManager(fresh.runtime, noop);
      await km2.update("/kb", "/tpl");
      assert.strictEqual(fresh.fs.data.get("/kb/registry.yaml"), "types: {}\n");
    });
  });

  describe("mergeSettings", () => {
    test("adds new permission entries without duplicates", async () => {
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
