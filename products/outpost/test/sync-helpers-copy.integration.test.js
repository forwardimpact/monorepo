/**
 * copyThreadAttachments containment integration tests.
 *
 * Injects a temp `attachmentsDir` via the dedicated DI parameter — no HOME
 * override (bun's `os.homedir()` ignores `process.env.HOME` and reads
 * `getpwuid()` directly, so DI is the only correct isolation channel under
 * `bun test`). Asserts that no traversal-shaped name causes a write outside
 * `<attachmentsDir>/<THREAD_ID>/`.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep, resolve } from "node:path";
import { copyThreadAttachments } from "../templates/.claude/skills/sync-apple-mail/scripts/sync-helpers.mjs";

describe("copyThreadAttachments containment", () => {
  const MID = 42;
  const THREAD_ID = "999";
  let tmpRoot;
  let attachmentsDir;
  let sourcePath;
  let attachmentIndex;

  before(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "outpost-copy-"));
    attachmentsDir = join(tmpRoot, "attachments");
    sourcePath = join(tmpRoot, "source.bin");
    writeFileSync(sourcePath, "payload");
    attachmentIndex = new Map([[`${MID}:att1`, sourcePath]]);
  });

  after(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  function readDirSafe(dir) {
    try {
      return readdirSync(dir, { withFileTypes: true });
    } catch {
      return [];
    }
  }

  function listFiles(dir) {
    const out = [];
    const stack = [dir];
    while (stack.length) {
      const current = stack.pop();
      for (const e of readDirSafe(current)) {
        const p = join(current, e.name);
        if (e.isDirectory()) stack.push(p);
        else if (e.isFile()) out.push(p);
      }
    }
    return out;
  }

  function runOne(att) {
    const messages = [{ message_id: MID }];
    const attachmentsByMsg = { [MID]: [att] };
    const results = copyThreadAttachments(
      THREAD_ID,
      messages,
      attachmentsByMsg,
      attachmentIndex,
      attachmentsDir,
    );
    return results[MID][0];
  }

  function assertNoEscape() {
    const threadDir = resolve(join(attachmentsDir, THREAD_ID)) + sep;
    for (const p of listFiles(tmpRoot)) {
      if (p === sourcePath) continue;
      assert.ok(
        resolve(p).startsWith(threadDir),
        `file escaped containment: ${p}`,
      );
    }
  }

  function assertContained(result, expectedName) {
    const threadDir = resolve(join(attachmentsDir, THREAD_ID)) + sep;
    assert.strictEqual(result.available, true);
    assert.strictEqual(result.name, expectedName);
    assert.ok(resolve(result.path).startsWith(threadDir));
    assert.ok(result.path.endsWith(sep + expectedName));
  }

  test("benign name copies inside thread dir", () => {
    const r = runOne({ name: "report.pdf", attachment_id: "att1" });
    assertContained(r, "report.pdf");
    assertNoEscape();
  });

  test("traversal payload reduces to safe basename", () => {
    const r = runOne({ name: "../../../escape.txt", attachment_id: "att1" });
    assertContained(r, "escape.txt");
    assertNoEscape();
  });

  test("absolute path payload reduces to safe basename", () => {
    const r = runOne({ name: "/etc/passwd", attachment_id: "att1" });
    assertContained(r, "passwd");
    assertNoEscape();
  });

  test("null name falls back to 'unnamed'", () => {
    const r = runOne({ name: null, attachment_id: "att1" });
    assertContained(r, "unnamed");
    assertNoEscape();
  });

  test("missing source returns available:false", () => {
    const r = runOne({ name: "foo.pdf", attachment_id: "missing" });
    assert.strictEqual(r.available, false);
    assert.strictEqual(r.path, null);
    assertNoEscape();
  });
});
