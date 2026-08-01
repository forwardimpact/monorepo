/**
 * Wrapper for Summit growth alignment.
 *
 * This module wraps Summit's computeGrowthAlignment with a dynamic import
 * for an optional runtime. Node caches dynamic import() results at the
 * module level. This module needs no manual cache.
 *
 * Production code uses the `summitFn` injection point on runHealthCommand
 * for DI. This module's computeGrowth is the default. summit.test.js tests
 * it in isolation through __testOverride.
 */

/** Test-only override. Set to a {fn, GrowthContractError} object to bypass import(). */
let __testOverride = null;

/**
 * Test helper — inject a stub for summit.test.js. The test then exercises
 * computeGrowth and never reads node_modules. Pass null to clear.
 */
export function __setSummitForTests(override) {
  __testOverride = override ?? null;
}

async function loadSummit() {
  if (__testOverride) return __testOverride;
  try {
    const mod = await import("@forwardimpact/summit");
    return {
      fn: mod?.computeGrowthAlignment ?? null,
      GrowthContractError: mod?.GrowthContractError ?? null,
    };
  } catch {
    return { fn: null, GrowthContractError: null };
  }
}

/**
 * Compute growth recommendations through Summit.
 *
 * @param {object} params - This function passes it to computeGrowthAlignment.
 * @returns {Promise<{available: boolean, recommendations: Array, warnings: string[]}>}
 */
export async function computeGrowth(params) {
  const { fn, GrowthContractError } = await loadSummit();
  if (!fn) {
    return { available: false, recommendations: [], warnings: [] };
  }
  try {
    const recommendations = fn(params);
    return { available: true, recommendations, warnings: [] };
  } catch (err) {
    if (GrowthContractError && err instanceof GrowthContractError) {
      return {
        available: true,
        recommendations: [],
        warnings: [
          `Summit growth alignment skipped: ${err.message} (code: ${err.code ?? "unknown"})`,
        ],
      };
    }
    return {
      available: true,
      recommendations: [],
      warnings: [`Summit growth computation failed: ${err.message}`],
    };
  }
}
