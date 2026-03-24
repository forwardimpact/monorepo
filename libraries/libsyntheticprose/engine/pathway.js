/**
 * Pathway Engine — orchestrates LLM calls to generate pathway entity data.
 *
 * Generates entities in dependency order:
 * framework → levels → stages → behaviours → capabilities →
 * drivers → disciplines → tracks → self-assessments
 *
 * @module libuniverse/engine/pathway
 */

import { readFileSync } from "fs";
import { join } from "path";
import { buildFrameworkPrompt } from "../prompts/pathway/framework.js";
import { buildLevelPrompt } from "../prompts/pathway/level.js";
import { buildStagePrompt } from "../prompts/pathway/stage.js";
import { buildBehaviourPrompt } from "../prompts/pathway/behaviour.js";
import { buildCapabilityPrompt } from "../prompts/pathway/capability.js";
import { buildDriverPrompt } from "../prompts/pathway/driver.js";
import { buildDisciplinePrompt } from "../prompts/pathway/discipline.js";
import { buildTrackPrompt } from "../prompts/pathway/track.js";

/**
 * Load JSON schemas from the schema directory.
 * @param {string} schemaDir - Path to products/map/schema/json/
 * @returns {object} schemas keyed by entity type
 */
export function loadSchemas(schemaDir) {
  const names = [
    "framework",
    "levels",
    "stages",
    "behaviour",
    "capability",
    "discipline",
    "track",
    "drivers",
    "self-assessments",
    "defs",
  ];
  const schemas = {};
  for (const name of names) {
    schemas[name] = JSON.parse(
      readFileSync(join(schemaDir, `${name}.schema.json`), "utf-8"),
    );
  }
  return schemas;
}

/**
 * PathwayGenerator orchestrates LLM calls to generate pathway entity data.
 */
export class PathwayGenerator {
  /**
   * @param {import('./prose.js').ProseEngine} proseEngine - Prose engine for LLM calls
   * @param {object} logger - Logger instance
   */
  constructor(proseEngine, logger) {
    if (!proseEngine) throw new Error("proseEngine is required");
    if (!logger) throw new Error("logger is required");
    this.proseEngine = proseEngine;
    this.logger = logger;
  }

  /**
   * Generate all pathway entity data via LLM calls in dependency order.
   * @param {object} options
   * @param {object} options.framework - Framework AST from DSL parser
   * @param {string} options.domain - Universe domain
   * @param {string} options.industry - Universe industry
   * @param {object} options.schemas - Loaded JSON schemas
   * @returns {Promise<object>} Generated pathway data keyed by entity type
   */
  async generate({ framework, domain, industry, schemas }) {
    return generatePathwayData({
      framework,
      domain,
      industry,
      schemas,
      proseEngine: this.proseEngine,
    });
  }
}

/**
 * Generate all pathway entity data via LLM calls in dependency order.
 *
 * @param {object} options
 * @param {object} options.framework - Framework AST from DSL parser
 * @param {string} options.domain - Universe domain
 * @param {string} options.industry - Universe industry
 * @param {object} options.schemas - Loaded JSON schemas
 * @param {import('./prose.js').ProseEngine} options.proseEngine - Prose engine for LLM calls
 * @returns {Promise<object>} Generated pathway data keyed by entity type
 */
async function generatePathwayData({
  framework,
  domain,
  industry,
  schemas,
  proseEngine,
}) {
  const ctx = { domain, industry };

  // Collect all skill IDs and behaviour IDs from DSL declarations
  // (not from LLM output — these must be available even in no-prose mode)
  const skillIds = framework.capabilities.flatMap((c) => c.skills || []);
  const behaviourIds = framework.behaviours.map((b) => b.id);
  const trackIds = framework.tracks.map((t) => t.id);
  const capabilityIds = framework.capabilities.map((c) => c.id);

  // 1. Framework metadata
  const fw =
    (await generateEntity(
      "framework",
      "framework",
      buildFrameworkPrompt(framework, ctx, schemas.framework),
      proseEngine,
    )) || buildFrameworkFallback(framework, domain);

  // 2. Levels (deterministic fallback from DSL when prose unavailable)
  const levels =
    (await generateEntity(
      "levels",
      "levels",
      buildLevelPrompt(framework.levels, ctx, schemas.levels),
      proseEngine,
    )) || buildLevelsFallback(framework.levels, framework.proficiencies);

  // 3. Stages (deterministic fallback from DSL when prose unavailable)
  const stages =
    (await generateEntity(
      "stages",
      "stages",
      buildStagePrompt(framework.stages, ctx, schemas.stages),
      proseEngine,
    )) || buildStagesFallback(framework.stages);

  // 4. Behaviours (deterministic fallback from DSL when prose unavailable)
  const behaviours = await Promise.all(
    framework.behaviours.map((b) =>
      generateEntity(
        "behaviour",
        b.id,
        buildBehaviourPrompt(b, ctx, schemas.behaviour),
        proseEngine,
      ).then((data) =>
        data ? { ...data, _id: b.id } : buildBehaviourFallback(b),
      ),
    ),
  );

  // 5. Capabilities with skills (deterministic fallback from DSL when prose unavailable)
  const capabilities = await Promise.all(
    framework.capabilities.map((c, i) =>
      generateEntity(
        "capability",
        c.id,
        buildCapabilityPrompt(
          { ...c, ordinalRank: i + 1 },
          ctx,
          schemas.capability,
        ),
        proseEngine,
      ).then((data) =>
        data
          ? { ...data, _id: c.id }
          : buildCapabilityFallback(c, i + 1, framework.proficiencies),
      ),
    ),
  );

  // 6. Drivers (deterministic fallback from DSL when prose unavailable)
  const drivers =
    (await generateEntity(
      "drivers",
      "drivers",
      buildDriverPrompt(
        framework.drivers,
        { ...ctx, skillIds, behaviourIds },
        schemas.drivers,
      ),
      proseEngine,
    )) || buildDriversFallback(framework.drivers);

  // 7. Disciplines (deterministic fallback from DSL when prose unavailable)
  const disciplines = await Promise.all(
    framework.disciplines.map((d) =>
      generateEntity(
        "discipline",
        d.id,
        buildDisciplinePrompt(
          d,
          { ...ctx, skillIds, behaviourIds, trackIds },
          schemas.discipline,
        ),
        proseEngine,
      ).then((data) =>
        data
          ? { ...data, _id: d.id }
          : buildDisciplineFallback(d, skillIds, trackIds),
      ),
    ),
  );

  // 8. Tracks (deterministic fallback from DSL when prose unavailable)
  const tracks = await Promise.all(
    framework.tracks.map((t) =>
      generateEntity(
        "track",
        t.id,
        buildTrackPrompt(
          t,
          { ...ctx, capabilityIds, skillIds, behaviourIds },
          schemas.track,
        ),
        proseEngine,
      ).then((data) =>
        data ? { ...data, _id: t.id } : buildTrackFallback(t, capabilityIds),
      ),
    ),
  );

  // 9. Self-assessments (deterministic — no LLM)
  const selfAssessments = generateSelfAssessments(
    framework,
    skillIds,
    behaviourIds,
  );

  return {
    framework: fw,
    levels,
    stages,
    behaviours,
    capabilities,
    drivers,
    disciplines,
    tracks,
    selfAssessments,
  };
}

/**
 * Generate a single entity via the prose engine.
 *
 * @param {string} entityType - Entity type for cache key prefix
 * @param {string} entityId - Entity ID for cache key
 * @param {{ system: string, user: string }} prompt - Built prompt
 * @param {import('./prose.js').ProseEngine} proseEngine - Prose engine
 * @returns {Promise<object|null>} Parsed JSON data
 */
async function generateEntity(entityType, entityId, prompt, proseEngine) {
  const key = `pathway:${entityType}:${entityId}`;
  const result = await proseEngine.generateJson(key, [
    { role: "system", content: prompt.system },
    { role: "user", content: prompt.user },
  ]);
  return result;
}

/**
 * Simple seeded PRNG (mulberry32). Deterministic given the same seed.
 * @param {number} seed
 * @returns {() => number} Returns values in [0, 1)
 */
function createRng(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pick a random index near a base, weighted toward ±1 with rare ±2 outliers.
 * @param {() => number} rng - Seeded random function
 * @param {number} base - Centre index for this level
 * @param {number} max - Maximum valid index (inclusive)
 * @returns {number} Clamped index
 */
function jitter(rng, base, max) {
  const r = rng();
  // 50% same, 20% +1, 15% -1, 10% +2, 5% -2
  let offset = 0;
  if (r < 0.5) offset = 0;
  else if (r < 0.7) offset = 1;
  else if (r < 0.85) offset = -1;
  else if (r < 0.95) offset = 2;
  else offset = -2;
  return Math.max(0, Math.min(max, base + offset));
}

/**
 * Generate self-assessments with realistic randomized distributions.
 *
 * Each assessment centres skills around the expected proficiency for
 * that level, then applies per-skill jitter so profiles look natural:
 * most skills cluster near the base, with occasional outliers.
 * Behaviours use tighter jitter (±1 only, less variance).
 *
 * @param {object} framework - Framework AST
 * @param {string[]} skillIds - All skill IDs from capabilities
 * @param {string[]} behaviourIds - All behaviour IDs
 * @returns {object[]}
 */
function generateSelfAssessments(framework, skillIds, behaviourIds) {
  const proficiencies = framework.proficiencies || [
    "awareness",
    "foundational",
    "working",
    "practitioner",
    "expert",
  ];
  const maturities = framework.maturities || [
    "emerging",
    "developing",
    "practicing",
    "role_modeling",
    "exemplifying",
  ];

  const seed = framework.seed || 1;
  const rng = createRng(seed);
  const maxP = proficiencies.length - 1;
  const maxM = maturities.length - 1;

  const assessments = [];
  const levelNames = ["junior", "mid", "senior", "staff", "principal"];

  for (let i = 0; i < Math.min(levelNames.length, proficiencies.length); i++) {
    const skillProficiencies = {};
    for (const skillId of skillIds) {
      skillProficiencies[skillId] = proficiencies[jitter(rng, i, maxP)];
    }

    const behaviourMaturities = {};
    for (const behaviourId of behaviourIds) {
      // Behaviours use tighter variance: ±1 only (no ±2 outliers)
      const r = rng();
      let offset = 0;
      if (r < 0.55) offset = 0;
      else if (r < 0.8) offset = 1;
      else offset = -1;
      behaviourMaturities[behaviourId] =
        maturities[Math.max(0, Math.min(maxM, i + offset))];
    }

    assessments.push({
      id: `example_${levelNames[i]}`,
      skillProficiencies,
      behaviourMaturities,
    });
  }

  return assessments;
}

/**
 * Build framework metadata deterministically from DSL data.
 * @param {object} framework - Framework AST from DSL parser
 * @param {string} domain - Universe domain
 * @returns {object} Schema-compliant framework object
 */
function buildFrameworkFallback(framework, domain) {
  return {
    title: `${domain} Engineering Pathway`,
    emojiIcon: "🚀",
  };
}

/**
 * Build a single behaviour deterministically from DSL data.
 * @param {object} dslBehaviour - Behaviour from DSL (id, name)
 * @returns {object} Schema-compliant behaviour with _id
 */
function buildBehaviourFallback(dslBehaviour) {
  const maturities = [
    "emerging",
    "developing",
    "practicing",
    "role_modeling",
    "exemplifying",
  ];
  const maturityDescriptions = {};
  for (const m of maturities) {
    maturityDescriptions[m] = `${m} level of ${dslBehaviour.name}`;
  }
  return {
    _id: dslBehaviour.id,
    name: dslBehaviour.name,
    human: {
      description: dslBehaviour.name,
      maturityDescriptions,
    },
  };
}

/**
 * Build a single capability with skills deterministically from DSL data.
 * @param {object} dslCapability - Capability from DSL (id, name, skills)
 * @param {number} ordinalRank - 1-based rank
 * @param {string[]} proficiencies - Proficiency scale
 * @returns {object} Schema-compliant capability with _id
 */
function buildCapabilityFallback(dslCapability, ordinalRank, proficiencies) {
  const profs = proficiencies || [
    "awareness",
    "foundational",
    "working",
    "practitioner",
    "expert",
  ];
  const skills = (dslCapability.skills || []).map((skillId) => {
    const name = skillId
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    const proficiencyDescriptions = {};
    for (const p of profs) {
      proficiencyDescriptions[p] = `${p} level of ${name}`;
    }
    return {
      id: skillId,
      name,
      human: {
        description: name,
        proficiencyDescriptions,
      },
    };
  });
  const responsibilities = {};
  for (const p of profs) {
    responsibilities[p] = `${p}-level responsibilities`;
  }
  return {
    _id: dslCapability.id,
    name: dslCapability.name,
    ordinalRank,
    skills,
    professionalResponsibilities: responsibilities,
    managementResponsibilities: responsibilities,
  };
}

/**
 * Build a single discipline deterministically from DSL data.
 * @param {object} dslDiscipline - Discipline from DSL
 * @param {string[]} _skillIds - All skill IDs
 * @param {string[]} _trackIds - All track IDs
 * @returns {object} Schema-compliant discipline with _id
 */
function buildDisciplineFallback(dslDiscipline, _skillIds, _trackIds) {
  return {
    _id: dslDiscipline.id,
    specialization: dslDiscipline.specialization || dslDiscipline.id,
    roleTitle: dslDiscipline.roleTitle || dslDiscipline.id,
    isProfessional: dslDiscipline.isProfessional !== false,
    isManagement: dslDiscipline.isProfessional === false,
    coreSkills: dslDiscipline.core || [],
    supportingSkills: dslDiscipline.supporting || [],
    broadSkills: dslDiscipline.broad || [],
    validTracks: dslDiscipline.validTracks || [null],
  };
}

/**
 * Build a single track deterministically from DSL data.
 * @param {object} dslTrack - Track from DSL (id, name)
 * @param {string[]} capabilityIds - All capability IDs
 * @returns {object} Schema-compliant track with _id
 */
function buildTrackFallback(dslTrack, capabilityIds) {
  const skillModifiers = {};
  for (const capId of capabilityIds) {
    skillModifiers[capId] = 0;
  }
  return {
    _id: dslTrack.id,
    name: dslTrack.name || dslTrack.id,
    skillModifiers,
  };
}

/**
 * Build levels array deterministically from DSL framework data.
 * Used as fallback when prose engine returns null (no-prose mode).
 *
 * @param {object[]} dslLevels - Levels from DSL parser (id, title, rank, experience)
 * @param {string[]} proficiencies - Proficiency scale from DSL
 * @returns {object[]} Schema-compliant levels array
 */
function buildLevelsFallback(dslLevels, proficiencies) {
  const profs = proficiencies || [
    "awareness",
    "foundational",
    "working",
    "practitioner",
    "expert",
  ];
  const maturities = [
    "emerging",
    "developing",
    "practicing",
    "role_modeling",
    "exemplifying",
  ];

  return dslLevels.map((level, i) => {
    const profIdx = Math.min(i, profs.length - 1);
    const matIdx = Math.min(i, maturities.length - 1);
    const secondaryIdx = Math.max(0, profIdx - 1);
    const broadIdx = Math.max(0, profIdx - 2);

    const profTitle = level.professionalTitle || `Level ${i + 1}`;
    return {
      id: level.id,
      professionalTitle: profTitle,
      managementTitle:
        level.managementTitle || profTitle.replace("Engineer", "Manager"),
      typicalExperienceRange: level.experience || "",
      ordinalRank: level.rank || i + 1,
      baseSkillProficiencies: {
        primary: profs[profIdx],
        secondary: profs[secondaryIdx],
        broad: profs[broadIdx],
      },
      baseBehaviourMaturity: maturities[matIdx],
    };
  });
}

/**
 * Build stages array deterministically from DSL stage IDs.
 * Used as fallback when prose engine returns null (no-prose mode).
 *
 * @param {string[]} dslStages - Stage ID strings from DSL (e.g. ["specify", "plan", ...])
 * @returns {object[]} Schema-compliant stages array
 */
function buildStagesFallback(dslStages) {
  const nameMap = {
    specify: "Specify",
    plan: "Plan",
    onboard: "Onboard",
    code: "Code",
    review: "Review",
    deploy: "Deploy",
  };

  return dslStages.map((id) => ({
    id,
    name: nameMap[id] || id.charAt(0).toUpperCase() + id.slice(1),
  }));
}

/**
 * Build drivers array deterministically from DSL driver definitions.
 * Used as fallback when prose engine returns null (no-prose mode).
 *
 * @param {object[]} dslDrivers - Drivers from DSL parser (id, name, skills, behaviours)
 * @returns {object[]} Schema-compliant drivers array
 */
function buildDriversFallback(dslDrivers) {
  return dslDrivers.map((driver) => ({
    id: driver.id,
    name: driver.name,
    contributingSkills: driver.skills || [],
    contributingBehaviours: driver.behaviours || [],
  }));
}
