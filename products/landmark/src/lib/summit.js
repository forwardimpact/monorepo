/**
 * Summit growth alignment wrapper.
 *
 * Wraps Summit's computeGrowthAlignment with dynamic import for
 * optional runtime. Node caches dynamic import() results at the module
 * level, so no manual cache is needed.
 *
 * Production code uses the `summitFn` injection point on runHealthCommand
 * for DI. This module's computeGrowth is the default wiring; summit.test.js
 * tests it in isolation via __testOverride.
 */

/** Test-only override. Set to a {fn, GrowthContractError} object to bypass import(). */
let __testOverride = null;

/**
 * Test helper — inject a stub so summit.test.js can exercise computeGrowth
 * without touching node_modules. Pass null to clear.
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
 * Compute growth recommendations via Summit.
 *
 * @param {object} params - Passed through to computeGrowthAlignment.
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
