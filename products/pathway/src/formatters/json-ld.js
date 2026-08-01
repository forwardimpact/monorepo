/**
 * JSON-LD structured data generation
 *
 * These functions generate JSON-LD for entity pages so machines can read the
 * data. The output aligns with the RDF schema at
 * https://www.forwardimpact.team/schema/rdf/
 */

const VOCAB_BASE = "https://www.forwardimpact.team/schema/rdf/";

/**
 * Create a JSON-LD script element
 * @param {Object} data - JSON-LD data object
 * @returns {HTMLScriptElement}
 */
export function createJsonLdScript(data) {
  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.textContent = JSON.stringify(data, null, 2);
  return script;
}

/**
 * Build base JSON-LD context and type
 * @param {string} type - Entity type (without vocab prefix)
 * @param {string} id - Entity ID
 * @returns {Object}
 */
function baseJsonLd(type, id) {
  return {
    "@context": VOCAB_BASE,
    "@type": type,
    "@id": `${VOCAB_BASE}${type}/${id}`,
  };
}

/**
 * Generate JSON-LD for a skill entity
 * @param {Object} skill - Raw skill entity
 * @param {Object} context - Additional context
 * @param {Array} [context.capabilities] - Capability entities
 * @returns {Object}
 */
export function skillToJsonLd(skill, { capabilities = [] } = {}) {
  const capability = capabilities.find((c) => c.id === skill.capability);

  return {
    ...baseJsonLd("Skill", skill.id),
    identifier: skill.id,
    name: skill.name,
    description: skill.description,
    capability: skill.capability,
    ...(capability && { capabilityName: capability.name }),
    ...(skill.isHumanOnly && { isHumanOnly: true }),
    proficiencyDescriptions: Object.entries(
      skill.proficiencyDescriptions || {},
    ).map(([level, description]) => ({
      "@type": "SkillProficiencyDescription",
      level: `${VOCAB_BASE}${level}`,
      description,
    })),
  };
}

/**
 * Generate JSON-LD for a behaviour entity
 * @param {Object} behaviour - Raw behaviour entity
 * @returns {Object}
 */
export function behaviourToJsonLd(behaviour) {
  return {
    ...baseJsonLd("Behaviour", behaviour.id),
    identifier: behaviour.id,
    name: behaviour.name,
    description: behaviour.description,
    maturityDescriptions: Object.entries(
      behaviour.maturityDescriptions || {},
    ).map(([maturity, description]) => ({
      "@type": "BehaviourMaturityDescription",
      maturity: `${VOCAB_BASE}${maturity}`,
      description,
    })),
  };
}

/**
 * Generate JSON-LD for a discipline entity
 * @param {Object} discipline - Raw discipline entity
 * @param {Object} context - Additional context
 * @param {Array} [context.skills] - All skills
 * @returns {Object}
 */
export function disciplineToJsonLd(discipline, { skills = [] } = {}) {
  const resolveSkillNames = (skillIds) =>
    (skillIds || [])
      .map((id) => {
        const skill = skills.find((s) => s.id === id);
        return skill
          ? { "@id": `${VOCAB_BASE}Skill/${id}`, name: skill.name }
          : null;
      })
      .filter(Boolean);

  return {
    ...baseJsonLd("Discipline", discipline.id),
    identifier: discipline.id,
    name: discipline.name,
    ...(discipline.specialization && {
      specialization: discipline.specialization,
    }),
    description: discipline.description,
    coreSkills: resolveSkillNames(discipline.coreSkills),
    supportingSkills: resolveSkillNames(discipline.supportingSkills),
    broadSkills: resolveSkillNames(discipline.broadSkills),
  };
}

/**
 * Generate JSON-LD for a track entity
 * @param {Object} track - Raw track entity
 * @returns {Object}
 */
export function trackToJsonLd(track) {
  return {
    ...baseJsonLd("Track", track.id),
    identifier: track.id,
    name: track.name,
    description: track.description,
    ...(track.skillModifiers && {
      skillModifiers: Object.entries(track.skillModifiers).map(
        ([capability, modifier]) => ({
          "@type": "SkillModifier",
          capability,
          modifier,
        }),
      ),
    }),
    ...(track.behaviourModifiers && {
      behaviourModifiers: Object.entries(track.behaviourModifiers).map(
        ([behaviour, modifier]) => ({
          "@type": "BehaviourModifier",
          behaviour,
          modifier,
        }),
      ),
    }),
  };
}

/**
 * Generate JSON-LD for a level entity
 * @param {Object} level - Raw level entity
 * @returns {Object}
 */
export function levelToJsonLd(level) {
  return {
    ...baseJsonLd("Level", level.id),
    identifier: level.id,
    name: level.displayName || level.name,
    ...(level.ordinalRank && { ordinalRank: level.ordinalRank }),
    ...(level.typicalExperienceRange && {
      typicalExperienceRange: level.typicalExperienceRange,
    }),
    ...(level.baseSkillProficiencies && {
      baseSkillProficiencies: {
        "@type": "BaseSkillProficiencies",
        core: `${VOCAB_BASE}${level.baseSkillProficiencies.core}`,
        supporting: `${VOCAB_BASE}${level.baseSkillProficiencies.supporting}`,
        broad: `${VOCAB_BASE}${level.baseSkillProficiencies.broad}`,
      },
    }),
    ...(level.baseBehaviourMaturity && {
      baseBehaviourMaturity: `${VOCAB_BASE}${level.baseBehaviourMaturity}`,
    }),
  };
}

/**
 * Generate JSON-LD for a driver entity
 * @param {Object} driver - Raw driver entity
 * @param {Object} context - Additional context
 * @param {Array} [context.skills] - All skills
 * @param {Array} [context.behaviours] - All behaviours
 * @returns {Object}
 */
export function driverToJsonLd(driver, { skills = [], behaviours = [] } = {}) {
  const resolveSkills = (skillIds) =>
    (skillIds || [])
      .map((id) => {
        const skill = skills.find((s) => s.id === id);
        return skill
          ? { "@id": `${VOCAB_BASE}Skill/${id}`, name: skill.name }
          : null;
      })
      .filter(Boolean);

  const resolveBehaviours = (behaviourIds) =>
    (behaviourIds || [])
      .map((id) => {
        const behaviour = behaviours.find((b) => b.id === id);
        return behaviour
          ? { "@id": `${VOCAB_BASE}Behaviour/${id}`, name: behaviour.name }
          : null;
      })
      .filter(Boolean);

  return {
    ...baseJsonLd("Driver", driver.id),
    identifier: driver.id,
    name: driver.name,
    description: driver.description,
    ...(driver.contributingSkills?.length > 0 && {
      contributingSkills: resolveSkills(driver.contributingSkills),
    }),
    ...(driver.contributingBehaviours?.length > 0 && {
      contributingBehaviours: resolveBehaviours(driver.contributingBehaviours),
    }),
  };
}
