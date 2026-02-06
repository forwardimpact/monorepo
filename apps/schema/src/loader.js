/**
 * Engineering Pathway Data Loader
 *
 * Utility for loading and parsing YAML data files.
 * Uses directory structure: disciplines/, tracks/, skills/
 */

import { readFile, readdir, stat } from "fs/promises";
import { parse as parseYaml } from "yaml";
import { join, basename } from "path";
import { validateAllData, validateQuestionBank } from "./validation.js";

/**
 * Check if a file exists
 * @param {string} path - Path to check
 * @returns {Promise<boolean>} True if file exists
 */
async function fileExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Load a YAML file and parse it
 * @param {string} filePath - Path to the YAML file
 * @returns {Promise<any>} Parsed YAML content
 */
export async function loadYamlFile(filePath) {
  const content = await readFile(filePath, "utf-8");
  return parseYaml(content);
}

/**
 * Load framework configuration from a data directory
 * @param {string} dataDir - Path to the data directory
 * @returns {Promise<Object>} Framework configuration
 */
export async function loadFrameworkConfig(dataDir) {
  return loadYamlFile(join(dataDir, "framework.yaml"));
}

/**
 * Load all question files from a directory
 * @param {string} dir - Directory path
 * @returns {Promise<Object>} Map of id to question levels
 */
async function loadQuestionsFromDir(dir) {
  const files = await readdir(dir);
  const yamlFiles = files.filter((f) => f.endsWith(".yaml"));

  const entries = await Promise.all(
    yamlFiles.map(async (file) => {
      const id = basename(file, ".yaml");
      const content = await loadYamlFile(join(dir, file));
      return [id, content];
    }),
  );

  return Object.fromEntries(entries);
}

/**
 * Load skills from capability files
 * Skills are embedded in capability YAML files under the 'skills' array.
 * This function extracts all skills and adds the capability ID back to each.
 * @param {string} capabilitiesDir - Path to capabilities directory
 * @returns {Promise<Array>} Array of skill objects in flat format
 */
async function loadSkillsFromCapabilities(capabilitiesDir) {
  const files = await readdir(capabilitiesDir);
  const yamlFiles = files.filter(
    (f) => f.endsWith(".yaml") && !f.startsWith("_"),
  );

  const allSkills = [];

  for (const file of yamlFiles) {
    const capabilityId = basename(file, ".yaml"); // Derive ID from filename
    const capability = await loadYamlFile(join(capabilitiesDir, file));

    if (capability.skills && Array.isArray(capability.skills)) {
      for (const skill of capability.skills) {
        const {
          id,
          name,
          isHumanOnly,
          human,
          agent,
          implementationReference,
          toolReferences,
        } = skill;
        allSkills.push({
          id,
          name,
          capability: capabilityId, // Add capability from parent
          description: human.description,
          levelDescriptions: human.levelDescriptions,
          // Include isHumanOnly flag for agent filtering (defaults to false)
          ...(isHumanOnly && { isHumanOnly }),
          // Preserve agent section for agent generation
          ...(agent && { agent }),
          // Include implementation reference and tool references (shared by human and agent)
          ...(implementationReference && { implementationReference }),
          ...(toolReferences && { toolReferences }),
        });
      }
    }
  }

  return allSkills;
}

/**
 * Load disciplines from directory (individual files: disciplines/{id}.yaml)
 * @param {string} disciplinesDir - Path to disciplines directory
 * @returns {Promise<Array>} Array of discipline objects
 */
async function loadDisciplinesFromDir(disciplinesDir) {
  const files = await readdir(disciplinesDir);
  const yamlFiles = files.filter(
    (f) => f.endsWith(".yaml") && !f.startsWith("_"),
  );

  const disciplines = await Promise.all(
    yamlFiles.map(async (file) => {
      const id = basename(file, ".yaml"); // Derive ID from filename
      const content = await loadYamlFile(join(disciplinesDir, file));
      const {
        specialization,
        roleTitle,
        // Track constraints
        isProfessional,
        isManagement,
        validTracks,
        minGrade,
        // Shared content - now at root level
        description,
        // Structural properties (derivation inputs) - at top level
        coreSkills,
        supportingSkills,
        broadSkills,
        behaviourModifiers,
        // Presentation sections
        human,
        agent,
      } = content;
      return {
        id,
        specialization,
        roleTitle,
        // Track constraints
        isProfessional,
        isManagement,
        validTracks,
        minGrade,
        // Shared content at top level
        description,
        // Structural properties at top level
        coreSkills,
        supportingSkills,
        broadSkills,
        behaviourModifiers,
        // Human presentation content (role summaries only)
        ...human,
        // Preserve agent section for agent generation
        ...(agent && { agent }),
      };
    }),
  );

  return disciplines;
}

/**
 * Load tracks from directory (individual files: tracks/{id}.yaml)
 * @param {string} tracksDir - Path to tracks directory
 * @returns {Promise<Array>} Array of track objects
 */
async function loadTracksFromDir(tracksDir) {
  const files = await readdir(tracksDir);
  const yamlFiles = files.filter(
    (f) => f.endsWith(".yaml") && !f.startsWith("_"),
  );

  const tracks = await Promise.all(
    yamlFiles.map(async (file) => {
      const id = basename(file, ".yaml"); // Derive ID from filename
      const content = await loadYamlFile(join(tracksDir, file));
      const {
        name,
        // Shared content - now at root level
        description,
        roleContext,
        // Structural properties (derivation inputs) - at top level
        skillModifiers,
        behaviourModifiers,
        assessmentWeights,
        minGrade,
        // Agent section (no human section anymore for tracks)
        agent,
      } = content;
      return {
        id,
        name,
        // Shared content at top level
        description,
        roleContext,
        // Structural properties at top level
        skillModifiers,
        behaviourModifiers,
        assessmentWeights,
        minGrade,
        // Preserve agent section for agent generation
        ...(agent && { agent }),
      };
    }),
  );

  return tracks;
}

/**
 * Load behaviours from directory (individual files: behaviours/{id}.yaml)
 * @param {string} behavioursDir - Path to behaviours directory
 * @returns {Promise<Array>} Array of behaviour objects
 */
async function loadBehavioursFromDir(behavioursDir) {
  const files = await readdir(behavioursDir);
  const yamlFiles = files.filter(
    (f) => f.endsWith(".yaml") && !f.startsWith("_"),
  );

  const behaviours = await Promise.all(
    yamlFiles.map(async (file) => {
      const id = basename(file, ".yaml"); // Derive ID from filename
      const content = await loadYamlFile(join(behavioursDir, file));
      // Flatten human properties to top level (behaviours use human: section in YAML)
      const { name, human, agent } = content;
      return {
        id,
        name,
        ...human,
        // Preserve agent section for agent generation
        ...(agent && { agent }),
      };
    }),
  );

  return behaviours;
}

/**
 * Load capabilities from directory
 * @param {string} capabilitiesDir - Path to capabilities directory
 * @returns {Promise<Array>} Array of capability objects
 */
async function loadCapabilitiesFromDir(capabilitiesDir) {
  const files = await readdir(capabilitiesDir);
  const yamlFiles = files.filter(
    (f) => f.endsWith(".yaml") && !f.startsWith("_"),
  );

  const capabilities = await Promise.all(
    yamlFiles.map(async (file) => {
      const id = basename(file, ".yaml"); // Derive ID from filename
      const content = await loadYamlFile(join(capabilitiesDir, file));
      return { id, ...content }; // Add derived ID
    }),
  );

  return capabilities;
}

/**
 * Load questions from folder structure
 * @param {string} questionsDir - Path to questions directory
 * @returns {Promise<import('./levels.js').QuestionBank>}
 */
export async function loadQuestionFolder(questionsDir) {
  const [skillLevels, behaviourMaturities] = await Promise.all([
    loadQuestionsFromDir(join(questionsDir, "skills")),
    loadQuestionsFromDir(join(questionsDir, "behaviours")),
  ]);

  return { skillLevels, behaviourMaturities };
}

/**
 * Load all data from a directory
 * @param {string} dataDir - Path to the data directory
 * @param {Object} [options] - Loading options
 * @param {boolean} [options.validate=true] - Whether to validate data after loading
 * @param {boolean} [options.throwOnError=true] - Whether to throw on validation errors
 * @returns {Promise<Object>} All loaded data
 */
export async function loadAllData(dataDir, options = {}) {
  const { validate = true, throwOnError = true } = options;

  // Load capabilities first (skills are embedded in capabilities)
  const capabilities = await loadCapabilitiesFromDir(
    join(dataDir, "capabilities"),
  );

  // Extract skills from capabilities
  const skills = await loadSkillsFromCapabilities(
    join(dataDir, "capabilities"),
  );

  // Load remaining data files in parallel
  const [
    drivers,
    behaviours,
    disciplines,
    tracks,
    grades,
    stages,
    questions,
    framework,
  ] = await Promise.all([
    loadYamlFile(join(dataDir, "drivers.yaml")),
    loadBehavioursFromDir(join(dataDir, "behaviours")),
    loadDisciplinesFromDir(join(dataDir, "disciplines")),
    loadTracksFromDir(join(dataDir, "tracks")),
    loadYamlFile(join(dataDir, "grades.yaml")),
    loadYamlFile(join(dataDir, "stages.yaml")),
    loadQuestionFolder(join(dataDir, "questions")),
    loadYamlFile(join(dataDir, "framework.yaml")),
  ]);

  const data = {
    drivers,
    behaviours,
    skills,
    disciplines,
    tracks,
    grades,
    capabilities,
    stages,
    questions,
    framework,
  };

  // Validate if requested
  if (validate) {
    const result = validateAllData(data);

    if (!result.valid && throwOnError) {
      const errorMessages = result.errors
        .map((e) => `${e.type}: ${e.message}`)
        .join("\n");
      throw new Error(`Data validation failed:\n${errorMessages}`);
    }

    data.validation = result;
  }

  return data;
}

/**
 * Load question bank from a folder
 * @param {string} questionsDir - Path to the questions folder
 * @param {import('./levels.js').Skill[]} [skills] - Skills for validation
 * @param {import('./levels.js').Behaviour[]} [behaviours] - Behaviours for validation
 * @param {Object} [options] - Loading options
 * @param {boolean} [options.validate=true] - Whether to validate
 * @param {boolean} [options.throwOnError=true] - Whether to throw on errors
 * @returns {Promise<import('./levels.js').QuestionBank>} Loaded question bank
 */
export async function loadQuestionBankFromFolder(
  questionsDir,
  skills,
  behaviours,
  options = {},
) {
  const { validate = true, throwOnError = true } = options;

  const questionBank = await loadQuestionFolder(questionsDir);

  if (validate && skills && behaviours) {
    const result = validateQuestionBank(questionBank, skills, behaviours);

    if (!result.valid && throwOnError) {
      const errorMessages = result.errors
        .map((e) => `${e.type}: ${e.message}`)
        .join("\n");
      throw new Error(`Question bank validation failed:\n${errorMessages}`);
    }

    questionBank.validation = result;
  }

  return questionBank;
}

/**
 * Load self-assessments from a file
 * @param {string} filePath - Path to the self-assessments YAML file
 * @returns {Promise<import('./levels.js').SelfAssessment[]>} Array of self-assessments
 */
export async function loadSelfAssessments(filePath) {
  return loadYamlFile(filePath);
}

/**
 * Create a data loader for a specific directory
 * @param {string} dataDir - Path to the data directory
 * @returns {Object} Data loader with bound methods
 */
export function createDataLoader(dataDir) {
  return {
    /**
     * Load all core data
     * @param {Object} [options] - Loading options
     * @returns {Promise<Object>} All data
     */
    loadAll: (options) => loadAllData(dataDir, options),

    /**
     * Load question bank
     * @param {import('./levels.js').Skill[]} skills - Skills for validation
     * @param {import('./levels.js').Behaviour[]} behaviours - Behaviours for validation
     * @param {Object} [options] - Loading options
     * @returns {Promise<import('./levels.js').QuestionBank>} Question bank
     */
    loadQuestions: (skills, behaviours, options) =>
      loadQuestionBankFromFolder(
        join(dataDir, "questions"),
        skills,
        behaviours,
        options,
      ),

    /**
     * Load self-assessments
     * @returns {Promise<import('./levels.js').SelfAssessment[]>} Self-assessments
     */
    loadSelfAssessments: () =>
      loadSelfAssessments(join(dataDir, "self-assessments.yaml")),

    /**
     * Load a specific file
     * @param {string} filename - File name to load
     * @returns {Promise<any>} Parsed content
     */
    loadFile: (filename) => loadYamlFile(join(dataDir, filename)),
  };
}

/**
 * Load example data from the examples directory
 * @param {string} rootDir - Root directory of the project
 * @param {Object} [options] - Loading options
 * @returns {Promise<Object>} Example data
 */
export async function loadExampleData(rootDir, options = {}) {
  const examplesDir = join(rootDir, "examples");
  return loadAllData(examplesDir, options);
}

/**
 * Validate data and optionally throw on errors
 *
 * This is a synchronous validation function for when you already have
 * the data loaded and just need to validate it.
 *
 * @param {Object} data - All competency data
 * @param {import('./levels.js').Driver[]} data.drivers - Drivers
 * @param {import('./levels.js').Behaviour[]} data.behaviours - Behaviours
 * @param {import('./levels.js').Skill[]} data.skills - Skills
 * @param {import('./levels.js').Discipline[]} data.disciplines - Disciplines
 * @param {import('./levels.js').Track[]} data.tracks - Tracks
 * @param {import('./levels.js').Grade[]} data.grades - Grades
 * @param {Object} [options] - Options
 * @param {boolean} [options.throwOnError=true] - Whether to throw on validation errors
 * @returns {{valid: boolean, data: Object, errors: Array, warnings: Array}}
 */
export function loadAndValidate(data, options = {}) {
  const { throwOnError = true } = options;

  const result = validateAllData(data);

  if (!result.valid && throwOnError) {
    const errorMessages = result.errors
      .map((e) => `${e.type}: ${e.message}`)
      .join("\n");
    throw new Error(`Data validation failed:\n${errorMessages}`);
  }

  return {
    valid: result.valid,
    data,
    errors: result.errors,
    warnings: result.warnings,
  };
}

/**
 * Load agent-specific data for agent profile generation
 * Uses co-located files: each entity file contains both human and agent sections
 * @param {string} dataDir - Path to the data directory
 * @returns {Promise<Object>} Agent data including disciplines, tracks, behaviours, vscodeSettings, devcontainer, copilotSetupSteps
 */
export async function loadAgentData(dataDir) {
  const disciplinesDir = join(dataDir, "disciplines");
  const tracksDir = join(dataDir, "tracks");
  const behavioursDir = join(dataDir, "behaviours");

  // Load from co-located files
  const [
    disciplineFiles,
    trackFiles,
    behaviourFiles,
    vscodeSettings,
    devcontainer,
    copilotSetupSteps,
  ] = await Promise.all([
    loadDisciplinesFromDir(disciplinesDir),
    loadTracksFromDir(tracksDir),
    loadBehavioursFromDir(behavioursDir),
    fileExists(join(dataDir, "vscode-settings.yaml"))
      ? loadYamlFile(join(dataDir, "vscode-settings.yaml"))
      : {},
    fileExists(join(dataDir, "devcontainer.yaml"))
      ? loadYamlFile(join(dataDir, "devcontainer.yaml"))
      : {},
    fileExists(join(dataDir, "copilot-setup-steps.yaml"))
      ? loadYamlFile(join(dataDir, "copilot-setup-steps.yaml"))
      : null,
  ]);

  // Extract agent sections from co-located files
  const disciplines = disciplineFiles
    .filter((d) => d.agent)
    .map((d) => ({
      id: d.id,
      ...d.agent,
    }));

  const tracks = trackFiles
    .filter((t) => t.agent)
    .map((t) => ({
      id: t.id,
      ...t.agent,
    }));

  const behaviours = behaviourFiles
    .filter((b) => b.agent)
    .map((b) => ({
      id: b.id,
      ...b.agent,
    }));

  return {
    disciplines,
    tracks,
    behaviours,
    vscodeSettings,
    devcontainer,
    copilotSetupSteps,
  };
}

/**
 * Load skills with agent sections from capability files
 * Skills are embedded in capability YAML files under the 'skills' array.
 * @param {string} dataDir - Path to the data directory
 * @returns {Promise<Array>} Skills with agent sections preserved
 */
export async function loadSkillsWithAgentData(dataDir) {
  const capabilitiesDir = join(dataDir, "capabilities");

  const files = await readdir(capabilitiesDir);
  const yamlFiles = files.filter(
    (f) => f.endsWith(".yaml") && !f.startsWith("_"),
  );

  const allSkills = [];

  for (const file of yamlFiles) {
    const capabilityId = basename(file, ".yaml"); // Derive ID from filename
    const capability = await loadYamlFile(join(capabilitiesDir, file));

    if (capability.skills && Array.isArray(capability.skills)) {
      for (const skill of capability.skills) {
        allSkills.push({
          ...skill,
          capability: capabilityId, // Add capability from parent filename
        });
      }
    }
  }

  return allSkills;
}
