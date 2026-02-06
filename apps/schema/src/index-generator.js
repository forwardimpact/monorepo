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
 * Generate _index.yaml for a directory
 * @param {string} dir - Directory path
 * @returns {Promise<string[]>} List of file IDs included
 */
export async function generateDirIndex(dir) {
  const files = await readdir(dir);
  const yamlFiles = files.filter(
    (f) => f.endsWith(".yaml") && !f.startsWith("_"),
  );

  const fileIds = yamlFiles.map((f) => basename(f, ".yaml")).sort();

  const content = stringifyYaml(
    {
      // Auto-generated index for browser loading
      // Do not edit manually - regenerate with: npx pathway --generate-index
      files: fileIds,
    },
    { lineWidth: 0 },
  );

  // Add header comment
  const output = `# Auto-generated index for browser loading
# Do not edit manually - regenerate with: npx pathway --generate-index
${content}`;

  await writeFile(join(dir, "_index.yaml"), output, "utf-8");

  return fileIds;
}

/**
 * Generate all index files for the data directory
 * @param {string} dataDir - Path to the data directory
 * @returns {Promise<Object>} Summary of generated indexes
 */
export async function generateAllIndexes(dataDir) {
  const directories = ["behaviours", "disciplines", "tracks", "capabilities"];

  const results = {};

  for (const dir of directories) {
    const fullPath = join(dataDir, dir);
    try {
      const files = await generateDirIndex(fullPath);
      results[dir] = files;
    } catch (err) {
      results[dir] = { error: err.message };
    }
  }

  return results;
}
