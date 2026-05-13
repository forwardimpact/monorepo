/**
 * ApmInstaller — runs `apm install --target claude` in the family root to
 * materialise skills and agents, copies the resulting `.claude/` into a
 * staging directory, and computes the manifest fingerprint from the lockfile.
 * Per-task copy happens later in WorkdirManager.
 *
 * The class takes a `spawn` seam so tests can substitute a fake child process
 * without ever shelling out to a real `apm` binary. See `createApmInstaller`
 * for the real-dependency wiring; `installApm` is a thin free-function wrapper
 * for callers that don't need to inject anything.
 */

import { spawn as nodeSpawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, cp, mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

/** Installs apm and stages `.claude/` for a task family. */
export class ApmInstaller {
  /**
   * @param {object} [deps]
   * @param {typeof nodeSpawn} [deps.spawn] - Spawn seam (defaults to
   *   `node:child_process` spawn). Tests inject a fake to avoid shelling out.
   */
  constructor({ spawn } = {}) {
    this.spawn = spawn ?? nodeSpawn;
  }

  /**
   * @param {import("./task-family.js").TaskFamily} family
   * @param {string} outputDir - The benchmark run's output directory.
   * @returns {Promise<{stagingDir: string, skillSetHash: string, judgeProfilesDir: string}>}
   */
  async install(family, outputDir) {
    const stagingDir = join(outputDir, ".apm-staging");
    const stagedClaude = join(stagingDir, ".claude");
    const sourceClaude = join(family.rootPath, ".claude");
    const apmYml = join(family.rootPath, "apm.yml");

    const hasApm = await access(apmYml)
      .then(() => true)
      .catch(() => false);

    if (hasApm) {
      await this.#runApmInstall(family.rootPath);
      try {
        await access(sourceClaude);
      } catch {
        throw new Error(
          `apm install did not produce .claude/ at ${sourceClaude}; check the family's apm.yml`,
        );
      }
    }

    await rm(stagingDir, { recursive: true, force: true });
    const hasClaudeDir = await access(sourceClaude)
      .then(() => true)
      .catch(() => false);
    if (hasClaudeDir) {
      await cp(sourceClaude, stagedClaude, { recursive: true });
    } else {
      await mkdir(stagedClaude, { recursive: true });
    }

    // Stage the family-local judge profile outside .claude/ so it is available
    // to the judge but never copied into the agent-under-test's CWD.
    const judgeSource = join(family.rootPath, "judge.md");
    const judgeProfilesDir = join(stagingDir, "judge-profiles");
    try {
      await access(judgeSource);
      await mkdir(judgeProfilesDir, { recursive: true });
      await cp(judgeSource, join(judgeProfilesDir, "judge.md"));
    } catch {}

    const lockPath = join(family.rootPath, "apm.lock.yaml");
    let skillSetHash = "";
    try {
      const lockBytes = await readFile(lockPath);
      skillSetHash =
        "sha256:" +
        createHash("sha256").update(normalizeLf(lockBytes)).digest("hex");
    } catch {
      // No lockfile — family doesn't use skill packs.
    }

    return { stagingDir, skillSetHash, judgeProfilesDir };
  }

  #runApmInstall(cwd) {
    return new Promise((res, rej) => {
      const child = this.spawn("apm", ["install", "--target", "claude"], {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stderr = "";
      child.stdout.on("data", () => {});
      child.stderr.on("data", (d) => {
        stderr += d.toString();
      });
      child.on("error", (e) => {
        rej(new Error(`failed to spawn apm: ${e.message}`));
      });
      child.on("close", (code) => {
        if (code === 0) res();
        else rej(new Error(`apm install exited ${code}: ${stderr}`));
      });
    });
  }
}

function normalizeLf(buf) {
  const out = [];
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0x0d && i + 1 < buf.length && buf[i + 1] === 0x0a) continue;
    out.push(buf[i]);
  }
  return Buffer.from(out);
}

/**
 * Factory function — wires real dependencies.
 * @param {ConstructorParameters<typeof ApmInstaller>[0]} [deps]
 * @returns {ApmInstaller}
 */
export function createApmInstaller(deps) {
  return new ApmInstaller(deps);
}

/**
 * Free-function shorthand for callers that don't need to inject a spawn seam.
 * @param {import("./task-family.js").TaskFamily} family
 * @param {string} outputDir
 */
export function installApm(family, outputDir) {
  return new ApmInstaller().install(family, outputDir);
}
