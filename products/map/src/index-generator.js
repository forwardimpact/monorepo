/**
 * Directory Index Generator
 *
 * Generates _index.yaml files for browser-based directory discovery.
 * These files list all entity files in a directory.
 */

import { readdir, writeFile } from "fs/promises";
import { join, basename } from "path";
import { stringify as stringifyYaml } from "yaml";

/**
 * Index generator class with injectable filesystem and serializer dependencies.
 */
export class IndexGenerator {
  #fs;
  #yaml;

  /**
   * @param {{ readdir: Function, writeFile: Function }} fs
   * @param {{ stringify: Function }} yamlSerializer
   */
  constructor(fs, yamlSerializer) {
    if (!fs) throw new Error("fs is required");
    if (!yamlSerializer) throw new Error("yamlSerializer is required");
    this.#fs = fs;
    this.#yaml = yamlSerializer;
  }

  /**
   * Generate _index.yaml for a directory
   * @param {string} dir - Directory path
   * @returns {Promise<string[]>} List of file IDs included
   */
  async generateDirIndex(dir) {
    const files = await this.#fs.readdir(dir);
    const yamlFiles = files.filter(
      (f) => f.endsWith(".yaml") && !f.startsWith("_"),
    );

    const fileIds = yamlFiles.map((f) => basename(f, ".yaml")).sort();

    const content = this.#yaml.stringify(
      {
        // Auto-generated index for browser loading
        // Do not edit manually - regenerate with: bunx pathway --generate-index
        files: fileIds,
      },
      { lineWidth: 0 },
    );

    const output = `# Auto-generated index for browser loading
# Do not edit manually - regenerate with: bunx pathway --generate-index
${content}`;

    await this.#fs.writeFile(join(dir, "_index.yaml"), output, "utf-8");

    return fileIds;
  }

  /**
   * Generate all index files for the data directory
   * @param {string} dataDir - Path to the data directory
   * @returns {Promise<Object>} Summary of generated indexes
   */
  async generateAllIndexes(dataDir) {
    const directories = ["behaviours", "disciplines", "tracks", "capabilities"];

    const results = {};

    for (const dir of directories) {
      const fullPath = join(dataDir, dir);
      try {
        const files = await this.generateDirIndex(fullPath);
        results[dir] = files;
      } catch (err) {
        results[dir] = { error: err.message };
      }
    }

    return results;
  }
}

/**
 * Create an IndexGenerator with real filesystem and serializer dependencies
 * @returns {IndexGenerator}
 */
export function createIndexGenerator() {
  return new IndexGenerator(
    { readdir, writeFile },
    { stringify: stringifyYaml },
  );
}
