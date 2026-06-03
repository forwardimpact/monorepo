import { describe, test } from "node:test";
import assert from "node:assert";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createNpmInstaller } from "../src/benchmark/npm-installer.js";
import {
  makeFakeSubprocess,
  realRuntimeWithSubprocess,
} from "./real-runtime.js";

async function makeFamilyWithPkg(dir) {
  await mkdir(join(dir, "tasks", "t1"), { recursive: true });
  await writeFile(join(dir, "tasks", "t1", "agent.task.md"), "do something");
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({ name: "test-family", private: true }),
  );
  return { rootPath: dir, tasks: () => [] };
}

/**
 * A subprocess fake whose `bun install` materialises a `node_modules/.bin`
 * tree in the family root (mirroring a successful install) before its exit
 * code resolves, so the installer's stage-copy has something to copy.
 */
function makeInstallingSubprocess() {
  const calls = [];
  const spawn = (cmd, args, options) => {
    calls.push({ cmd, args, options });
    const exitCode = (async () => {
      await mkdir(join(options.cwd, "node_modules", ".bin"), {
        recursive: true,
      });
      await writeFile(
        join(options.cwd, "node_modules", ".bin", "some-tool"),
        "#!/bin/sh\nexit 0",
      );
      return 0;
    })();
    return {
      stdout: { async *[Symbol.asyncIterator]() {} },
      stderr: { async *[Symbol.asyncIterator]() {} },
      exitCode,
      kill: () => {},
      pid: 4321,
    };
  };
  return {
    spawn,
    run: async () => ({ exitCode: 0 }),
    runSync: () => ({}),
    calls,
  };
}

function newInstaller() {
  const sub = makeInstallingSubprocess();
  return {
    installer: createNpmInstaller({
      runtime: realRuntimeWithSubprocess(sub),
    }),
    sub,
  };
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
    const { installer, sub } = newInstaller();
    await installer.install(family, stagingDir);

    assert.strictEqual(sub.calls.length, 1);
    assert.strictEqual(sub.calls[0].cmd, "bun");
    assert.deepStrictEqual(sub.calls[0].args, ["install"]);
    assert.strictEqual(sub.calls[0].options.cwd, family.rootPath);
    await access(join(stagingDir, "node_modules", ".bin", "some-tool"));
    await rm(dir, { recursive: true, force: true });
  });

  test("skips when no package.json exists", async () => {
    await setup();
    const family = { rootPath: dir, tasks: () => [] };
    const sub = makeFakeSubprocess();
    const installer = createNpmInstaller({
      runtime: realRuntimeWithSubprocess(sub),
    });
    await installer.install(family, stagingDir);
    assert.strictEqual(sub.calls.length, 0);
    await rm(dir, { recursive: true, force: true });
  });

  test("throws when bun install does not produce node_modules/", async () => {
    await setup();
    const family = await makeFamilyWithPkg(dir);
    const sub = makeFakeSubprocess();
    const installer = createNpmInstaller({
      runtime: realRuntimeWithSubprocess(sub),
    });
    await assert.rejects(
      installer.install(family, stagingDir),
      /did not produce node_modules\//,
    );
    await rm(dir, { recursive: true, force: true });
  });

  test("propagates non-zero exit codes from bun", async () => {
    await setup();
    const family = await makeFamilyWithPkg(dir);
    const sub = makeFakeSubprocess({
      exitCode: 1,
      stderr: "resolution failed",
    });
    const installer = createNpmInstaller({
      runtime: realRuntimeWithSubprocess(sub),
    });
    await assert.rejects(
      installer.install(family, stagingDir),
      /bun install exited 1: resolution failed/,
    );
    await rm(dir, { recursive: true, force: true });
  });

  test("propagates spawn errors as a non-zero exit", async () => {
    await setup();
    const family = await makeFamilyWithPkg(dir);
    const sub = makeFakeSubprocess({
      spawnError: new Error("ENOENT: bun not found"),
    });
    const installer = createNpmInstaller({
      runtime: realRuntimeWithSubprocess(sub),
    });
    await assert.rejects(
      installer.install(family, stagingDir),
      /bun install exited 127/,
    );
    await rm(dir, { recursive: true, force: true });
  });
});
