/**
 * NpmInstaller — runs `bun install` in the family root when a package.json
 * is present, then copies the resulting `node_modules/` into the staging
 * directory so WorkdirManager can seed each per-task CWD.
 *
 * Symmetric to ApmInstaller: constructor injection of `spawn` for testability,
 * factory function, and a free-function shorthand.
 */

import { spawn as nodeSpawn } from "node:child_process";
import { access, cp } from "node:fs/promises";
import { join } from "node:path";

/** Run `bun install` in the family root and stage node_modules/ for per-task CWDs. */
export class NpmInstaller {
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
   * @param {string} stagingDir - The staging directory (created by ApmInstaller).
   * @returns {Promise<void>}
   */
  async install(family, stagingDir) {
    const pkgJson = join(family.rootPath, "package.json");
    const hasPkg = await access(pkgJson)
      .then(() => true)
      .catch(() => false);
    if (!hasPkg) return;

    await this.#runBunInstall(family.rootPath);

    const sourceModules = join(family.rootPath, "node_modules");
    try {
      await access(sourceModules);
    } catch {
      throw new Error(
        `bun install did not produce node_modules/ at ${sourceModules}; check the family's package.json`,
      );
    }

    await cp(sourceModules, join(stagingDir, "node_modules"), {
      recursive: true,
    });
  }

  #runBunInstall(cwd) {
    return new Promise((res, rej) => {
      const child = this.spawn("bun", ["install"], {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stderr = "";
      child.stdout.on("data", () => {});
      child.stderr.on("data", (d) => {
        stderr += d.toString();
      });
      child.on("error", (e) => {
        rej(new Error(`failed to spawn bun: ${e.message}`));
      });
      child.on("close", (code) => {
        if (code === 0) res();
        else rej(new Error(`bun install exited ${code}: ${stderr}`));
      });
    });
  }
}

/** Factory function — wires real dependencies. */
export function createNpmInstaller(deps) {
  return new NpmInstaller(deps);
}

/**
 * Free-function shorthand for callers that don't need to inject a spawn seam.
 * @param {import("./task-family.js").TaskFamily} family
 * @param {string} stagingDir
 */
export function installNpm(family, stagingDir) {
  return new NpmInstaller().install(family, stagingDir);
}
