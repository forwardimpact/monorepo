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
import {
  PROFICIENCY_LEVELS,
  MATURITY_LEVELS,
} from "@forwardimpact/libsyntheticgen/vocabulary.js";

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
  const frameworkName = framework.name || domain;
  const ctx = { domain, industry, frameworkName };
  const BASE_TOKENS = 2000;
  const PER_SKILL_TOKENS = 800;

  // 1. Framework metadata
  const fw = await generateEntity(
    "framework",
    "framework",
    buildFrameworkPrompt(framework, ctx, schemas.framework),
    proseEngine,
    { maxTokens: BASE_TOKENS },
  );

  // 2. Levels
  const levels = await generateEntity(
    "levels",
    "levels",
    buildLevelPrompt(framework.levels, ctx, schemas.levels),
    proseEngine,
  );

  // 3. Stages
  const stages = await generateEntity(
    "stages",
    "stages",
    buildStagePrompt(framework.stages, ctx, schemas.stages),
    proseEngine,
    { maxTokens: BASE_TOKENS },
  );

  // Build prior output context for downstream prompts
  const priorOutput = { levels };

  // 4. Behaviours (parallel — receive level context)
  const behaviours = await Promise.all(
    framework.behaviours.map((b) =>
      generateEntity(
        "behaviour",
        b.id,
        buildBehaviourPrompt(b, ctx, schemas.behaviour, priorOutput),
        proseEngine,
      ).then((data) => (data ? { ...data, _id: b.id } : null)),
    ),
  );

  priorOutput.behaviours = behaviours;

  // 5. Capabilities with skills (parallel — receive level + behaviour context)
  const capabilities = await Promise.all(
    framework.capabilities.map((c, i) =>
      generateEntity(
        "capability",
        c.id,
        buildCapabilityPrompt(
          { ...c, ordinalRank: i + 1 },
          ctx,
          schemas.capability,
          priorOutput,
        ),
        proseEngine,
        { maxTokens: BASE_TOKENS + (c.skills || []).length * PER_SKILL_TOKENS },
      ).then((data) => (data ? { ...data, _id: c.id } : null)),
    ),
  );

  priorOutput.capabilities = capabilities;

  // Collect all skill IDs and behaviour IDs from DSL declarations
  // (not from LLM output — these must be available even in no-prose mode)
  const skillIds = framework.capabilities.flatMap((c) => c.skills || []);
  const behaviourIds = framework.behaviours.map((b) => b.id);

  // 6. Drivers (reference skills + behaviours)
  const drivers = await generateEntity(
    "drivers",
    "drivers",
    buildDriverPrompt(
      framework.drivers,
      { ...ctx, skillIds, behaviourIds },
      schemas.drivers,
    ),
    proseEngine,
    { maxTokens: BASE_TOKENS },
  );

  // 7. Disciplines (reference skills, behaviours, track IDs from DSL)
  const trackIds = framework.tracks.map((t) => t.id);
  const disciplines = await Promise.all(
    framework.disciplines.map((d) =>
      generateEntity(
        "discipline",
        d.id,
        buildDisciplinePrompt(
          d,
          { ...ctx, skillIds, behaviourIds, trackIds },
          schemas.discipline,
          priorOutput,
        ),
        proseEngine,
      ).then((data) => (data ? { ...data, _id: d.id } : null)),
    ),
  );

  // 8. Tracks (reference capability IDs for skillModifiers)
  const capabilityIds = framework.capabilities.map((c) => c.id);
  const tracks = await Promise.all(
    framework.tracks.map((t) =>
      generateEntity(
        "track",
        t.id,
        buildTrackPrompt(
          t,
          { ...ctx, capabilityIds, skillIds, behaviourIds },
          schemas.track,
          priorOutput,
        ),
        proseEngine,
      ).then((data) => (data ? { ...data, _id: t.id } : null)),
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
 * Returns null (not an empty object) on cache miss so callers can
 * distinguish missing data from valid empty data.
 *
 * @param {string} entityType - Entity type for cache key prefix
 * @param {string} entityId - Entity ID for cache key
 * @param {{ system: string, user: string }} prompt - Built prompt
 * @param {import('./prose.js').ProseEngine} proseEngine - Prose engine
 * @returns {Promise<object|null>} Parsed JSON data, or null on miss
 */
async function generateEntity(
  entityType,
  entityId,
  prompt,
  proseEngine,
  { maxTokens } = {},
) {
  const key = `pathway:${entityType}:${entityId}`;
  const result = await proseEngine.generateJson(
    key,
    [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ],
    maxTokens ? { maxTokens } : undefined,
  );
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
  let offset;
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
  const proficiencies = framework.proficiencies || PROFICIENCY_LEVELS;
  const maturities = framework.maturities || MATURITY_LEVELS;

  const seed = framework.seed || 1;
  const rng = createRng(seed);
  const maxP = proficiencies.length - 1;
  const maxM = maturities.length - 1;

  const assessments = [];
  const levelNames = ["junior", "mid", "senior", "staff", "principal"];

  // Track previous level's indices per skill/behaviour to enforce monotonicity
  const prevSkillIdx = {};
  const prevBehIdx = {};

  for (let i = 0; i < Math.min(levelNames.length, proficiencies.length); i++) {
    const skillProficiencies = {};
    for (const skillId of skillIds) {
      const raw = jitter(rng, i, maxP);
      const floor = prevSkillIdx[skillId] ?? 0;
      const idx = Math.max(floor, raw);
      skillProficiencies[skillId] = proficiencies[idx];
      prevSkillIdx[skillId] = idx;
    }

    const behaviourMaturities = {};
    for (const behaviourId of behaviourIds) {
      // Behaviours use tighter variance: ±1 only (no ±2 outliers)
      const r = rng();
      let offset;
      if (r < 0.55) offset = 0;
      else if (r < 0.8) offset = 1;
      else offset = -1;
      const raw = Math.max(0, Math.min(maxM, i + offset));
      const floor = prevBehIdx[behaviourId] ?? 0;
      const idx = Math.max(floor, raw);
      behaviourMaturities[behaviourId] = maturities[idx];
      prevBehIdx[behaviourId] = idx;
    }

    assessments.push({
      id: `example_${levelNames[i]}`,
      skillProficiencies,
      behaviourMaturities,
    });
  }

  return assessments;
}
