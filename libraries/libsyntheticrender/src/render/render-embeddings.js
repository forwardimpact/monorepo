/**
 * Embeddings JSONL renderer for clinical entities.
 *
 * Walks `outputConfig.entities`, concatenates fields listed in
 * `outputConfig.text_fields`, and emits one JSONL line per entity with
 * `{ id, table, text }`. Synthetic fields (`prose_*`) resolve against
 * the prose cache; missing entries are silently omitted.
 *
 * @module libsyntheticrender/render/render-embeddings
 */

const SYNTHETIC_FIELDS = {
  "prose-explainer": (id) => `clinical_condition_explainer_${id}`,
  "prose-description": (id) => `clinical_consent_summary_${id}`,
};

/**
 * @param {object} clinicalEntities - `entities.clinical`
 * @param {Map<string, string>|object} proseCache - key → prose text
 * @param {object} outputConfig - `{ path, entities, text_fields }`
 * @returns {Map<string, string>} path → JSONL content
 */
export function renderEmbeddings(clinicalEntities, proseCache, outputConfig) {
  const cache = toCache(proseCache);
  const textFields = outputConfig.text_fields ?? {};
  const lines = [];

  for (const entityRef of outputConfig.entities ?? []) {
    const table = stripDomain(entityRef);
    const records = clinicalEntities[table] ?? [];
    const fields = textFields[entityRef] ?? [];

    for (const rec of records) {
      const text = buildText(rec, fields, cache);
      lines.push(JSON.stringify({ id: rec.id, table, text }));
    }
  }

  const content = lines.length === 0 ? "" : lines.join("\n") + "\n";
  return new Map([[outputConfig.path, content]]);
}

function buildText(rec, fields, cache) {
  const parts = [];
  for (const field of fields) {
    const value = readField(rec, field, cache);
    if (value !== null) parts.push(value);
  }
  return parts.join(" ");
}

function readField(rec, field, cache) {
  const synthetic = SYNTHETIC_FIELDS[field];
  if (synthetic) return cache.get(synthetic(rec.id)) ?? null;
  const v = rec[field];
  if (v === null || v === undefined) return null;
  return Array.isArray(v) ? v.join(" ") : String(v);
}

function toCache(cache) {
  if (cache instanceof Map) return cache;
  return new Map(Object.entries(cache ?? {}));
}

function stripDomain(entityRef) {
  const dot = entityRef.indexOf(".");
  return dot === -1 ? entityRef : entityRef.slice(dot + 1);
}
