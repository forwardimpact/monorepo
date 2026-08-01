/**
 * Pathway Renderer — converts LLM-generated JSON to YAML files.
 *
 * @module libterrain/render/pathway
 */

import YAML from "yaml";

/** @type {Array<[string, string, string]>} [dataKey, directory, schemaName] */
const SINGLE_FILE_ENTITIES = [
  ["standard", "standard.yaml", "standard"],
  ["levels", "levels.yaml", "levels"],
  ["drivers", "drivers.yaml", "drivers"],
  ["selfAssessments", "self-assessments.yaml", "self-assessments"],
];

/** @type {Array<[string, string, string]>} [dataKey, directory, schemaName] */
const MULTI_FILE_ENTITIES = [
  ["capabilities", "capabilities", "capability"],
  ["behaviours", "behaviours", "behaviour"],
  ["disciplines", "disciplines", "discipline"],
  ["tracks", "tracks", "track"],
];

/**
 * Render a multi-file entity group into YAML files with an index.
 * @param {Map<string,string>} files
 * @param {object[]} entities
 * @param {string} dir
 * @param {string} schemaName
 */
function renderEntityGroup(files, entities, dir, schemaName) {
  const ids = [];
  for (const entity of entities) {
    if (!entity) continue;
    const id = entity._id || entity.id;
    files.set(`${dir}/${id}.yaml`, toYaml(stripInternal(entity), schemaName));
    ids.push(id);
  }
  files.set(`${dir}/_index.yaml`, renderIndex(ids));
}

/**
 * Render pathway YAML files from generated entity data.
 *
 * @param {object} pathwayData - Each key is an entity type
 * @returns {Map<string,string>} path → YAML content
 */
export function renderPathway(pathwayData) {
  const files = new Map();

  for (const [key, filename, schema] of SINGLE_FILE_ENTITIES) {
    if (pathwayData[key]) {
      files.set(filename, toYaml(pathwayData[key], schema));
    }
  }

  for (const [key, dir, schema] of MULTI_FILE_ENTITIES) {
    if (pathwayData[key]) {
      renderEntityGroup(files, pathwayData[key], dir, schema);
    }
  }

  files.set("repository/claude-settings.yaml", renderClaudeSettings());

  return files;
}

/**
 * Render the Claude Code settings file with sensible defaults for a
 * newly generated agent team.
 *
 * @returns {string}
 */
function renderClaudeSettings() {
  return YAML.stringify({
    permissions: { defaultMode: "acceptEdits" },
  });
}

/**
 * Convert data to YAML with a schema comment header.
 *
 * @param {object} data
 * @param {string} schemaName
 * @returns {string}
 */
function toYaml(data, schemaName) {
  const schemaComment = `# yaml-language-server: $schema=https://www.forwardimpact.team/schema/json/${schemaName}.schema.json\n\n`;
  return schemaComment + YAML.stringify(data, { lineWidth: 80 });
}

/**
 * Render an _index.yaml file.
 *
 * @param {string[]} ids
 * @returns {string}
 */
function renderIndex(ids) {
  const content = [
    "# Auto-generated index for browser loading",
    "# Do not edit manually - regenerate with: bunx pathway --generate-index",
  ];
  return content.join("\n") + "\n" + YAML.stringify({ files: ids });
}

/**
 * Strip internal properties (prefixed with _) from an object.
 *
 * @param {object} obj
 * @returns {object}
 */
function stripInternal(obj) {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!key.startsWith("_")) result[key] = value;
  }
  return result;
}
