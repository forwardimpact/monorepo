/**
 * Tier 0 — Deterministic Entity & Activity Generation (no LLM).
 *
 * @module libterrain/engine/tier0
 */

import { createSeededRNG } from "./rng.js";
import { buildEntities } from "./entities.js";
import { buildClinicalEntities } from "./clinical-entities.js";
import { generateActivity } from "./activity.js";

/**
 * Entity generator that wraps deterministic generation from a parsed AST.
 */
export class EntityGenerator {
  /**
   * @param {Function} rngFactory - Factory function that creates a seeded RNG
   * @param {object} logger - Logger instance
   */
  constructor(rngFactory, logger) {
    if (!rngFactory) throw new Error("rngFactory is required");
    if (!logger) throw new Error("logger is required");
    this.rngFactory = rngFactory;
    this.logger = logger;
  }

  /**
   * Generate all entities and activity from a parsed AST.
   * @param {import('../dsl/parser.js').TerrainAST} ast
   * @returns {object} Entity graph with activity data
   */
  generate(ast) {
    const rng = this.rngFactory(ast.seed);
    const { orgs, departments, teams, people, projects } = buildEntities(
      ast,
      rng,
      this.logger,
    );
    const activity = generateActivity(ast, rng, people, teams);

    const clinical = ast.clinical
      ? buildClinicalEntities(ast.clinical, people, orgs, projects, ast.domain, rng)
      : null;

    return {
      orgs,
      departments,
      teams,
      people,
      projects,
      scenarios: ast.scenarios,
      snapshots: ast.snapshots,
      standard: { ...ast.standard, seed: ast.seed },
      content: ast.content,
      activity,
      clinical,
      domain: ast.domain,
      industry: ast.industry,
    };
  }
}

/**
 * Creates an EntityGenerator with the built-in seeded RNG factory.
 * @param {object} logger - Logger instance
 * @returns {EntityGenerator}
 */
export function createEntityGenerator(logger) {
  return new EntityGenerator(createSeededRNG, logger);
}
