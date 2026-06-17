import { test, describe } from "node:test";
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const fixtureSrc = join(
  repoRoot,
  "libraries",
  "libskill",
  "test",
  "fixtures",
  "skill-refs-prefix",
);
const driver = join(repoRoot, "scripts", "check-skill-refs.mjs");

// This test reaches the network to probe the nonexistent `kata-action-*`
// repositories, so it is skippable offline. The authoritative offline
// 12-finding assertion lives in the libskill unit test (ref-lint.test.js).
const OFFLINE = process.env.SKILL_REF_LINT_OFFLINE === "1";

describe("check-skill-refs driver (integration)", { skip: OFFLINE }, () => {
  test("fails with finding-format output against the pre-fix corpus", () => {
    // Build a skills layout the driver walks: `<root>/.claude/skills/kata-setup/`.
    const root = mkdtempSync(join(tmpdir(), "skill-ref-lint-"));
    try {
      const dest = join(root, ".claude", "skills", "kata-setup");
      mkdirSync(dest, { recursive: true });
      cpSync(fixtureSrc, dest, { recursive: true });

      let exitCode = 0;
      let stdout = "";
      try {
        stdout = execFileSync("node", [driver, "--root", root], {
          encoding: "utf8",
          env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
        });
      } catch (err) {
        exitCode = err.status;
        stdout = err.stdout?.toString() ?? "";
      }

      // Exit 1 = findings (not 0 clean, not 2 unreachable).
      assert.strictEqual(exitCode, 1, `expected exit 1, got ${exitCode}`);
      // The finding lines carry the `file:line — owner/repo[@ref] — reason`
      // format and name the nonexistent repository.
      assert.match(
        stdout,
        /\.claude\/skills\/kata-setup\/.+:\d+ — forwardimpact\/kata-action-(agent|eval)/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
