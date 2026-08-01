/**
 * SDV tool — generates statistically representative tabular data through a
 * Python subprocess.
 */

import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

/**
 * Generate statistically representative tabular data. Delegate to SDV
 * through a Python subprocess.
 */
export class SdvTool {
  /**
   * @param {object} deps
   * @param {object} deps.logger
   * @param {Function} deps.execFileFn - async (cmd, args) => { stdout }
   * @param {object} deps.fsFns - { writeFile, rm }
   */
  constructor({ logger, execFileFn, fsFns }) {
    if (!logger) throw new Error("SdvTool requires logger");
    if (!execFileFn) throw new Error("SdvTool requires execFileFn");
    if (!fsFns) throw new Error("SdvTool requires fsFns");
    this.logger = logger;
    this.execFileFn = execFileFn;
    this.fsFns = fsFns;
    this.scriptPath = join(import.meta.dirname, "sdv_generate.py");
  }

  /**
   * Check that Python 3 with SDV is available.
   * @returns {Promise<boolean>}
   */
  async checkAvailability() {
    try {
      await this.execFileFn("python3", ["-c", "import sdv"]);
      return true;
    } catch {
      throw new Error(
        "SDV requires Python 3 with the sdv package. " +
          "Install with: pip install sdv",
      );
    }
  }

  /**
   * Generate tabular data that preserves the statistical properties of the
   * sample data.
   * @param {object} config
   * @param {string} config.name - Dataset name from DSL
   * @param {string} config.metadata - Path to SDV metadata JSON
   * @param {Object<string, string>} config.data - Map of table name → CSV path
   * @param {number} [config.rows=1000] - Number of rows to generate
   * @param {number} config.seed - RNG seed
   * @returns {Promise<Dataset[]>}
   */
  async generate(config) {
    const tmpConfig = join(tmpdir(), `sdv-config-${randomUUID()}.json`);
    await this.fsFns.writeFile(
      tmpConfig,
      JSON.stringify({
        metadata: config.metadata,
        data: config.data,
        rows: config.rows || 1000,
        seed: config.seed,
      }),
    );

    this.logger.info("sdv", `Running SDV: rows=${config.rows || 1000}`);
    const { stdout } = await this.execFileFn("python3", [
      this.scriptPath,
      tmpConfig,
    ]);
    await this.fsFns.rm(tmpConfig);

    // Parse newline-delimited JSON
    return stdout
      .trim()
      .split("\n")
      .map((line) => {
        const obj = JSON.parse(line);
        return {
          name: `${config.name}_${obj.name}`,
          schema: null,
          records: obj.records,
          metadata: { tool: "sdv", table: obj.name },
        };
      });
  }
}

/**
 * @param {object} deps
 * @returns {SdvTool}
 */
export function createSdvTool(deps) {
  return new SdvTool(deps);
}
