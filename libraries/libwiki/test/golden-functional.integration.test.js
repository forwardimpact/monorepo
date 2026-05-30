import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

// Real-bin functional CLI-surface guard (spec SC4): spawns the actual
// `fit-wiki` bin against a committed audit-clean fixture wiki and asserts the
// read-only command output (which the capture harness can replay
// idempotently) is byte-identical to the committed golden. Mutating commands
// (claim/log/memo/rotate/release/init/push/pull) cannot be replayed
// idempotently by the capture harness, so their behavioral contract is covered
// by the in-process per-command tests instead. Spawns the bin → integration file.
const LIBWIKI_DIR = fileURLToPath(new URL("..", import.meta.url));
const BIN = join(LIBWIKI_DIR, "bin", "fit-wiki.js");
const GOLDEN_DIR = join(LIBWIKI_DIR, "test", "golden", "fit-wiki");
const WIKI_ROOT = "test/golden/fit-wiki/fixture";

function golden(file) {
  return readFileSync(join(GOLDEN_DIR, file), "utf-8");
}

describe("fit-wiki golden functional CLI contract (real bin)", () => {
  test("boot --format json matches the committed golden", () => {
    const out = execFileSync(
      "node",
      [
        BIN,
        "boot",
        "--agent",
        "staff-engineer",
        "--format",
        "json",
        "--today",
        "2026-05-30",
        "--wiki-root",
        WIKI_ROOT,
      ],
      { cwd: LIBWIKI_DIR, encoding: "utf-8" },
    );
    assert.equal(out, golden("boot-json.stdout.txt"));
  });

  test("audit --format json on the clean fixture passes and matches the golden", () => {
    const out = execFileSync(
      "node",
      [
        BIN,
        "audit",
        "--format",
        "json",
        "--today",
        "2026-05-30",
        "--wiki-root",
        WIKI_ROOT,
      ],
      { cwd: LIBWIKI_DIR, encoding: "utf-8" },
    );
    assert.equal(out, golden("audit-json.stdout.txt"));
  });
});
