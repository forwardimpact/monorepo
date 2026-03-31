/**
 * Generic dataset renderers — six standalone functions that convert datasets
 * to output formats: JSON, YAML, CSV, Markdown, Parquet, SQL INSERT.
 *
 * @typedef {object} Dataset
 * @property {string} name
 * @property {object|null} schema
 * @property {object[]} records
 * @property {object} metadata
 */

import YAML from "yaml";

// ── JSON ────────────────────────────────────────────────────────────────────

/**
 * @param {Dataset} dataset
 * @param {object} config - { path }
 * @returns {Map<string, string>}
 */
function renderJson(dataset, config) {
  return new Map([[config.path, JSON.stringify(dataset.records, null, 2)]]);
}

// ── YAML ────────────────────────────────────────────────────────────────────

/**
 * @param {Dataset} dataset
 * @param {object} config - { path }
 * @returns {Map<string, string>}
 */
function renderYaml(dataset, config) {
  return new Map([
    [config.path, YAML.stringify(dataset.records, { lineWidth: 120 })],
  ]);
}

// ── CSV ─────────────────────────────────────────────────────────────────────

/**
 * Escape a value for CSV output.
 * @param {*} value
 * @returns {string}
 */
function csvEscape(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") value = JSON.stringify(value);
  else value = String(value);
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

/**
 * @param {Dataset} dataset
 * @param {object} config - { path }
 * @returns {Map<string, string>}
 */
function renderCsv(dataset, config) {
  if (dataset.records.length === 0) {
    return new Map([[config.path, ""]]);
  }
  const headers = Object.keys(dataset.records[0]);
  const rows = dataset.records.map((r) =>
    headers.map((h) => csvEscape(r[h])).join(","),
  );
  const content = [headers.join(","), ...rows].join("\n") + "\n";
  return new Map([[config.path, content]]);
}

// ── Markdown ────────────────────────────────────────────────────────────────

/**
 * Escape a value for Markdown table output.
 * @param {*} value
 * @returns {string}
 */
function mdEscape(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") value = JSON.stringify(value);
  else value = String(value);
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

/**
 * @param {Dataset} dataset
 * @param {object} config - { path }
 * @returns {Map<string, string>}
 */
function renderMarkdown(dataset, config) {
  if (dataset.records.length === 0) {
    return new Map([[config.path, `# ${dataset.name}\n\nNo records.\n`]]);
  }
  const headers = Object.keys(dataset.records[0]);
  const headerRow = "| " + headers.join(" | ") + " |";
  const separator = "| " + headers.map(() => "---").join(" | ") + " |";
  const dataRows = dataset.records.map(
    (r) => "| " + headers.map((h) => mdEscape(r[h])).join(" | ") + " |",
  );
  const content = `# ${dataset.name}\n\n${headerRow}\n${separator}\n${dataRows.join("\n")}\n`;
  return new Map([[config.path, content]]);
}

// ── Parquet ─────────────────────────────────────────────────────────────────

/**
 * @param {Dataset} dataset
 * @param {object} config - { path }
 * @returns {Promise<Map<string, Buffer>>}
 */
async function renderParquet(dataset, config) {
  let arrow, parquetModule;
  try {
    arrow = await import("apache-arrow");
    parquetModule = await import("parquet-wasm/esm/parquet_wasm.js");
  } catch {
    throw new Error(
      "Parquet rendering requires apache-arrow and parquet-wasm. " +
        "Install with: bun add apache-arrow parquet-wasm",
    );
  }
  const { readFileSync } = await import("fs");
  const { createRequire } = await import("module");
  const require = createRequire(import.meta.url);
  const wasmPath = require.resolve("parquet-wasm/esm/parquet_wasm_bg.wasm");
  const wasmBytes = readFileSync(wasmPath);
  parquetModule.initSync(wasmBytes);
  const table = arrow.tableFromJSON(dataset.records);
  const ipc = arrow.tableToIPC(table, "stream");
  const wasmTable = parquetModule.Table.fromIPCStream(ipc);
  const buffer = parquetModule.writeParquet(wasmTable);
  return new Map([[config.path, Buffer.from(buffer)]]);
}

// ── SQL INSERT ──────────────────────────────────────────────────────────────

/**
 * Convert a JS value to a PostgreSQL literal.
 * @param {*} value
 * @returns {string}
 */
function sqlLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return String(value);
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (typeof value === "object") {
    return "'" + JSON.stringify(value).replace(/'/g, "''") + "'";
  }
  return "'" + String(value).replace(/'/g, "''") + "'";
}

/**
 * @param {Dataset} dataset
 * @param {object} config - { path, table }
 * @returns {Map<string, string>}
 */
function renderSql(dataset, config) {
  const table = config.table || dataset.name;
  if (dataset.records.length === 0) {
    return new Map([[config.path, `-- No records for ${table}\n`]]);
  }
  const columns = Object.keys(dataset.records[0]);
  const header = `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(", ")}) VALUES\n`;
  const rows = dataset.records.map(
    (r) => "(" + columns.map((c) => sqlLiteral(r[c])).join(", ") + ")",
  );
  const content = header + rows.join(",\n") + ";\n";
  return new Map([[config.path, content]]);
}

// ── Dispatch ────────────────────────────────────────────────────────────────

const RENDERERS = {
  json: renderJson,
  yaml: renderYaml,
  csv: renderCsv,
  markdown: renderMarkdown,
  parquet: renderParquet,
  sql: renderSql,
};

/**
 * Render a dataset to the specified format.
 * @param {Dataset} dataset
 * @param {string} format
 * @param {object} config
 * @returns {Promise<Map<string, string|Buffer>>}
 */
export async function renderDataset(dataset, format, config) {
  const renderer = RENDERERS[format];
  if (!renderer) throw new Error(`Unknown format: ${format}`);
  return renderer(dataset, config);
}
