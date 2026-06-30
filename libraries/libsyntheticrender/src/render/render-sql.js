/**
 * Coordinated Supabase migration renderer for clinical entities.
 *
 * Emits a numbered set of SQL files containing dependency-ordered
 * `CREATE TABLE` + `INSERT` statements, junction tables for array
 * cross-references, RLS policies, and an optional pgvector embeddings
 * table — loadable via `supabase db push`.
 *
 * @module libsyntheticrender/render/render-sql
 */

const TABLE_SPEC = [
  {
    key: "conditions",
    table: "conditions",
    pk: "id",
    skip: new Set(["trials", "iri"]),
  },
  {
    key: "sites",
    table: "sites",
    pk: "id",
    skip: new Set(["org", "trials", "iri"]),
  },
  {
    key: "researchers",
    table: "researchers",
    pk: "id",
    skip: new Set(["iri"]),
  },
  {
    key: "trials",
    table: "trials",
    pk: "id",
    skip: new Set([
      "conditions",
      "sites",
      "principal_investigator",
      "project",
      "criteria",
      "iri",
    ]),
    extraColumns: [
      {
        name: "principal_investigator_id",
        type: "text",
        value: (t) => t.principal_investigator?.person?.id ?? null,
      },
      {
        name: "project_id",
        type: "text",
        value: (t) => t.project?.id ?? null,
      },
    ],
    foreignKeys: [
      { column: "principal_investigator_id", references: "researchers(id)" },
    ],
  },
  {
    key: "criteria",
    table: "criteria",
    pk: "trial_id",
    skip: new Set(["iri"]),
    foreignKeys: [{ column: "trial_id", references: "trials(id)" }],
  },
];

const JUNCTIONS = [
  {
    table: "trial_sites",
    sourceKey: "trials",
    arrayField: "sites",
    leftColumn: "trial_id",
    rightColumn: "site_id",
    leftRef: "trials(id)",
    rightRef: "sites(id)",
  },
  {
    table: "trial_conditions",
    sourceKey: "trials",
    arrayField: "conditions",
    leftColumn: "trial_id",
    rightColumn: "condition_id",
    leftRef: "trials(id)",
    rightRef: "conditions(id)",
  },
];

// Patient-facing prose tables. Each is one text column keyed off a base entity
// plus its foreign key, except `patient_stories` which fans out to several
// rows per condition. `rows(clinical, cache)` resolves the prose text from the
// cache under the exact logical keys the generator emits (see
// libsyntheticgen clinicalProseKeys), so ids line up with cache entries.
const PROSE_TABLE_SPEC = [
  {
    key: "condition_explainers",
    table: "condition_explainers",
    pk: "condition_id",
    foreignKeys: [{ column: "condition_id", references: "conditions(id)" }],
    rows: (c, cache) =>
      (c.conditions ?? []).map((x) => ({
        condition_id: x.id,
        explainer: cache.get(`clinical_condition_explainer_${x.id}`) ?? null,
      })),
  },
  {
    key: "trial_faqs",
    table: "trial_faqs",
    pk: "trial_id",
    foreignKeys: [{ column: "trial_id", references: "trials(id)" }],
    rows: (c, cache) =>
      (c.trials ?? []).map((x) => ({
        trial_id: x.id,
        faq: cache.get(`clinical_trial_faq_${x.id}`) ?? null,
      })),
  },
  {
    key: "consent_summaries",
    table: "consent_summaries",
    pk: "trial_id",
    foreignKeys: [{ column: "trial_id", references: "trials(id)" }],
    rows: (c, cache) =>
      (c.trials ?? []).map((x) => ({
        trial_id: x.id,
        summary: cache.get(`clinical_consent_summary_${x.id}`) ?? null,
      })),
  },
  {
    key: "site_descriptions",
    table: "site_descriptions",
    pk: "site_id",
    foreignKeys: [{ column: "site_id", references: "sites(id)" }],
    rows: (c, cache) =>
      (c.sites ?? []).map((x) => ({
        site_id: x.id,
        description: cache.get(`clinical_site_description_${x.id}`) ?? null,
      })),
  },
  {
    key: "patient_stories",
    table: "patient_stories",
    pk: "id",
    foreignKeys: [{ column: "condition_id", references: "conditions(id)" }],
    rows: (c, cache) => patientStoryRows(c, cache),
  },
  {
    key: "therapy_descriptions",
    table: "therapy_descriptions",
    pk: "topic",
    rows: (c, cache) =>
      (c.content?.therapy_topics ?? []).map((topic) => ({
        topic,
        description: cache.get(`clinical_therapy_description_${topic}`) ?? null,
      })),
  },
];

/**
 * Render coordinated Supabase migration files for a clinical entity graph.
 *
 * @param {object} clinicalEntities - `entities.clinical` from the generator
 * @param {object} outputConfig - `{ path, prefix, entities, include_embeddings }`.
 *   `path`, when present, prefixes every emitted filename (directory layout).
 * @param {Map<string, string>|object} [prose] - resolved prose cache keyed by
 *   logical key; supplies the text columns of the patient-facing prose tables.
 * @returns {Map<string, string>} path → file content
 */
export function renderSql(clinicalEntities, outputConfig, prose) {
  const prefix = outputConfig.prefix ?? "clinical";
  const dir = normalizeDir(outputConfig.path);
  const cache = toCache(prose);
  const requested = new Set(
    (outputConfig.entities ?? []).map((e) => stripDomain(e)),
  );

  const includedSpecs = TABLE_SPEC.filter((s) => requested.has(s.key));
  const includedKeys = new Set(includedSpecs.map((s) => s.key));
  const includedJunctions = JUNCTIONS.filter(
    (j) => includedKeys.has(j.sourceKey) && includedKeys.has(j.arrayField),
  );
  const includedProseSpecs = PROSE_TABLE_SPEC.filter((s) =>
    requested.has(s.key),
  );

  const files = new Map();
  let index = 0;
  const next = () => String(++index).padStart(3, "0");
  const filePath = (basename) => `${dir}${basename}`;

  for (const spec of includedSpecs) {
    const records = clinicalEntities[spec.key] ?? [];
    files.set(
      filePath(`${prefix}_${next()}_${spec.table}.sql`),
      renderEntityTable(spec, records),
    );
  }

  for (const j of includedJunctions) {
    const records = clinicalEntities[j.sourceKey] ?? [];
    files.set(
      filePath(`${prefix}_${next()}_${j.table}.sql`),
      renderJunctionTable(j, records),
    );
  }

  // Prose tables reference conditions/trials/sites, so they render after the
  // base tables — the numbered filenames preserve that FK-apply order.
  for (const spec of includedProseSpecs) {
    files.set(
      filePath(`${prefix}_${next()}_${spec.table}.sql`),
      renderEntityTable(spec, spec.rows(clinicalEntities, cache)),
    );
  }

  const allTables = [
    ...includedSpecs.map((s) => s.table),
    ...includedJunctions.map((j) => j.table),
    ...includedProseSpecs.map((s) => s.table),
  ];
  files.set(filePath(`${prefix}_${next()}_rls.sql`), renderRls(allTables));

  if (outputConfig.include_embeddings) {
    files.set(
      filePath(`${prefix}_${next()}_condition_embeddings.sql`),
      renderEmbeddingsTable(),
    );
  }

  return files;
}

// Prose specs declare no skip set — their row objects carry only real columns.
const EMPTY_SKIP = new Set();

function normalizeDir(path) {
  if (!path) return "";
  return path.endsWith("/") ? path : `${path}/`;
}

function stripDomain(entityRef) {
  const dot = entityRef.indexOf(".");
  return dot === -1 ? entityRef : entityRef.slice(dot + 1);
}

function toCache(cache) {
  if (cache instanceof Map) return cache;
  return new Map(Object.entries(cache ?? {}));
}

/**
 * Reproduce the generator's patient-story distribution so each row's id matches
 * a prose cache key. For every condition listed in
 * `content.patient_story_conditions`, emit `perCondition` rows
 * (`ceil(patient_stories / conditions)`); conditions absent from the graph are
 * skipped exactly as `clinicalProseKeys` skips them, keeping ids and FKs valid.
 */
function patientStoryRows(clinical, cache) {
  const content = clinical.content;
  if (!content) return [];
  const storyConditions = content.patient_story_conditions ?? [];
  const total = content.patient_stories ?? 0;
  const perCondition = Math.ceil(total / Math.max(storyConditions.length, 1));
  const rows = [];
  for (const condId of storyConditions) {
    const cond = (clinical.conditions ?? []).find((c) => c.id === condId);
    if (!cond) continue;
    for (let i = 0; i < perCondition; i++) {
      rows.push({
        id: `${condId}_${i}`,
        condition_id: condId,
        story_index: i,
        story: cache.get(`clinical_patient_story_${condId}_${i}`) ?? null,
      });
    }
  }
  return rows;
}

function renderEntityTable(spec, records) {
  const columns = inferColumns(spec, records);
  const pk = spec.pk;
  const colDefs = columns.map((c) => {
    const parts = [`"${c.name}"`, c.type];
    if (c.name === pk) parts.push("PRIMARY KEY");
    return `  ${parts.join(" ")}`;
  });
  for (const fk of spec.foreignKeys ?? []) {
    colDefs.push(`  FOREIGN KEY ("${fk.column}") REFERENCES ${fk.references}`);
  }
  const create = `CREATE TABLE IF NOT EXISTS "${spec.table}" (\n${colDefs.join(",\n")}\n);\n`;

  if (records.length === 0) {
    return `${create}\n-- No records for ${spec.table}\n`;
  }

  const columnNames = columns.map((c) => `"${c.name}"`).join(", ");
  const rows = records.map((rec) => {
    const values = columns.map((c) => sqlLiteral(c.read(rec), c.type));
    return `(${values.join(", ")})`;
  });
  const insert = `INSERT INTO "${spec.table}" (${columnNames}) VALUES\n${rows.join(",\n")};\n`;

  return `${create}\n${insert}`;
}

function inferColumns(spec, records) {
  const direct = [];
  const seen = new Set();
  const skip = spec.skip ?? EMPTY_SKIP;
  for (const rec of records) {
    for (const key of Object.keys(rec)) {
      if (seen.has(key)) continue;
      if (skip.has(key)) continue;
      seen.add(key);
      direct.push({
        name: key,
        type: inferType(records, (r) => r[key]),
        read: (r) => r[key],
      });
    }
  }
  for (const extra of spec.extraColumns ?? []) {
    direct.push({
      name: extra.name,
      type: extra.type,
      read: extra.value,
    });
  }
  return direct;
}

function inferType(records, read) {
  for (const rec of records) {
    const v = read(rec);
    if (v === null || v === undefined) continue;
    return typeOfValue(v);
  }
  return "text";
}

const DATE_RE = /^\d{4}-\d{2}(-\d{2})?$/;

function typeOfValue(v) {
  if (typeof v === "boolean") return "boolean";
  if (typeof v === "number")
    return Number.isInteger(v) ? "integer" : "double precision";
  if (Array.isArray(v)) return arrayTypeOf(v);
  if (typeof v === "object") return "jsonb";
  if (typeof v === "string" && DATE_RE.test(v)) return "date";
  return "text";
}

function arrayTypeOf(arr) {
  const inner = arr.find((x) => x !== null && x !== undefined);
  return typeof inner === "number" ? "integer[]" : "text[]";
}

const SCALAR_LITERALS = {
  boolean: (v) => (v ? "TRUE" : "FALSE"),
  integer: (v) => String(v),
  "double precision": (v) => String(v),
  date: (v) => `'${v.length === 7 ? v + "-01" : v}'`,
  jsonb: (v) => `${dollarQuote(JSON.stringify(v))}::jsonb`,
};

function sqlLiteral(value, type) {
  if (value === null || value === undefined) return "NULL";
  const scalar = SCALAR_LITERALS[type];
  if (scalar) return scalar(value);
  if (type === "text[]" || type === "integer[]")
    return arrayLiteral(value, type);
  return dollarQuote(String(value));
}

function arrayLiteral(value, type) {
  if (!Array.isArray(value)) return "NULL";
  if (value.length === 0) return `ARRAY[]::${type}`;
  if (type === "integer[]") return `ARRAY[${value.join(", ")}]`;
  const items = value.map((s) => `'${String(s).replace(/'/g, "''")}'`);
  return `ARRAY[${items.join(", ")}]`;
}

function dollarQuote(s) {
  if (!s.includes("$$")) return `$$${s}$$`;
  let i = 0;
  while (s.includes(`$t${i}$`)) i++;
  return `$t${i}$${s}$t${i}$`;
}

function renderJunctionTable(j, sourceRecords) {
  const create = `CREATE TABLE IF NOT EXISTS "${j.table}" (
  "${j.leftColumn}" text NOT NULL REFERENCES ${j.leftRef},
  "${j.rightColumn}" text NOT NULL REFERENCES ${j.rightRef},
  PRIMARY KEY ("${j.leftColumn}", "${j.rightColumn}")
);
`;

  const rows = [];
  for (const rec of sourceRecords) {
    const left = rec.id;
    const arr = rec[j.arrayField] ?? [];
    for (const right of arr) {
      rows.push(
        `(${dollarQuote(String(left))}, ${dollarQuote(String(right))})`,
      );
    }
  }
  if (rows.length === 0) return `${create}\n-- No records for ${j.table}\n`;

  const insert = `INSERT INTO "${j.table}" ("${j.leftColumn}", "${j.rightColumn}") VALUES\n${rows.join(",\n")};\n`;
  return `${create}\n${insert}`;
}

function renderRls(tables) {
  const lines = ["-- Row level security: public read access\n"];
  for (const t of tables) {
    lines.push(`ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY;`);
    lines.push(
      `CREATE POLICY "public_read" ON "${t}" FOR SELECT USING (true);`,
    );
    lines.push("");
  }
  return lines.join("\n");
}

function renderEmbeddingsTable() {
  return `CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS "condition_embeddings" (
  "id" text PRIMARY KEY,
  "condition_id" text REFERENCES "conditions"(id),
  "embedding" vector(384)
);

ALTER TABLE "condition_embeddings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read" ON "condition_embeddings" FOR SELECT USING (true);
`;
}
