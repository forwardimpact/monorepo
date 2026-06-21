import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createDefaultRuntime } from "../src/runtime.js";
import { GitClient } from "../src/git-client.js";

// One explicit smoke test per binary for GitClient: exercises the real
// `git` binary through the default runtime in a tmpdir.
describe("GitClient (integration)", () => {
  let dir;
  let client;

  before(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "git-client-"));
    client = new GitClient({ runtime: createDefaultRuntime() });
    await client.init(dir);
    // Make commits independent of the host's signing / identity config.
    await client.configSet("commit.gpgsign", "false", { cwd: dir });
    await client.configSet("tag.gpgsign", "false", { cwd: dir });
    await client.configSet("user.email", "test@example.com", { cwd: dir });
    await client.configSet("user.name", "Test", { cwd: dir });
    await client.configSet("init.defaultBranch", "main", { cwd: dir });
  });

  after(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  test("commitAll + revListCount counts real commits", async () => {
    await writeFile(path.join(dir, "a.txt"), "one");
    await client.commitAll("first", { cwd: dir });
    await writeFile(path.join(dir, "b.txt"), "two");
    await client.commitAll("second", { cwd: dir });
    assert.strictEqual(await client.revListCount("HEAD", { cwd: dir }), 2);
  });

  test("showFile reads a blob at a ref, returns null for an absent path, throws for a bad ref", async () => {
    await writeFile(path.join(dir, "doc.md"), "hello world\n");
    await client.commitAll("doc", { cwd: dir });

    assert.strictEqual(
      await client.showFile("HEAD", "doc.md", { cwd: dir }),
      "hello world\n",
    );
    assert.strictEqual(
      await client.showFile("HEAD", "missing.md", { cwd: dir }),
      null,
    );
    await assert.rejects(
      () => client.showFile("deadbeef", "doc.md", { cwd: dir }),
      /show deadbeef:doc\.md/,
    );
  });

  test("configGet reads a value back", async () => {
    assert.strictEqual(
      await client.configGet("user.email", { cwd: dir }),
      "test@example.com",
    );
  });

  test("status reports a dirty working tree", async () => {
    await writeFile(path.join(dir, "dirty.txt"), "x");
    const result = await client.status({ cwd: dir });
    assert.match(result.stdout, /dirty\.txt/);
  });

  test("commitPaths leaves pre-staged foreign content uncommitted", async () => {
    await writeFile(path.join(dir, "target.md"), "target");
    await writeFile(path.join(dir, "foreign.md"), "foreign");
    const sub = createDefaultRuntime().subprocess;
    await sub.run("git", ["add", "foreign.md"], { cwd: dir });

    await client.commitPaths("scoped", ["target.md"], { cwd: dir });

    const shown = await sub.run(
      "git",
      ["show", "--name-only", "--format=", "HEAD"],
      { cwd: dir },
    );
    assert.strictEqual(shown.stdout.trim(), "target.md");
    const status = await client.status({ cwd: dir });
    assert.match(status.stdout, /^A {2}foreign\.md$/m);
  });

  test("rebase with -X ours recovers from a conflict", async () => {
    const branchDir = await mkdtemp(path.join(tmpdir(), "git-client-ours-"));
    const c = new GitClient({ runtime: createDefaultRuntime() });
    await c.init(branchDir);
    await c.configSet("commit.gpgsign", "false", { cwd: branchDir });
    await c.configSet("user.email", "t@e.co", { cwd: branchDir });
    await c.configSet("user.name", "T", { cwd: branchDir });

    await writeFile(path.join(branchDir, "f.txt"), "base\n");
    await c.commitAll("base", { cwd: branchDir });

    // main edits the line
    await c.commitAll("noop-main", { cwd: branchDir }).catch(() => {});
    const sub = createDefaultRuntime().subprocess;
    await sub.run("git", ["checkout", "-b", "feature"], { cwd: branchDir });
    await writeFile(path.join(branchDir, "f.txt"), "feature\n");
    await c.commitAll("feature", { cwd: branchDir });
    await sub.run("git", ["checkout", "main"], { cwd: branchDir });
    await writeFile(path.join(branchDir, "f.txt"), "main\n");
    await c.commitAll("main", { cwd: branchDir });

    // Rebase feature onto main resolving conflicts with -X ours: must not throw.
    await sub.run("git", ["checkout", "feature"], { cwd: branchDir });
    const result = await c.rebase("main", { cwd: branchDir, strategy: "ours" });
    assert.ok(result, "rebase returned a result");

    await rm(branchDir, { recursive: true, force: true });
  });
});
