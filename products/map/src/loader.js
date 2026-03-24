/**
 * Engineering Pathway Data Loader
 *
 * Utility for loading and parsing YAML data files.
 * Uses directory structure: disciplines/, tracks/, skills/
 */

import { readFile, readdir, stat } from "fs/promises";
import { parse as parseYaml } from "yaml";
import { join, basename } from "path";

/**
 * Data loader class with injectable filesystem and parser dependencies.
 */
export class DataLoader {
  #fs;
  #parser;

  /**
   * @param {{ readFile: Function, readdir: Function, stat: Function }} fs
   * @param {{ parseYaml: Function }} parser
   */
  constructor(fs, parser) {
    if (!fs) throw new Error("fs is required");
    if (!parser) throw new Error("parser is required");
    this.#fs = fs;
    this.#parser = parser;
  }

  /**
   * Check if a file exists
   * @param {string} path - Path to check
   * @returns {Promise<boolean>} True if file exists
   */
  async #fileExists(path) {
    try {
      await this.#fs.stat(path);
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
  async loadYamlFile(filePath) {
    const content = await this.#fs.readFile(filePath, "utf-8");
    return this.#parser.parseYaml(content);
  }

  /**
   * Load framework configuration from a data directory
   * @param {string} dataDir - Path to the data directory
   * @returns {Promise<Object>} Framework configuration
   */
  async loadFrameworkConfig(dataDir) {
    return this.loadYamlFile(join(dataDir, "framework.yaml"));
  }

  /**
   * Load all question files from a directory
   * @param {string} dir - Directory path
   * @returns {Promise<Object>} Map of id to question levels
   */
  async #loadQuestionsFromDir(dir) {
    const files = await this.#fs.readdir(dir);
    const yamlFiles = files.filter((f) => f.endsWith(".yaml"));

    const entries = await Promise.all(
      yamlFiles.map(async (file) => {
        const id = basename(file, ".yaml");
        const content = await this.loadYamlFile(join(dir, file));
        return [id, content];
      }),
    );

    return Object.fromEntries(entries);
  }

  /**
   * Load skills from capability files
   * @param {string} capabilitiesDir - Path to capabilities directory
   * @returns {Promise<Array>} Array of skill objects in flat format
   */
  async #loadSkillsFromCapabilities(capabilitiesDir) {
    const files = await this.#fs.readdir(capabilitiesDir);
    const yamlFiles = files.filter(
      (f) => f.endsWith(".yaml") && !f.startsWith("_"),
    );

    const allSkills = [];

    for (const file of yamlFiles) {
      const capabilityId = basename(file, ".yaml");
      const capability = await this.loadYamlFile(join(capabilitiesDir, file));

      if (capability.skills && Array.isArray(capability.skills)) {
        for (const skill of capability.skills) {
          const {
            id,
            name,
            isHumanOnly,
            human,
            agent,
            instructions,
            installScript,
            implementationReference,
            toolReferences,
            markers,
          } = skill;
          allSkills.push({
            id,
            name,
            capability: capabilityId,
            description: human.description,
            proficiencyDescriptions: human.proficiencyDescriptions,
            ...(isHumanOnly && { isHumanOnly }),
            ...(agent && { agent }),
            ...(instructions && { instructions }),
            ...(installScript && { installScript }),
            ...(implementationReference && { implementationReference }),
            ...(toolReferences && { toolReferences }),
            ...(markers && { markers }),
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
  async #loadDisciplinesFromDir(disciplinesDir) {
    const files = await this.#fs.readdir(disciplinesDir);
    const yamlFiles = files.filter(
      (f) => f.endsWith(".yaml") && !f.startsWith("_"),
    );

    const disciplines = await Promise.all(
      yamlFiles.map(async (file) => {
        const id = basename(file, ".yaml");
        const content = await this.loadYamlFile(join(disciplinesDir, file));
        const {
          specialization,
          roleTitle,
          isProfessional,
          isManagement,
          validTracks,
          minLevel,
          description,
          coreSkills,
          supportingSkills,
          broadSkills,
          behaviourModifiers,
          human,
          agent,
        } = content;
        return {
          id,
          specialization,
          roleTitle,
          isProfessional,
          isManagement,
          validTracks,
          minLevel,
          description,
          coreSkills,
          supportingSkills,
          broadSkills,
          behaviourModifiers,
          ...human,
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
  async #loadTracksFromDir(tracksDir) {
    const files = await this.#fs.readdir(tracksDir);
    const yamlFiles = files.filter(
      (f) => f.endsWith(".yaml") && !f.startsWith("_"),
    );

    const tracks = await Promise.all(
      yamlFiles.map(async (file) => {
        const id = basename(file, ".yaml");
        const content = await this.loadYamlFile(join(tracksDir, file));
        const {
          name,
          description,
          roleContext,
          skillModifiers,
          behaviourModifiers,
          assessmentWeights,
          minLevel,
          agent,
        } = content;
        return {
          id,
          name,
          description,
          roleContext,
          skillModifiers,
          behaviourModifiers,
          assessmentWeights,
          minLevel,
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
  async #loadBehavioursFromDir(behavioursDir) {
    const files = await this.#fs.readdir(behavioursDir);
    const yamlFiles = files.filter(
      (f) => f.endsWith(".yaml") && !f.startsWith("_"),
    );

    const behaviours = await Promise.all(
      yamlFiles.map(async (file) => {
        const id = basename(file, ".yaml");
        const content = await this.loadYamlFile(join(behavioursDir, file));
        const { name, human, agent } = content;
        return {
          id,
          name,
          ...human,
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
  async #loadCapabilitiesFromDir(capabilitiesDir) {
    const files = await this.#fs.readdir(capabilitiesDir);
    const yamlFiles = files.filter(
      (f) => f.endsWith(".yaml") && !f.startsWith("_"),
    );

    const capabilities = await Promise.all(
      yamlFiles.map(async (file) => {
        const id = basename(file, ".yaml");
        const content = await this.loadYamlFile(join(capabilitiesDir, file));
        return { id, ...content };
      }),
    );

    return capabilities;
  }

  /**
   * Load questions from folder structure
   * @param {string} questionsDir - Path to questions directory
   * @returns {Promise<Object>}
   */
  async loadQuestionFolder(questionsDir) {
    const [skillProficiencies, behaviourMaturities, capabilityLevels] =
      await Promise.all([
        this.#loadQuestionsFromDir(join(questionsDir, "skills")).catch(
          () => ({}),
        ),
        this.#loadQuestionsFromDir(join(questionsDir, "behaviours")).catch(
          () => ({}),
        ),
        this.#loadQuestionsFromDir(join(questionsDir, "capabilities")).catch(
          () => ({}),
        ),
      ]);

    return { skillProficiencies, behaviourMaturities, capabilityLevels };
  }

  /**
   * Load all data from a directory (without validation — caller validates separately)
   * @param {string} dataDir - Path to the data directory
   * @returns {Promise<Object>} All loaded data
   */
  async loadAllData(dataDir) {
    const capabilities = await this.#loadCapabilitiesFromDir(
      join(dataDir, "capabilities"),
    );

    const skills = await this.#loadSkillsFromCapabilities(
      join(dataDir, "capabilities"),
    );

    const [
      drivers,
      behaviours,
      disciplines,
      tracks,
      levels,
      stages,
      questions,
      framework,
    ] = await Promise.all([
      this.loadYamlFile(join(dataDir, "drivers.yaml")),
      this.#loadBehavioursFromDir(join(dataDir, "behaviours")),
      this.#loadDisciplinesFromDir(join(dataDir, "disciplines")),
      this.#loadTracksFromDir(join(dataDir, "tracks")),
      this.loadYamlFile(join(dataDir, "levels.yaml")),
      this.loadYamlFile(join(dataDir, "stages.yaml")),
      this.loadQuestionFolder(join(dataDir, "questions")),
      this.loadYamlFile(join(dataDir, "framework.yaml")),
    ]);

    return {
      drivers,
      behaviours,
      skills,
      disciplines,
      tracks,
      levels,
      capabilities,
      stages,
      questions,
      framework,
    };
  }

  /**
   * Try loading a YAML file from repository/ subdirectory first, then root.
   * @param {string} dataDir - Data directory
   * @param {string} filename - File to load
   * @param {*} fallback - Value if file not found in either location
   * @returns {Promise<*>}
   */
  async #loadRepoFile(dataDir, filename, fallback) {
    const repoPath = join(dataDir, "repository", filename);
    if (await this.#fileExists(repoPath)) return this.loadYamlFile(repoPath);
    const rootPath = join(dataDir, filename);
    if (await this.#fileExists(rootPath)) return this.loadYamlFile(rootPath);
    return fallback;
  }

  /**
   * Load agent-specific data for agent profile generation
   * @param {string} dataDir - Path to the data directory
   * @returns {Promise<Object>} Agent data
   */
  async loadAgentData(dataDir) {
    const disciplinesDir = join(dataDir, "disciplines");
    const tracksDir = join(dataDir, "tracks");
    const behavioursDir = join(dataDir, "behaviours");

    const [
      disciplineFiles,
      trackFiles,
      behaviourFiles,
      vscodeSettings,
      devcontainer,
      copilotSetupSteps,
    ] = await Promise.all([
      this.#loadDisciplinesFromDir(disciplinesDir),
      this.#loadTracksFromDir(tracksDir),
      this.#loadBehavioursFromDir(behavioursDir),
      this.#loadRepoFile(dataDir, "vscode-settings.yaml", {}),
      this.#loadRepoFile(dataDir, "devcontainer.yaml", {}),
      this.#loadRepoFile(dataDir, "copilot-setup-steps.yaml", null),
    ]);

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
   * @param {string} dataDir - Path to the data directory
   * @returns {Promise<Array>} Skills with agent sections preserved
   */
  async loadSkillsWithAgentData(dataDir) {
    const capabilitiesDir = join(dataDir, "capabilities");

    const files = await this.#fs.readdir(capabilitiesDir);
    const yamlFiles = files.filter(
      (f) => f.endsWith(".yaml") && !f.startsWith("_"),
    );

    const allSkills = [];

    for (const file of yamlFiles) {
      const capabilityId = basename(file, ".yaml");
      const capability = await this.loadYamlFile(join(capabilitiesDir, file));

      if (capability.skills && Array.isArray(capability.skills)) {
        for (const skill of capability.skills) {
          allSkills.push({
            ...skill,
            capability: capabilityId,
          });
        }
      }
    }

    return allSkills;
  }
}

/**
 * Create a DataLoader with real filesystem and parser dependencies
 * @returns {DataLoader}
 */
export function createDataLoader() {
  return new DataLoader({ readFile, readdir, stat }, { parseYaml });
}
