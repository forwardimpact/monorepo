/**
 * ApmInstaller — runs `apm install --target claude` in the family root to
 * materialise skills and agents, copies the resulting `.claude/` into a
 * staging directory, and computes the manifest fingerprint from the lockfile.
 * Per-task copy happens later in WorkdirManager.
 *
 * Subprocess and filesystem access route through the injected `runtime` bag
 * (`runtime.subprocess.spawn` for the streaming `apm` child, `runtime.fs` for
 * the async staging copies). See `createApmInstaller` for the real-dependency
 * wiring; `installApm` is a thin free-function wrapper.
 */

import { createHash } from "node:crypto";
import { join, resolve } from "node:path";

/** Installs apm and stages `.claude/` for a task family. */
export class ApmInstaller {
  /**
   * @param {object} deps
   * @param {import("@forwardimpact/libutil/runtime").Runtime} deps.runtime -
   *   Ambient collaborators; uses `subprocess.spawn` and `fs`.
   */
  constructor({ runtime }) {
    if (!runtime) throw new Error("runtime is required");
    this.runtime = runtime;
  }

  /**
   * @param {import("./task-family.js").TaskFamily} family
   * @param {string} outputDir - The benchmark run's output directory.
   * @param {object} [options]
   * @param {string|null} [options.skillsFrom] - Stage `.claude/` from this
   *   directory instead of running apm install. The path is a root containing
   *   a `.claude/` tree (e.g. a working tree), letting a run exercise local,
   *   unpublished skills.
   * @returns {Promise<{stagingDir: string, skillSetHash: string, judgeProfilesDir: string}>}
   */
  async install(family, outputDir, { skillsFrom } = {}) {
    const fs = this.runtime.fs;
    const stagingDir = join(outputDir, ".apm-staging");
    const stagedClaude = join(stagingDir, ".claude");
    const sourceClaude = skillsFrom
      ? join(resolve(skillsFrom), ".claude")
      : join(family.rootPath, ".claude");
    const apmYml = join(family.rootPath, "apm.yml");

    // --skills-from takes precedence over apm install: the caller is supplying
    // the skill tree explicitly, so no remote fetch runs.
    const hasApm =
      !skillsFrom &&
      (await fs
        .access(apmYml)
        .then(() => true)
        .catch(() => false));

    if (hasApm) {
      await this.#runApmInstall(family.rootPath);
      try {
        await fs.access(sourceClaude);
      } catch {
        throw new Error(
          `apm install did not produce .claude/ at ${sourceClaude}; check the family's apm.yml`,
        );
      }
    }

    await fs.rm(stagingDir, { recursive: true, force: true });
    const hasClaudeDir = await fs
      .access(sourceClaude)
      .then(() => true)
      .catch(() => false);
    if (skillsFrom && !hasClaudeDir) {
      throw new Error(`--skills-from has no .claude/ tree at ${sourceClaude}`);
    }
    if (hasClaudeDir) {
      await fs.cp(sourceClaude, stagedClaude, { recursive: true });
    } else {
      await fs.mkdir(stagedClaude, { recursive: true });
    }

    // Stage the family-local judge profile outside .claude/ so it is available
    // to the judge but never copied into the agent-under-test's CWD.
    const judgeSource = join(family.rootPath, "judge.md");
    const judgeProfilesDir = join(stagingDir, "judge-profiles");
    try {
      await fs.access(judgeSource);
      await fs.mkdir(judgeProfilesDir, { recursive: true });
      await fs.cp(judgeSource, join(judgeProfilesDir, "judge.md"));
    } catch {}

    const lockPath = join(family.rootPath, "apm.lock.yaml");
    let skillSetHash = "";
    try {
      const lockBytes = await fs.readFile(lockPath);
      skillSetHash =
        "sha256:" +
        createHash("sha256").update(normalizeLf(lockBytes)).digest("hex");
    } catch {
      // No lockfile — family doesn't use skill packs.
    }

    return { stagingDir, skillSetHash, judgeProfilesDir };
  }

  async #runApmInstall(cwd) {
    const child = this.runtime.subprocess.spawn(
      "apm",
      ["install", "--target", "claude"],
      { cwd, stdio: ["ignore", "pipe", "pipe"] },
    );
    // Drain stdout concurrently so the child never blocks on backpressure;
    // capture stderr for the failure message.
    let stderr = "";
    const drainStdout = (async () => {
      for await (const _chunk of child.stdout) {
        // discard
      }
    })();
    for await (const chunk of child.stderr) stderr += chunk.toString();
    await drainStdout;
    const code = await child.exitCode;
    if (code !== 0) {
      throw new Error(`apm install exited ${code}: ${stderr}`);
    }
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
 * @param {ConstructorParameters<typeof ApmInstaller>[0]} deps
 * @returns {ApmInstaller}
 */
export function createApmInstaller(deps) {
  return new ApmInstaller(deps);
}

/**
 * Free-function shorthand for callers that thread a runtime bag.
 * @param {import("./task-family.js").TaskFamily} family
 * @param {string} outputDir
 * @param {import("@forwardimpact/libutil/runtime").Runtime} runtime
 * @param {object} [options] - Forwarded to `ApmInstaller.install` (e.g.
 *   `{ skillsFrom }`).
 */
export function installApm(family, outputDir, runtime, options = {}) {
  return new ApmInstaller({ runtime }).install(family, outputDir, options);
}
