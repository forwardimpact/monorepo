import { describe, test } from "node:test";
import assert from "node:assert";
import {
  access,
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createNpmInstaller } from "../src/benchmark/npm-installer.js";
import { makeFakeApmSpawn as makeFakeSpawn } from "./mock-apm-spawn.js";

async function makeFamilyWithPkg(dir) {
  await mkdir(join(dir, "tasks", "t1"), { recursive: true });
  await writeFile(join(dir, "tasks", "t1", "agent.task.md"), "do something");
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({ name: "test-family", private: true }),
  );
  return { rootPath: dir, tasks: () => [] };
}

function newInstaller(opts) {
  const fakeSpawn = makeFakeSpawn(opts);
  fakeSpawn.sideEffect = async (family) => {
    await mkdir(join(family.rootPath, "node_modules", ".bin"), {
      recursive: true,
    });
    await writeFile(
      join(family.rootPath, "node_modules", ".bin", "some-tool"),
      "#!/bin/sh\nexit 0",
    );
  };
  const spawn = (cmd, args, options) => {
    const child = fakeSpawn(cmd, args, options);
    const origEmit = child.emit.bind(child);
    child.emit = (event, ...eventArgs) => {
      if (event === "close" && eventArgs[0] === 0) {
        fakeSpawn.sideEffect({ rootPath: options.cwd }).then(() => {
          origEmit(event, ...eventArgs);
        });
        return true;
      }
      return origEmit(event, ...eventArgs);
    };
    return child;
  };
  spawn.calls = fakeSpawn.calls;
  return { installer: createNpmInstaller({ spawn }), spawn };
}

describe("NpmInstaller.install", () => {
  let dir;
  let stagingDir;

  async function setup() {
    dir = await mkdtemp(join(tmpdir(), "benchmark-npm-"));
    stagingDir = join(dir, "staging");
    await mkdir(stagingDir, { recursive: true });
  }

  test("runs bun install and stages node_modules/", async () => {
    await setup();
    const family = await makeFamilyWithPkg(dir);
    const { installer, spawn } = newInstaller();
    await installer.install(family, stagingDir);

    assert.strictEqual(spawn.calls.length, 1);
    assert.strictEqual(spawn.calls[0].cmd, "bun");
    assert.deepStrictEqual(spawn.calls[0].args, ["install"]);
    assert.strictEqual(spawn.calls[0].options.cwd, family.rootPath);
    await access(join(stagingDir, "node_modules", ".bin", "some-tool"));
    await rm(dir, { recursive: true, force: true });
  });

  test("skips when no package.json exists", async () => {
    await setup();
    const family = { rootPath: dir, tasks: () => [] };
    const fakeSpawn = makeFakeSpawn();
    const installer = createNpmInstaller({ spawn: fakeSpawn });
    await installer.install(family, stagingDir);
    assert.strictEqual(fakeSpawn.calls.length, 0);
    await rm(dir, { recursive: true, force: true });
  });

  test("throws when bun install does not produce node_modules/", async () => {
    await setup();
    const family = await makeFamilyWithPkg(dir);
    const fakeSpawn = makeFakeSpawn();
    const installer = createNpmInstaller({ spawn: fakeSpawn });
    await assert.rejects(
      installer.install(family, stagingDir),
      /did not produce node_modules\//,
    );
    await rm(dir, { recursive: true, force: true });
  });

  test("propagates non-zero exit codes from bun", async () => {
    await setup();
    const family = await makeFamilyWithPkg(dir);
    const fakeSpawn = makeFakeSpawn({ exitCode: 1, stderr: "resolution failed" });
    const installer = createNpmInstaller({ spawn: fakeSpawn });
    await assert.rejects(
      installer.install(family, stagingDir),
      /bun install exited 1: resolution failed/,
    );
    await rm(dir, { recursive: true, force: true });
  });

  test("propagates spawn errors", async () => {
    await setup();
    const family = await makeFamilyWithPkg(dir);
    const fakeSpawn = makeFakeSpawn({
      spawnError: new Error("ENOENT: bun not found"),
    });
    const installer = createNpmInstaller({ spawn: fakeSpawn });
    await assert.rejects(
      installer.install(family, stagingDir),
      /failed to spawn bun: ENOENT: bun not found/,
    );
    await rm(dir, { recursive: true, force: true });
  });
});
