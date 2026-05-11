/**
 * Test-only fixture builder for the benchmark family.
 *
 * The static parts of the fixture (tasks/, apm.lock.yaml) are checked in
 * under `test/fixtures/benchmark-family/`. The `.claude/` content is
 * materialised programmatically because checked-in `.claude/` paths under
 * the test tree collide with harness write-block rules; constructing the
 * staging tree at test setup time also lets per-test mutations live in a
 * temp directory without touching the canonical fixture.
 */

import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { cp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const FIXTURES_DIR = new URL("./fixtures/benchmark-family/", import.meta.url)
  .pathname;

const NOOP_SKILL = `---
name: noop
description: Test-only no-op skill so the apm staging tree has at least one file.
---

# noop

No-op skill for fixture purposes.
`;

const JUDGE_PROFILE = `---
name: judge
description: Test fixture judge profile.
---

# Test Judge

Conclude with success when scoring passes.
`;

/**
 * Copy the canonical benchmark fixture into a fresh temp dir and overlay
 * the `.claude/` staging tree from in-memory strings.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.includeJudgeProfile] - When true, also write
 *   `.claude/agents/judge.md` so `assertJudgeProfileStaged` resolves.
 * @returns {Promise<{ root: string }>}
 */
export async function materialiseBenchmarkFamily(opts = {}) {
  const root = mkdtempSync(join(tmpdir(), "benchmark-fixture-"));
  await cp(FIXTURES_DIR, root, { recursive: true });

  const claudeDir = join(root, ".claude");
  mkdirSync(join(claudeDir, "skills", "noop"), { recursive: true });
  writeFileSync(join(claudeDir, "skills", "noop", "SKILL.md"), NOOP_SKILL);

  if (opts.includeJudgeProfile !== false) {
    mkdirSync(join(claudeDir, "agents"), { recursive: true });
    writeFileSync(join(claudeDir, "agents", "judge.md"), JUDGE_PROFILE);
  }

  return { root };
}

export const FIXTURE_TASK_IDS = Object.freeze([
  "tf/pass",
  "tf/fail",
  "tf/repo-state",
  "tf/preflight-broken",
]);
