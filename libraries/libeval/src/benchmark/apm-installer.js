/**
 * ApmInstaller (spec 870 plan-a Step 3, P1).
 *
 * Resolves the family's pre-staged `.claude/` and copies it into a single
 * staging directory under the run-output dir. Computes `skillSetHash` as
 * `sha256:` over the family's LF-normalised `apm.lock.yaml` bytes (the
 * lockfile is *not* interpreted in v1 — see plan P1; lockfile-driven
 * re-install is a follow-up spec).
 *
 * Idempotent: the staging dir is removed and re-created on every call so
 * a re-run after editing `.claude/` reflects the latest content.
 */

import { existsSync, rmSync, statSync } from "node:fs";
import { cp } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";

const STAGING_SUBDIR = ".apm-staging";

/**
 * @param {import("./task-family.js").TaskFamily} family
 * @param {string} outputDir - Run-output directory.
 * @returns {Promise<{ stagingDir: string, skillSetHash: string }>}
 */
export async function installApm(family, outputDir) {
  const lockPath = join(family.rootPath, "apm.lock.yaml");
  const lockYmlPath = join(family.rootPath, "apm.lock.yml");
  if (!existsSync(lockPath)) {
    if (existsSync(lockYmlPath)) {
      throw new Error(
        `Family lockfile must be named apm.lock.yaml (not apm.lock.yml). ` +
          `See libpack stager.js:126 — libpack writes the .yaml extension. ` +
          `Found: ${lockYmlPath}`,
      );
    }
    throw new Error(`Family lockfile not found: expected ${lockPath}`);
  }

  const stagingDir = join(outputDir, STAGING_SUBDIR);
  if (existsSync(stagingDir)) {
    rmSync(stagingDir, { recursive: true, force: true });
  }

  const familyClaudeDir = join(family.rootPath, ".claude");
  if (
    !existsSync(familyClaudeDir) ||
    !statSync(familyClaudeDir).isDirectory()
  ) {
    throw new Error(
      `Family .claude/ directory missing or not a directory: ${familyClaudeDir}. ` +
        `v1 trusts pre-staged content (plan-a P1); run libpack at family-author time.`,
    );
  }

  await cp(familyClaudeDir, join(stagingDir, ".claude"), { recursive: true });

  const skillSetHash =
    "sha256:" + createHash("sha256").update(family.apmLockBytes).digest("hex");

  return { stagingDir, skillSetHash };
}
