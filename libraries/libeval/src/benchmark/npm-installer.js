/**
 * NpmInstaller — runs `bun install` in the family root when a package.json
 * is present, then copies the resulting `node_modules/` into the staging
 * directory so WorkdirManager can seed each per-task CWD.
 *
 * Symmetric to ApmInstaller: the subprocess and filesystem flow through the
 * injected `runtime` bag (`runtime.subprocess.spawn` + `runtime.fs`).
 */

import { join } from "node:path";

/** Run `bun install` in the family root and stage node_modules/ for per-task CWDs. */
export class NpmInstaller {
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
   * @param {string} stagingDir - The staging directory (created by ApmInstaller).
   * @returns {Promise<void>}
   */
  async install(family, stagingDir) {
    const fs = this.runtime.fs;
    const pkgJson = join(family.rootPath, "package.json");
    const hasPkg = await fs
      .access(pkgJson)
      .then(() => true)
      .catch(() => false);
    if (!hasPkg) return;

    await this.#runBunInstall(family.rootPath);

    const sourceModules = join(family.rootPath, "node_modules");
    try {
      await fs.access(sourceModules);
    } catch {
      throw new Error(
        `bun install did not produce node_modules/ at ${sourceModules}; check the family's package.json`,
      );
    }

    await fs.cp(sourceModules, join(stagingDir, "node_modules"), {
      recursive: true,
    });
  }

  async #runBunInstall(cwd) {
    const child = this.runtime.subprocess.spawn("bun", ["install"], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
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
      throw new Error(`bun install exited ${code}: ${stderr}`);
    }
  }
}

/** Factory function — wires real dependencies. */
export function createNpmInstaller(deps) {
  return new NpmInstaller(deps);
}

/**
 * Free-function shorthand for callers that thread a runtime bag.
 * @param {import("./task-family.js").TaskFamily} family
 * @param {string} stagingDir
 * @param {import("@forwardimpact/libutil/runtime").Runtime} runtime
 */
export function installNpm(family, stagingDir, runtime) {
  return new NpmInstaller({ runtime }).install(family, stagingDir);
}
