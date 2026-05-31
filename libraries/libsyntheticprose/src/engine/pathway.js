/**
 * Pathway Engine — orchestrates LLM calls to generate pathway entity data.
 *
 * Generates entities in dependency order:
 * standard → levels → behaviours → capabilities →
 * drivers → disciplines → tracks → self-assessments
 *
 * @module libterrain/engine/pathway
 */

import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { join } from "path";
import { buildStandardPrompt } from "../prompts/pathway/standard.js";
import { buildLevelPrompt } from "../prompts/pathway/level.js";
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
 * @param {object} [runtime] - Runtime collaborator bag (default: createDefaultRuntime())
 * @returns {object} schemas keyed by entity type
 */
export function loadSchemas(schemaDir, runtime = createDefaultRuntime()) {
  const { fsSync } = runtime;
  const names = [
    "standard",
    "levels",
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
      fsSync.readFileSync(join(schemaDir, `${name}.schema.json`), "utf-8"),
    );
  }
  return schemas;
}

/**
 * PathwayGenerator orchestrates LLM calls to generate pathway entity data.
 */
export class PathwayGenerator {
  /**
   * @param {import('./generator.js').ProseGenerator} proseGenerator - Prose generator for LLM calls
   * @param {object} logger - Logger instance
   */
  constructor(proseGenerator, logger) {
    if (!proseGenerator) throw new Error("proseGenerator is required");
    if (!logger) throw new Error("logger is required");
    this.proseGenerator = proseGenerator;
    this.logger = logger;
  }

  /**
   * Generate all pathway entity data via LLM calls in dependency order.
   * @param {object} options
   * @param {object} options.standard - Standard AST from DSL parser
   * @param {string} options.domain - Universe domain
   * @param {string} options.industry - Universe industry
   * @param {object} options.schemas - Loaded JSON schemas
   * @returns {Promise<object>} Generated pathway data keyed by entity type
   */
  async generate({ standard, domain, industry, schemas }) {
    return generatePathwayData({
      standard,
      domain,
      industry,
      schemas,
      proseGenerator: this.proseGenerator,
      logger: this.logger,
    });
  }
}

/**
 * Generate all pathway entity data via LLM calls in dependency order.
 *
 * @param {object} options
 * @param {object} options.standard - Standard AST from DSL parser
 * @param {string} options.domain - Universe domain
 * @param {string} options.industry - Universe industry
 * @param {object} options.schemas - Loaded JSON schemas
 * @param {import('./generator.js').ProseGenerator} options.proseGenerator - Prose generator for LLM calls
 * @param {object} options.logger - Logger instance
 * @returns {Promise<object>} Generated pathway data keyed by entity type
 */
async function generatePathwayData({
  standard,
  domain,
  industry,
  schemas,
  proseGenerator,
  logger,
}) {
  const standardName = standard.name || domain;
  const ctx = { domain, industry, standardName };
  const BASE_TOKENS = 3000;
  const PER_SKILL_TOKENS = 1500;
  const log = logger;

  // 1. Standard metadata
  log.info("pathway", "Generating standard metadata");
  const standardMetadata = await generateEntity(
    "standard",
    "standard",
    buildStandardPrompt(standard, ctx, schemas.standard),
    proseGenerator,
    { maxTokens: BASE_TOKENS },
  );

  // 2. Levels
  log.info("pathway", "Generating levels");
  const levels = await generateEntity(
    "levels",
    "levels",
    buildLevelPrompt(standard.levels, ctx, schemas.levels),
    proseGenerator,
  );

  // Build prior output context for downstream prompts
  const priorOutput = { levels };

  // 4. Behaviours (parallel — receive level context)
  log.info("pathway", `Generating ${standard.behaviours.length} behaviours`);
  const behaviours = await Promise.all(
    standard.behaviours.map((b) =>
      generateEntity(
        "behaviour",
        b.id,
        buildBehaviourPrompt(b, ctx, schemas.behaviour, priorOutput),
        proseGenerator,
      ).then((data) => (data ? { ...data, _id: b.id } : null)),
    ),
  );

  priorOutput.behaviours = behaviours;

  // 5. Capabilities with skills (parallel — receive level + behaviour context)
  log.info(
    "pathway",
    `Generating ${standard.capabilities.length} capabilities with skills`,
  );
  const capabilities = await Promise.all(
    standard.capabilities.map((c, i) =>
      generateEntity(
        "capability",
        c.id,
        buildCapabilityPrompt(
          { ...c, ordinalRank: i + 1 },
          ctx,
          schemas.capability,
          priorOutput,
        ),
        proseGenerator,
        { maxTokens: BASE_TOKENS + (c.skills || []).length * PER_SKILL_TOKENS },
      ).then((data) => (data ? { ...data, _id: c.id } : null)),
    ),
  );

  priorOutput.capabilities = capabilities;

  // Collect all skill IDs and behaviour IDs from DSL declarations
  // (not from LLM output — these must be available even in no-prose mode)
  const skillIds = standard.capabilities.flatMap((c) => c.skills || []);
  const behaviourIds = standard.behaviours.map((b) => b.id);

  // 6. Drivers (reference skills + behaviours)
  log.info("pathway", "Generating drivers");
  const drivers = await generateEntity(
    "drivers",
    "drivers",
    buildDriverPrompt(
      standard.drivers,
      { ...ctx, skillIds, behaviourIds },
      schemas.drivers,
    ),
    proseGenerator,
    { maxTokens: BASE_TOKENS },
  );

  // 7. Disciplines (reference skills, behaviours, track IDs from DSL)
  const trackIds = standard.tracks.map((t) => t.id);
  log.info("pathway", `Generating ${standard.disciplines.length} disciplines`);
  const disciplines = await Promise.all(
    standard.disciplines.map((d) =>
      generateEntity(
        "discipline",
        d.id,
        buildDisciplinePrompt(
          d,
          { ...ctx, skillIds, behaviourIds, trackIds },
          schemas.discipline,
          priorOutput,
        ),
        proseGenerator,
      ).then((data) => (data ? { ...data, _id: d.id } : null)),
    ),
  );

  // 8. Tracks (reference capability IDs for skillModifiers)
  const capabilityIds = standard.capabilities.map((c) => c.id);
  log.info("pathway", `Generating ${standard.tracks.length} tracks`);
  const tracks = await Promise.all(
    standard.tracks.map((t) =>
      generateEntity(
        "track",
        t.id,
        buildTrackPrompt(
          t,
          { ...ctx, capabilityIds, skillIds, behaviourIds },
          schemas.track,
          priorOutput,
        ),
        proseGenerator,
      ).then((data) => (data ? { ...data, _id: t.id } : null)),
    ),
  );

  // 9. Self-assessments (deterministic — no LLM)
  const selfAssessments = generateSelfAssessments(
    standard,
    skillIds,
    behaviourIds,
  );

  return {
    standard: standardMetadata,
    levels,
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
 * @param {import('./generator.js').ProseGenerator} proseGenerator - Prose generator
 * @returns {Promise<object|null>} Parsed JSON data, or null on miss
 */
async function generateEntity(
  entityType,
  entityId,
  prompt,
  proseGenerator,
  { maxTokens } = {},
) {
  const key = `pathway:${entityType}:${entityId}`;
  const result = await proseGenerator.generateJson(
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
 * Generate skill proficiency map for a single level, enforcing monotonicity.
 * @param {() => number} rng - Seeded random function
 * @param {number} levelIdx - Current level index (base for jitter)
 * @param {string[]} skillIds - All skill IDs
 * @param {string[]} proficiencies - Ordered proficiency labels
 * @param {object} prevSkillIdx - Mutable map tracking previous indices per skill
 * @returns {object} Skill ID to proficiency label
 */
function buildSkillProficiencies(
  rng,
  levelIdx,
  skillIds,
  proficiencies,
  prevSkillIdx,
) {
  const maxP = proficiencies.length - 1;
  const result = {};
  for (const skillId of skillIds) {
    const raw = jitter(rng, levelIdx, maxP);
    const floor = prevSkillIdx[skillId] ?? 0;
    const idx = Math.max(floor, raw);
    result[skillId] = proficiencies[idx];
    prevSkillIdx[skillId] = idx;
  }
  return result;
}

/**
 * Generate behaviour maturity map for a single level, enforcing monotonicity.
 * Behaviours use tighter variance: +/-1 only (no +/-2 outliers).
 * @param {() => number} rng - Seeded random function
 * @param {number} levelIdx - Current level index
 * @param {string[]} behaviourIds - All behaviour IDs
 * @param {string[]} maturities - Ordered maturity labels
 * @param {object} prevBehIdx - Mutable map tracking previous indices per behaviour
 * @returns {object} Behaviour ID to maturity label
 */
function buildBehaviourMaturities(
  rng,
  levelIdx,
  behaviourIds,
  maturities,
  prevBehIdx,
) {
  const maxM = maturities.length - 1;
  const result = {};
  for (const behaviourId of behaviourIds) {
    const r = rng();
    let offset;
    if (r < 0.55) offset = 0;
    else if (r < 0.8) offset = 1;
    else offset = -1;
    const raw = Math.max(0, Math.min(maxM, levelIdx + offset));
    const floor = prevBehIdx[behaviourId] ?? 0;
    const idx = Math.max(floor, raw);
    result[behaviourId] = maturities[idx];
    prevBehIdx[behaviourId] = idx;
  }
  return result;
}

/**
 * Generate self-assessments with realistic randomized distributions.
 *
 * Each assessment centres skills around the expected proficiency for
 * that level, then applies per-skill jitter so profiles look natural:
 * most skills cluster near the base, with occasional outliers.
 * Behaviours use tighter jitter (±1 only, less variance).
 *
 * @param {object} standard - Standard AST
 * @param {string[]} skillIds - All skill IDs from capabilities
 * @param {string[]} behaviourIds - All behaviour IDs
 * @returns {object[]}
 */
function generateSelfAssessments(standard, skillIds, behaviourIds) {
  const proficiencies = standard.proficiencies || PROFICIENCY_LEVELS;
  const maturities = standard.maturities || MATURITY_LEVELS;

  const seed = standard.seed || 1;
  const rng = createRng(seed);

  const levelNames = ["junior", "mid", "senior", "staff", "principal"];
  const prevSkillIdx = {};
  const prevBehIdx = {};

  const assessments = [];
  for (let i = 0; i < Math.min(levelNames.length, proficiencies.length); i++) {
    assessments.push({
      id: `example_${levelNames[i]}`,
      skillProficiencies: buildSkillProficiencies(
        rng,
        i,
        skillIds,
        proficiencies,
        prevSkillIdx,
      ),
      behaviourMaturities: buildBehaviourMaturities(
        rng,
        i,
        behaviourIds,
        maturities,
        prevBehIdx,
      ),
    });
  }

  return assessments;
}
