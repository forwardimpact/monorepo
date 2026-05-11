/**
 * ApmInstaller — materialises the family's pre-staged `.claude/` tree into a
 * single staging directory, computes the manifest fingerprint, and is invoked
 * once per family install. Per-task copy happens later in WorkdirManager.
 *
 * v1 trusts the family's checked-in `.claude/` (P1); the lockfile is hashed
 * verbatim, not interpreted.
 */

import { createHash } from "node:crypto";
import { access, cp, rm } from "node:fs/promises";
import { join } from "node:path";

/**
 * @param {import("./task-family.js").TaskFamily} family
 * @param {string} outputDir - The benchmark run's output directory.
 * @returns {Promise<{stagingDir: string, skillSetHash: string}>}
 */
export async function installApm(family, outputDir) {
  const stagingDir = join(outputDir, ".apm-staging");
  const stagedClaude = join(stagingDir, ".claude");
  const sourceClaude = join(family.rootPath, ".claude");

  try {
    await access(sourceClaude);
  } catch {
    throw new Error(
      `task family missing .claude/ at ${sourceClaude}; family must check in a pre-staged skills/agents tree (design decision P1)`,
    );
  }

  await rm(stagingDir, { recursive: true, force: true });
  await cp(sourceClaude, stagedClaude, { recursive: true });

  const skillSetHash =
    "sha256:" + createHash("sha256").update(family.apmLockBytes).digest("hex");

  return { stagingDir, skillSetHash };
}
