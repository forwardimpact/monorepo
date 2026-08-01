/**
 * Browser-compatible YAML loader
 *
 * Uses _index.yaml files to discover files in directory structures.
 * The CLI generates these index files automatically.
 */

import { parse as parseYaml } from "/vendor/yaml/index.js";

/**
 * Load and parse a YAML file
 * @param {string} path - Path to the YAML file
 * @returns {Promise<*>}
 */
export async function loadYamlFile(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(
      `Failed to load ${path}: ${response.status} ${response.statusText}`,
    );
  }
  const text = await response.text();
  return parseYaml(text);
}

/**
 * Try to load a YAML file. Return null if the file is missing.
 * @param {string} path - Path to the YAML file
 * @returns {Promise<*|null>}
 */
export async function tryLoadYamlFile(path) {
  const response = await fetch(path);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(
      `Failed to load ${path}: ${response.status} ${response.statusText}`,
    );
  }
  const text = await response.text();
  return parseYaml(text);
}

/**
 * Load the directory index (a list of file IDs)
 * @param {string} dir - Directory path
 * @returns {Promise<string[]>} Array of file IDs
 */
export async function loadDirIndex(dir) {
  const index = await loadYamlFile(`${dir}/_index.yaml`);
  return index.files || [];
}
