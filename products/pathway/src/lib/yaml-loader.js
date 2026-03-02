/**
 * Browser-compatible YAML loading
 *
 * Generic utilities from @forwardimpact/libui/yaml-loader,
 * plus Pathway-specific entity loaders.
 */

export {
  loadYamlFile,
  tryLoadYamlFile,
  loadDirIndex,
} from "@forwardimpact/libui/yaml-loader";

import {
  loadYamlFile,
  tryLoadYamlFile,
  loadDirIndex,
} from "@forwardimpact/libui/yaml-loader";

/**
 * Load skills from capability files
 * Skills are embedded in capability YAML files under the 'skills' array.
 * This function extracts all skills and adds the capability ID back to each.
 * @param {string} capabilitiesDir - Path to capabilities directory
 * @returns {Promise<Array>} Array of skill objects
 */
async function loadSkillsFromCapabilities(capabilitiesDir) {
  const capabilityIds = await loadDirIndex(capabilitiesDir);
  const allSkills = [];

  for (const capabilityId of capabilityIds) {
    const capability = await loadYamlFile(
      `${capabilitiesDir}/${capabilityId}.yaml`,
    );

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
        } = skill;
        allSkills.push({
          id,
          name,
          capability: capabilityId, // Add capability from parent
          description: human.description,
          proficiencyDescriptions: human.proficiencyDescriptions,
          // Include isHumanOnly flag for agent filtering (defaults to false)
          ...(isHumanOnly && { isHumanOnly }),
          ...(agent && { agent }),
          // Include agent skill content fields
          ...(instructions && { instructions }),
          ...(installScript && { installScript }),
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
 * Load disciplines from directory using _index.yaml
 * @param {string} disciplinesDir - Path to disciplines directory
 * @returns {Promise<Array>} Array of discipline objects
 */
async function loadDisciplinesFromDir(disciplinesDir) {
  const disciplineIds = await loadDirIndex(disciplinesDir);

  const disciplines = await Promise.all(
    disciplineIds.map(async (id) => {
      const content = await loadYamlFile(`${disciplinesDir}/${id}.yaml`);
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
 * Load tracks from directory using _index.yaml
 * @param {string} tracksDir - Path to tracks directory
 * @returns {Promise<Array>} Array of track objects
 */
async function loadTracksFromDir(tracksDir) {
  const trackIds = await loadDirIndex(tracksDir);

  const tracks = await Promise.all(
    trackIds.map(async (id) => {
      const content = await loadYamlFile(`${tracksDir}/${id}.yaml`);
      const {
        name,
        description,
        roleContext,
        skillModifiers,
        behaviourModifiers,
        matchingWeights,
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
        matchingWeights,
        minLevel,
        ...(agent && { agent }),
      };
    }),
  );
  return tracks;
}

/**
 * Load behaviours from directory using _index.yaml
 * @param {string} behavioursDir - Path to behaviours directory
 * @returns {Promise<Array>} Array of behaviour objects
 */
async function loadBehavioursFromDir(behavioursDir) {
  const behaviourIds = await loadDirIndex(behavioursDir);

  const behaviours = await Promise.all(
    behaviourIds.map(async (id) => {
      const content = await loadYamlFile(`${behavioursDir}/${id}.yaml`);
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
 * Load capabilities from directory using _index.yaml
 * @param {string} capabilitiesDir - Path to capabilities directory
 * @returns {Promise<Array>} Array of capability objects
 */
async function loadCapabilitiesFromDir(capabilitiesDir) {
  const capabilityIds = await loadDirIndex(capabilitiesDir);

  const capabilities = await Promise.all(
    capabilityIds.map((id) => loadYamlFile(`${capabilitiesDir}/${id}.yaml`)),
  );
  return capabilities;
}

/**
 * Load questions from folder structure using skill/behaviour/capability IDs
 * @param {string} questionsDir - Path to questions directory
 * @param {Array} skills - Skills array (with id property)
 * @param {Array} behaviours - Behaviours array (with id property)
 * @param {Array} capabilities - Capabilities array (with id property)
 * @returns {Promise<Object>}
 */
async function loadQuestionFolder(
  questionsDir,
  skills,
  behaviours,
  capabilities,
) {
  const [skillEntries, behaviourEntries, capabilityEntries] = await Promise.all(
    [
      Promise.all(
        skills.map(async (skill) => {
          const content = await tryLoadYamlFile(
            `${questionsDir}/skills/${skill.id}.yaml`,
          );
          return [skill.id, content || {}];
        }),
      ),
      Promise.all(
        behaviours.map(async (behaviour) => {
          const content = await tryLoadYamlFile(
            `${questionsDir}/behaviours/${behaviour.id}.yaml`,
          );
          return [behaviour.id, content || {}];
        }),
      ),
      Promise.all(
        capabilities.map(async (capability) => {
          const content = await tryLoadYamlFile(
            `${questionsDir}/capabilities/${capability.id}.yaml`,
          );
          return [capability.id, content || {}];
        }),
      ),
    ],
  );

  return {
    skillProficiencies: Object.fromEntries(skillEntries),
    behaviourMaturities: Object.fromEntries(behaviourEntries),
    capabilityLevels: Object.fromEntries(capabilityEntries),
  };
}

/**
 * Load all data files
 * @param {string} [dataDir='./data'] - Path to data directory
 * @returns {Promise<Object>}
 */
export async function loadAllData(dataDir = "./data") {
  const capabilities = await loadCapabilitiesFromDir(`${dataDir}/capabilities`);
  const skills = await loadSkillsFromCapabilities(`${dataDir}/capabilities`);

  const [drivers, behaviours, disciplines, tracks, levels, stages, framework] =
    await Promise.all([
      loadYamlFile(`${dataDir}/drivers.yaml`),
      loadBehavioursFromDir(`${dataDir}/behaviours`),
      loadDisciplinesFromDir(`${dataDir}/disciplines`),
      loadTracksFromDir(`${dataDir}/tracks`),
      loadYamlFile(`${dataDir}/levels.yaml`),
      loadYamlFile(`${dataDir}/stages.yaml`),
      loadYamlFile(`${dataDir}/framework.yaml`),
    ]);

  const questions = await loadQuestionFolder(
    `${dataDir}/questions`,
    skills,
    behaviours,
    capabilities,
  );

  return {
    drivers,
    behaviours,
    skills,
    disciplines,
    tracks,
    levels,
    questions,
    capabilities,
    stages,
    framework,
  };
}

/**
 * Load agent-specific data for browser-based agent generation
 * @param {string} [dataDir='./data'] - Path to data directory
 * @returns {Promise<Object>}
 */
export async function loadAgentDataBrowser(dataDir = "./data") {
  const [
    disciplines,
    tracks,
    behaviours,
    vscodeSettings,
    devcontainer,
    copilotSetupSteps,
  ] = await Promise.all([
    loadDisciplinesFromDir(`${dataDir}/disciplines`),
    loadTracksFromDir(`${dataDir}/tracks`),
    loadBehavioursFromDir(`${dataDir}/behaviours`),
    tryLoadYamlFile(`${dataDir}/vscode-settings.yaml`),
    tryLoadYamlFile(`${dataDir}/devcontainer.yaml`),
    tryLoadYamlFile(`${dataDir}/copilot-setup-steps.yaml`),
  ]);

  return {
    disciplines: disciplines
      .filter((d) => d.agent)
      .map((d) => ({ id: d.id, ...d.agent })),
    tracks: tracks
      .filter((t) => t.agent)
      .map((t) => ({ id: t.id, ...t.agent })),
    behaviours: behaviours
      .filter((b) => b.agent)
      .map((b) => ({ id: b.id, ...b.agent })),
    vscodeSettings: vscodeSettings || {},
    devcontainer: devcontainer || {},
    copilotSetupSteps: copilotSetupSteps || null,
  };
}
