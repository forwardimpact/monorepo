import { test, describe } from "node:test";
import assert from "node:assert";

import {
  createTestRuntime,
  createMockSubprocess,
} from "@forwardimpact/libmock";

import { GitClient, GitError } from "../src/git-client.js";

function clientWith(responses = {}) {
  const subprocess = createMockSubprocess({ responses });
  const runtime = createTestRuntime({ subprocess });
  return { client: new GitClient({ runtime }), subprocess };
}

describe("GitClient", () => {
  test("requires a runtime", () => {
    assert.throws(() => new GitClient({}), { message: /runtime is required/ });
  });

  test("init invokes git with the expected args", async () => {
    const { client, subprocess } = clientWith();
    await client.init("/tmp/repo");
    const call = subprocess.calls.at(-1);
    assert.strictEqual(call.cmd, "git");
    assert.deepStrictEqual(call.args, ["init", "/tmp/repo"]);
  });

  test("status passes --porcelain and a cwd", async () => {
    const { client, subprocess } = clientWith({
      git: { stdout: " M file\n", exitCode: 0 },
    });
    const result = await client.status({ cwd: "/repo" });
    assert.strictEqual(result.stdout, " M file\n");
    assert.deepStrictEqual(subprocess.calls.at(-1).args, [
      "status",
      "--porcelain",
    ]);
    assert.strictEqual(subprocess.calls.at(-1).opts.cwd, "/repo");
  });

  test("status appends a pathspec when paths are given", async () => {
    const { client, subprocess } = clientWith();
    await client.status({ cwd: "/repo", paths: ["MEMORY.md"] });
    assert.deepStrictEqual(subprocess.calls.at(-1).args, [
      "status",
      "--porcelain",
      "--",
      "MEMORY.md",
    ]);
  });

  test("commitPaths stages and commits only the given paths", async () => {
    const { client, subprocess } = clientWith();
    await client.commitPaths("msg", ["MEMORY.md"], { cwd: "/repo" });
    const [add, commit] = subprocess.calls.slice(-2);
    assert.deepStrictEqual(add.args, ["add", "--", "MEMORY.md"]);
    assert.deepStrictEqual(commit.args, [
      "commit",
      "-m",
      "msg",
      "--",
      "MEMORY.md",
    ]);
  });

  test("rebase adds --autostash when autostash is set", async () => {
    const { client, subprocess } = clientWith();
    await client.rebase("origin/master", { cwd: "/r", autostash: true });
    assert.deepStrictEqual(subprocess.calls.at(-1).args, [
      "rebase",
      "--autostash",
      "origin/master",
    ]);
  });

  test("mergeOursStrategy adds --autostash when autostash is set", async () => {
    const { client, subprocess } = clientWith();
    await client.mergeOursStrategy({
      cwd: "/r",
      ref: "origin/master",
      autostash: true,
    });
    assert.deepStrictEqual(subprocess.calls.at(-1).args, [
      "merge",
      "--autostash",
      "-X",
      "ours",
      "--no-edit",
      "origin/master",
    ]);
  });

  test("revListCount parses the numeric stdout", async () => {
    const { client } = clientWith({ git: { stdout: "7\n", exitCode: 0 } });
    assert.strictEqual(await client.revListCount("a..b", { cwd: "/r" }), 7);
  });

  test("push adds --force-with-lease when force is set", async () => {
    const { client, subprocess } = clientWith();
    await client.push("origin", "main", { cwd: "/r", force: true });
    assert.deepStrictEqual(subprocess.calls.at(-1).args, [
      "push",
      "origin",
      "main",
      "--force-with-lease",
    ]);
  });

  test("throws GitError on a non-zero exit", async () => {
    const { client } = clientWith({
      git: { stderr: "boom", exitCode: 128 },
    });
    await assert.rejects(() => client.init("/x"), GitError);
  });

  test("configGet tolerates a non-zero exit and returns ''", async () => {
    const { client } = clientWith({ git: { stdout: "", exitCode: 1 } });
    assert.strictEqual(
      await client.configGet("missing.key", { cwd: "/r" }),
      "",
    );
  });

  test("withAuth injects a Basic x-access-token http.extraHeader before the subcommand", async () => {
    const { client, subprocess } = clientWith();
    await client.withAuth("secret").fetch("origin", undefined, { cwd: "/r" });
    const args = subprocess.calls.at(-1).args;
    const expected = Buffer.from("x-access-token:secret").toString("base64");
    assert.deepStrictEqual(args.slice(0, 3), [
      "-c",
      `http.extraHeader=Authorization: Basic ${expected}`,
      "fetch",
    ]);
  });

  test("an unauthenticated client passes no -c header", async () => {
    const { client, subprocess } = clientWith();
    await client.fetch("origin", undefined, { cwd: "/r" });
    assert.strictEqual(subprocess.calls.at(-1).args[0], "fetch");
  });
});
