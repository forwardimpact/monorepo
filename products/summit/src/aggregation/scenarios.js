/**
 * Scenario parsing and validation for what-if simulations.
 *
 * Split out from what-if.js so tests can exercise the parser and the
 * mutator independently.
 */

import { parse as parseYaml } from "yaml";

import { UnknownJobFieldError } from "./errors.js";

export const ScenarioType = Object.freeze({
  ADD: "add",
  REMOVE: "remove",
  MOVE: "move",
  PROMOTE: "promote",
});

export class ScenarioError extends Error {
  constructor(message, code = "SUMMIT_SCENARIO_ERROR") {
    super(message);
    this.code = code;
  }
}

/**
 * @typedef {object} Scenario
 * @property {string} type
 * @property {string} [teamId]
 * @property {string} [projectId]
 * @property {object} [job]
 * @property {number} [allocation]
 * @property {string} [name]
 * @property {string} [toTeamId]
 * @property {string} [focus]
 */

/**
 * Parse CLI options into a normalized Scenario object.
 *
 * @param {object} options - Raw CLI options (already parsed by libcli).
 * @param {object} context
 * @param {string} [context.teamId]
 * @param {string} [context.projectId]
 * @returns {Scenario}
 */
export function parseScenario(options, context = {}) {
  const mutationFlags = ["add", "remove", "move", "promote"];
  const present = mutationFlags.filter((flag) => options[flag]);
  if (present.length === 0) {
    throw new ScenarioError(
      "summit: what-if requires exactly one of --add, --remove, --move, or --promote.",
    );
  }
  if (present.length > 1) {
    throw new ScenarioError(
      `summit: what-if accepts only one mutation flag at a time (got: ${present.join(", ")}).`,
    );
  }

  const type = present[0];
  const base = {
    type,
    teamId: context.teamId,
    projectId: context.projectId,
    focus: options.focus,
  };

  if (type === ScenarioType.ADD) {
    return {
      ...base,
      job: parseInlineJob(options.add),
      allocation: parseAllocation(options.allocation),
    };
  }
  if (type === ScenarioType.REMOVE) {
    return { ...base, name: options.remove };
  }
  if (type === ScenarioType.MOVE) {
    if (!options.to) {
      throw new ScenarioError(
        "summit: what-if --move requires --to <team> to specify the destination.",
      );
    }
    return { ...base, name: options.move, toTeamId: options.to };
  }
  if (type === ScenarioType.PROMOTE) {
    return { ...base, name: options.promote };
  }
  throw new ScenarioError(`summit: unsupported scenario type "${type}".`);
}

/**
 * Parse a flow-style YAML job expression. Used by both what-if and
 * (potentially) other callers that need to parse CLI job arguments.
 *
 * @param {string} input
 * @returns {{ discipline: string, level: string, track?: string }}
 */
export function parseJobExpression(input) {
  if (typeof input !== "string" || input.trim().length === 0) {
    throw new ScenarioError(
      'summit: --add requires a job expression like "{ discipline: software_engineering, level: J060 }".',
    );
  }
  let parsed;
  try {
    parsed = parseYaml(input);
  } catch (e) {
    throw new ScenarioError(
      `summit: invalid --add job expression (${e.message}).`,
      "SUMMIT_SCENARIO_PARSE",
    );
  }
  if (!parsed || typeof parsed !== "object") {
    throw new ScenarioError(
      "summit: --add job expression must be an object with discipline and level fields.",
    );
  }
  if (!parsed.discipline || typeof parsed.discipline !== "string") {
    throw new UnknownJobFieldError("discipline", parsed.discipline);
  }
  if (!parsed.level || typeof parsed.level !== "string") {
    throw new UnknownJobFieldError("level", parsed.level);
  }
  const job = { discipline: parsed.discipline, level: parsed.level };
  if (parsed.track) job.track = parsed.track;
  return job;
}

function parseInlineJob(input) {
  return parseJobExpression(input);
}

function parseAllocation(input) {
  if (input === undefined || input === null || input === "") return 1.0;
  const n = typeof input === "number" ? input : Number(input);
  if (!Number.isFinite(n) || n < 0) {
    throw new ScenarioError(
      `summit: --allocation must be a non-negative number (got "${input}").`,
    );
  }
  return n;
}
