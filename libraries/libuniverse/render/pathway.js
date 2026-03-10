/**
 * Pathway Renderer — converts LLM-generated JSON to YAML files.
 *
 * @module libuniverse/render/pathway
 */

import YAML from "yaml";

/**
 * Render pathway YAML files from generated entity data.
 *
 * @param {object} pathwayData - Keyed by entity type
 * @returns {Map<string,string>} path → YAML content
 */
export function renderPathway(pathwayData) {
  const files = new Map();

  // Single-file entities
  if (pathwayData.framework) {
    files.set("framework.yaml", toYaml(pathwayData.framework, "framework"));
  }
  if (pathwayData.levels) {
    files.set("levels.yaml", toYaml(pathwayData.levels, "levels"));
  }
  if (pathwayData.stages) {
    files.set("stages.yaml", toYaml(pathwayData.stages, "stages"));
  }
  if (pathwayData.drivers) {
    files.set("drivers.yaml", toYaml(pathwayData.drivers, "drivers"));
  }
  if (pathwayData.selfAssessments) {
    files.set(
      "self-assessments.yaml",
      toYaml(pathwayData.selfAssessments, "self-assessments"),
    );
  }

  // Multi-file entities (one YAML per entity)
  if (pathwayData.capabilities) {
    const capIds = [];
    for (const cap of pathwayData.capabilities) {
      const id = cap._id || cap.id;
      const data = stripInternal(cap);
      files.set(`capabilities/${id}.yaml`, toYaml(data, "capability"));
      capIds.push(id);
    }
    files.set("capabilities/_index.yaml", renderIndex(capIds));
  }

  if (pathwayData.behaviours) {
    const behIds = [];
    for (const beh of pathwayData.behaviours) {
      const id = beh._id || beh.id;
      const data = stripInternal(beh);
      files.set(`behaviours/${id}.yaml`, toYaml(data, "behaviour"));
      behIds.push(id);
    }
    files.set("behaviours/_index.yaml", renderIndex(behIds));
  }

  if (pathwayData.disciplines) {
    const discIds = [];
    for (const disc of pathwayData.disciplines) {
      const id = disc._id || disc.id;
      const data = stripInternal(disc);
      files.set(`disciplines/${id}.yaml`, toYaml(data, "discipline"));
      discIds.push(id);
    }
    files.set("disciplines/_index.yaml", renderIndex(discIds));
  }

  if (pathwayData.tracks) {
    const trackIds = [];
    for (const track of pathwayData.tracks) {
      const id = track._id || track.id;
      const data = stripInternal(track);
      files.set(`tracks/${id}.yaml`, toYaml(data, "track"));
      trackIds.push(id);
    }
    files.set("tracks/_index.yaml", renderIndex(trackIds));
  }

  return files;
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
    "# Do not edit manually - regenerate with: npx pathway --generate-index",
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
