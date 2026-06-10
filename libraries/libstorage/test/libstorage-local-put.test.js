import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import fsp from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spy } from "@forwardimpact/libmock";

import { LocalStorage } from "../src/index.js";

describe("LocalStorage put atomicity — spy fs", () => {
  let localStorage;
  let mockFs;
  let nonceSeq;
  const nonce = () => `stub-${++nonceSeq}`;

  beforeEach(() => {
    nonceSeq = 0;
    mockFs = {
      mkdir: spy(() => Promise.resolve()),
      writeFile: spy(() => Promise.resolve()),
      rename: spy(() => Promise.resolve()),
      unlink: spy(() => Promise.resolve()),
      stat: spy(() =>
        Promise.resolve({
          birthtime: new Date("2024-01-01T00:00:00Z"),
          mtime: new Date("2024-01-01T00:00:00Z"),
        }),
      ),
      readdir: spy(() => Promise.resolve([])),
    };
    localStorage = new LocalStorage("/test/base", mockFs, nonce);
  });

  test("happy path writes tmp then renames", async () => {
    await localStorage.put("subdir/file.txt", "content");

    assert.strictEqual(mockFs.writeFile.mock.callCount(), 1);
    assert.deepStrictEqual(mockFs.writeFile.mock.calls[0].arguments, [
      "/test/base/subdir/file.txt.libstorage-tmp.stub-1",
      "content",
    ]);
    assert.strictEqual(mockFs.rename.mock.callCount(), 1);
    assert.deepStrictEqual(mockFs.rename.mock.calls[0].arguments, [
      "/test/base/subdir/file.txt.libstorage-tmp.stub-1",
      "/test/base/subdir/file.txt",
    ]);
    assert.strictEqual(mockFs.unlink.mock.callCount(), 0);
  });

  test("writeFile failure unlinks tmp and rejects with originating error", async () => {
    const errA = new Error("ENOSPC: no space left on device");
    mockFs.writeFile = spy(() => Promise.reject(errA));

    await assert.rejects(
      () => localStorage.put("subdir/file.txt", "content"),
      (e) => e === errA,
    );
    assert.strictEqual(mockFs.unlink.mock.callCount(), 1);
    assert.deepStrictEqual(mockFs.unlink.mock.calls[0].arguments, [
      "/test/base/subdir/file.txt.libstorage-tmp.stub-1",
    ]);
    assert.strictEqual(mockFs.rename.mock.callCount(), 0);
  });

  test("rename failure unlinks tmp and rejects with originating error", async () => {
    const errB = new Error("EXDEV: cross-device link not permitted");
    mockFs.rename = spy(() => Promise.reject(errB));

    await assert.rejects(
      () => localStorage.put("subdir/file.txt", "content"),
      (e) => e === errB,
    );
    assert.strictEqual(mockFs.unlink.mock.callCount(), 1);
    assert.deepStrictEqual(mockFs.unlink.mock.calls[0].arguments, [
      "/test/base/subdir/file.txt.libstorage-tmp.stub-1",
    ]);
  });

  test("cleanup error is swallowed; originating error propagates", async () => {
    const errA = new Error("ENOSPC");
    const errB = new Error("ENOENT on cleanup");
    mockFs.writeFile = spy(() => Promise.reject(errA));
    mockFs.unlink = spy(() => Promise.reject(errB));

    await assert.rejects(
      () => localStorage.put("subdir/file.txt", "content"),
      (e) => e === errA,
    );
    assert.strictEqual(mockFs.unlink.mock.callCount(), 1);
  });

  test("list skips tmp survivors", async () => {
    mockFs.readdir = spy(() =>
      Promise.resolve([
        {
          name: "real.json",
          isFile: () => true,
          isDirectory: () => false,
        },
        {
          name: "real.json.libstorage-tmp.deadbeef",
          isFile: () => true,
          isDirectory: () => false,
        },
      ]),
    );

    const keys = await localStorage.list();
    assert.deepStrictEqual(keys, ["real.json"]);
  });

  test("findByPrefix skips tmp survivors", async () => {
    mockFs.readdir = spy(() =>
      Promise.resolve([
        {
          name: "real.json",
          isFile: () => true,
          isDirectory: () => false,
        },
        {
          name: "real.json.libstorage-tmp.deadbeef",
          isFile: () => true,
          isDirectory: () => false,
        },
      ]),
    );

    const keys = await localStorage.findByPrefix("real");
    assert.deepStrictEqual(keys, ["real.json"]);
  });

  test("findByExtension skips tmp survivors sharing the canonical extension", async () => {
    mockFs.readdir = spy(() =>
      Promise.resolve([
        {
          name: "real.json",
          isFile: () => true,
          isDirectory: () => false,
        },
        // tmp sibling whose suffix carries the canonical extension after the
        // sentinel infix; without the filter, this would appear as a `.json` hit.
        {
          name: "real.json.libstorage-tmp.deadbeef.json",
          isFile: () => true,
          isDirectory: () => false,
        },
      ]),
    );

    const keys = await localStorage.findByExtension(".json");
    assert.deepStrictEqual(keys, ["real.json"]);
  });

  test("concurrent put on same key uses unique tmps", async () => {
    await Promise.all([localStorage.put("k", "A"), localStorage.put("k", "B")]);

    assert.strictEqual(mockFs.writeFile.mock.callCount(), 2);
    const tmpPaths = mockFs.writeFile.mock.calls.map((c) => c.arguments[0]);
    assert.notStrictEqual(tmpPaths[0], tmpPaths[1]);
    for (const p of tmpPaths) {
      assert.match(p, /\/test\/base\/k\.libstorage-tmp\.stub-[12]$/);
    }
    assert.strictEqual(mockFs.rename.mock.callCount(), 2);
    for (const c of mockFs.rename.mock.calls) {
      assert.strictEqual(c.arguments[1], "/test/base/k");
    }
  });
});

describe("LocalStorage put atomicity — real fs", () => {
  let sandbox;
  let storage;

  beforeEach(async () => {
    sandbox = await fsp.mkdtemp(join(tmpdir(), "libstorage-1480-"));
    storage = new LocalStorage(sandbox, fsp);
  });

  afterEach(async () => {
    await fsp.rm(sandbox, { recursive: true, force: true });
  });

  test("orphan tmp survivor is invisible to listings", async () => {
    await storage.put("real.json", '{"k":1}');
    // Simulate a process-killed mid-put tmp survivor.
    await fsp.writeFile(
      join(sandbox, "real.json.libstorage-tmp.orphan"),
      "garbage",
    );

    assert.deepStrictEqual(await storage.list(), ["real.json"]);
    assert.deepStrictEqual(await storage.findByPrefix(""), ["real.json"]);
    assert.deepStrictEqual(await storage.findByExtension(".json"), [
      "real.json",
    ]);

    // The orphan file remains on disk — operator-owned reclamation —
    // but never surfaces through the API.
    const onDisk = await fsp.readdir(sandbox);
    assert.ok(onDisk.includes("real.json.libstorage-tmp.orphan"));
  });

  test("failed put leaves target byte-equal to prior content and unlinks tmp", async () => {
    await storage.put("key.txt", "A");

    // Wrap fs so the second put's rename throws after writeFile has created a
    // real tmp on disk — the wrapper does NOT unlink, so #unlinkBestEffort
    // owns the cleanup. Keeps the kernel rename failure mode honest.
    let renameCallCount = 0;
    const wrapperFs = {
      ...fsp,
      rename: () => {
        renameCallCount += 1;
        const err = new Error("synthetic rename failure");
        err.code = "EFAIL";
        return Promise.reject(err);
      },
    };
    const failingStorage = new LocalStorage(sandbox, wrapperFs);

    await assert.rejects(() => failingStorage.put("key.txt", "B"));
    assert.strictEqual(renameCallCount, 1);

    // Target survives at prior content; #unlinkBestEffort cleared the tmp.
    assert.strictEqual(
      await fsp.readFile(join(sandbox, "key.txt"), "utf8"),
      "A",
    );
    const onDisk = await fsp.readdir(sandbox);
    assert.deepStrictEqual(onDisk, ["key.txt"]);
    assert.deepStrictEqual(await storage.list(), ["key.txt"]);
  });

  test("concurrent put on same key: both resolve, target ends at one input verbatim, no tmp leaks", async () => {
    await Promise.all([storage.put("k.txt", "A"), storage.put("k.txt", "B")]);

    // POSIX rename(2) atomicity is a kernel guarantee outside this library's
    // responsibility (per design Decision 1 + plan Step 4 rationale). This
    // case verifies the in-library invariant: both puts resolve, the target
    // ends byte-equal to one of the inputs (not a serial concat or partial),
    // and no tmp sibling leaks.
    const final = await fsp.readFile(join(sandbox, "k.txt"), "utf8");
    assert.ok(
      final === "A" || final === "B",
      `expected target to equal one of {"A","B"} byte-for-byte, got ${JSON.stringify(final)}`,
    );
    assert.deepStrictEqual(await fsp.readdir(sandbox), ["k.txt"]);
  });

  test("compact-shape round-trip survives a tmp survivor", async () => {
    const indexKey = "compact.jsonl";
    await storage.put(indexKey, [{ id: 1 }]);
    await fsp.writeFile(
      join(sandbox, `${indexKey}.libstorage-tmp.orphan`),
      "garbage\n",
    );
    await storage.put(indexKey, [{ id: 1 }, { id: 2 }]);

    assert.deepStrictEqual(await storage.get(indexKey), [{ id: 1 }, { id: 2 }]);
    assert.deepStrictEqual(await storage.list(), [indexKey]);
  });
});
