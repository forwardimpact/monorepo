/**
 * Pure namespace-ownership classifier used by `bootstrapProject`.
 *
 * `mergeConfigFragment` enforces ownership at the **top-level key** but
 * surfaces diagnostics at the **leaf path** that disagrees so the caller can
 * pinpoint the conflict. `mergeEnvEntries` applies the same three rows at
 * bare-key granularity.
 */

function canonicalize(value) {
  if (value === undefined) {
    throw new Error("canonicalize: undefined not allowed");
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return JSON.stringify(value);
  }
  const sortedKeys = Object.keys(value).sort();
  const parts = sortedKeys.map(
    (k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`,
  );
  return `{${parts.join(",")}}`;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Recursively merge `fragment` into `existing`, recording per-leaf
 * conflicts at their dotted path. When both sides are plain objects with
 * disjoint sub-keys (no leaf disagrees), the result is the deep-merge of
 * the two subtrees — this is the cross-namespace-always-succeeds rule
 * applied one level deeper than the top-level. When a leaf disagrees
 * (or shapes mismatch), the conflict is recorded at that leaf path and
 * the existing value is preserved in the partial result (which the
 * orchestrator discards when conflicts is non-empty).
 */
function deepMergeOrConflict(existing, fragment, prefix, conflicts) {
  if (canonicalize(existing) === canonicalize(fragment)) return existing;
  if (isPlainObject(existing) && isPlainObject(fragment)) {
    const result = { ...existing };
    for (const [key, value] of Object.entries(fragment)) {
      const subPath = `${prefix}.${key}`;
      if (!(key in existing)) {
        result[key] = value;
        continue;
      }
      result[key] = deepMergeOrConflict(
        existing[key],
        value,
        subPath,
        conflicts,
      );
    }
    return result;
  }
  // At least one side is a scalar/array, or the two sides have different
  // shapes (object vs scalar) — record the conflict at this path.
  conflicts.push({ kind: "config", path: prefix });
  return existing;
}

/**
 * Classify a config fragment against the on-disk subtree.
 * @param {object} params
 * @param {object} [params.existing]   Current `config.json` contents (or `{}`).
 * @param {object} [params.fragment]   Caller's proposed contribution.
 * @param {string[]} [params.overwrites]  Top-level keys the caller has signed
 *   off to replace wholesale.
 * @returns {{ result: object, conflicts: {kind: "config", path: string}[] }}
 */
export function mergeConfigFragment({
  existing = {},
  fragment = {},
  overwrites = [],
} = {}) {
  const overwriteSet = new Set(overwrites);
  const conflicts = [];
  const result = { ...existing };
  for (const [topKey, subtree] of Object.entries(fragment)) {
    if (!(topKey in existing)) {
      result[topKey] = subtree;
      continue;
    }
    if (canonicalize(existing[topKey]) === canonicalize(subtree)) continue;
    if (overwriteSet.has(topKey)) {
      result[topKey] = subtree;
      continue;
    }
    result[topKey] = deepMergeOrConflict(
      existing[topKey],
      subtree,
      topKey,
      conflicts,
    );
  }
  return { result, conflicts };
}

/**
 * Classify `.env` entries at bare-key granularity. Value comparison is
 * byte-for-byte after `KEY=`.
 * @param {object} params
 * @param {Record<string,string>} [params.existing]
 * @param {Record<string,string>} [params.fragment]
 * @param {string[]} [params.overwrites]
 * @returns {{ result: Record<string,string>, conflicts: {kind: "env", path: string}[] }}
 */
export function mergeEnvEntries({
  existing = {},
  fragment = {},
  overwrites = [],
} = {}) {
  const overwriteSet = new Set(overwrites);
  const conflicts = [];
  const result = { ...existing };
  for (const [key, value] of Object.entries(fragment)) {
    if (!(key in existing)) {
      result[key] = value;
      continue;
    }
    if (existing[key] === value) continue;
    if (overwriteSet.has(key)) {
      result[key] = value;
      continue;
    }
    conflicts.push({ kind: "env", path: key });
  }
  return { result, conflicts };
}
