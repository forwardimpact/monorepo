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

/**
 * Render coordinated Supabase migration files for a clinical entity graph.
 *
 * @param {object} clinicalEntities - `entities.clinical` from the generator
 * @param {object} outputConfig - `{ path, prefix, entities, include_embeddings }`.
 *   `path`, when present, prefixes every emitted filename (directory layout).
 * @returns {Map<string, string>} path → file content
 */
export function renderSql(clinicalEntities, outputConfig) {
  const prefix = outputConfig.prefix ?? "clinical";
  const dir = normalizeDir(outputConfig.path);
  const requested = new Set(
    (outputConfig.entities ?? []).map((e) => stripDomain(e)),
  );

  const includedSpecs = TABLE_SPEC.filter((s) => requested.has(s.key));
  const includedKeys = new Set(includedSpecs.map((s) => s.key));
  const includedJunctions = JUNCTIONS.filter(
    (j) => includedKeys.has(j.sourceKey) && includedKeys.has(j.arrayField),
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

  const allTables = [
    ...includedSpecs.map((s) => s.table),
    ...includedJunctions.map((j) => j.table),
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

function normalizeDir(path) {
  if (!path) return "";
  return path.endsWith("/") ? path : `${path}/`;
}

function stripDomain(entityRef) {
  const dot = entityRef.indexOf(".");
  return dot === -1 ? entityRef : entityRef.slice(dot + 1);
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
  for (const rec of records) {
    for (const key of Object.keys(rec)) {
      if (seen.has(key)) continue;
      if (spec.skip.has(key)) continue;
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
