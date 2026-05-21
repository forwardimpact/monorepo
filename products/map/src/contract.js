/**
 * Render-gate primitives for the level field contract.
 *
 * Browser-safe: this module must not import `fs/promises`, `path`, or any
 * other Node-only module. The pathway browser bundles
 * (main.js / slide-main.js / handout-main.js) consume `throwIfErrors`.
 */

import { CONTRACT_URL } from "./validation/level.js";

/**
 * Error thrown when loaded data violates a level field contract.
 */
export class ContractViolationError extends Error {
  /**
   * @param {{field: string, value: any, reason: string}} info
   */
  constructor({ field, value, reason }) {
    super(`Contract violation at ${field}: ${reason}`);
    this.name = "ContractViolationError";
    this.field = field;
    this.value = value;
    this.reason = reason;
    this.contractUrl = CONTRACT_URL;
  }
}

/**
 * Throw a ContractViolationError for the first matching validation error.
 * @param {{errors: Array}} result
 * @param {{ruleCodes: string[], paths: RegExp[]}} filter
 */
export function throwIfErrors(result, filter) {
  if (!result || !result.errors || result.errors.length === 0) return;
  const { ruleCodes, paths } = filter;
  const match = result.errors.find(
    (err) =>
      ruleCodes.includes(err.type) &&
      paths.some((rx) => rx.test(err.path || "")),
  );
  if (!match) return;
  throw new ContractViolationError({
    field: match.path,
    value: match.value,
    reason: match.message,
  });
}
