/**
 * Text renderers for `fit-trace` query output.
 *
 * One named export per renderable verb. Each renderer accepts the query result
 * plus `{multi, signatures}` and returns a string. `multi` controls
 * source-attribution prefixing (`grep -H` convention); record-per-line
 * renderers prepend `<basename>:`, block renderers emit `# <basename>` headers.
 *
 * Internal module — imported by `commands/trace.js` and tests by relative
 * path, never re-exported from `src/index.js`.
 */

/** Collapse newlines/tabs in a value to a single-line, grep-friendly string. */
function oneLine(value) {
  const str = typeof value === "string" ? value : JSON.stringify(value ?? null);
  return str.replace(/[\r\n\t]+/g, " ").trim();
}

/** Group records by their `source` field (multi-file path), preserving order. */
function groupBySource(records) {
  const groups = new Map();
  for (const record of records) {
    const key = record.source ?? "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  return groups;
}

/**
 * Render record-per-line output, prefixing each line with `<source>:` when
 * multi-file. `lineOf` maps one record to its text line.
 * @param {object[]} records
 * @param {(record: object) => string} lineOf
 * @param {{multi: boolean}} opts
 * @returns {string}
 */
function renderLines(records, lineOf, { multi }) {
  return records
    .map((r) => (multi && r.source ? `${r.source}:${lineOf(r)}` : lineOf(r)))
    .join("\n");
}

/**
 * Render a block per source. `blockOf` maps one record to a multi-line string;
 * multi-file output separates groups with `# <source>` headers.
 * @param {object[]} records
 * @param {(record: object) => string} blockOf
 * @param {{multi: boolean}} opts
 * @returns {string}
 */
function renderBlocks(records, blockOf, { multi }) {
  if (!multi) return records.map(blockOf).join("\n");
  const out = [];
  for (const [source, group] of groupBySource(records)) {
    out.push(`# ${source}`);
    out.push(...group.map(blockOf));
  }
  return out.join("\n");
}

/** `[turnIdx] <Tool> <toolUseId>` / `  in:` / `  out:` per block. */
export function renderToolCalls(records, opts = {}) {
  return renderBlocks(
    records,
    (r) => {
      const head = `[${r.turnIndex}] ${r.name} ${r.toolUseId}`;
      const input = `  in: ${oneLine(r.input)}`;
      const out = `  out: ${
        r.result ? oneLine(r.result.content) : "(no result)"
      }`;
      return [head, input, out].join("\n");
    },
    opts,
  );
}

/** `[turnIdx] <command>` per line, newlines escaped. */
export function renderCommands(records, opts = {}) {
  return renderLines(
    records,
    (r) => `[${r.turnIndex}] ${oneLine(r.command)}`,
    opts,
  );
}

/** `<count>\t<path>` frequency-sorted. */
export function renderPaths(records, opts = {}) {
  return renderLines(records, (r) => `${r.count}\t${r.path}`, opts);
}

/** Metadata header, per-row metrics, then Tool and Path delta tables. */
export function renderCompare(result) {
  const { a, b, toolDelta, pathDelta } = result;
  const part = (p) => (p == null ? "(none)" : p);
  const lines = [];
  lines.push(
    `A: ${a.metadata.caseName} / ${part(a.metadata.participant)}${
      a.metadata.marker ? ` ${a.metadata.marker}` : ""
    }`,
  );
  lines.push(
    `B: ${b.metadata.caseName} / ${part(b.metadata.participant)}${
      b.metadata.marker ? ` ${b.metadata.marker}` : ""
    }`,
  );
  lines.push("");
  lines.push(`turns    | ${a.turnCount} | ${b.turnCount}`);
  lines.push(`tools    | ${a.tools.length} | ${b.tools.length}`);
  lines.push(`paths    | ${a.pathCount} | ${b.pathCount}`);
  lines.push(`cost     | ${a.cost} | ${b.cost}`);
  lines.push("");
  lines.push("Tool | A | B | Δ");
  for (const d of toolDelta) {
    lines.push(`${d.tool} | ${d.a} | ${d.b} | ${d.diff}`);
  }
  lines.push("");
  lines.push("Path | A | B | Δ");
  for (const d of pathDelta) {
    lines.push(`${d.path} | ${d.a} | ${d.b} | ${d.diff}`);
  }
  return lines.join("\n");
}

/** `Tool | Turns | In | Out | Share` sorted Share desc. */
export function renderStatsByTool(result) {
  const lines = ["Tool | Turns | In | Out | Share"];
  for (const b of result.perTool) {
    lines.push(
      `${b.tool} | ${b.turns} | ${Math.round(b.inputTokens)} | ${Math.round(
        b.outputTokens,
      )} | ${b.costShare.toFixed(4)}`,
    );
  }
  return lines.join("\n");
}

/** Totals block only. */
export function renderStatsSummary(result) {
  const t = result.totals;
  return [
    `inputTokens: ${t.inputTokens}`,
    `outputTokens: ${t.outputTokens}`,
    `cacheReadInputTokens: ${t.cacheReadInputTokens}`,
    `cacheCreationInputTokens: ${t.cacheCreationInputTokens}`,
    `totalCostUsd: ${t.totalCostUsd}`,
    `durationMs: ${t.durationMs}`,
  ].join("\n");
}

/** `[turnIdx] <prefix>: <excerpt>` per match. */
export function renderSearch(records, opts = {}) {
  const lines = [];
  for (const hit of records) {
    const idx = hit.turn?.index;
    const prefix = multiPrefix(hit, opts);
    for (const match of hit.matches ?? []) {
      lines.push(`${prefix}[${idx}] ${oneLine(match)}`);
    }
  }
  return lines.join("\n");
}

/** Source prefix for a multi-file record (search/default), or "". */
function multiPrefix(record, { multi }) {
  return multi && record.source ? `${record.source}:` : "";
}

/**
 * Default renderer for every other renderable verb: one record per block,
 * fields rendered as `key: value` lines (no JSON braces or quotes, so the
 * default output is grep/awk-friendly and does not parse as JSON). Nested
 * values are collapsed to a single grep-friendly line. Multi-file output
 * separates source groups with `# <source>` headers (`renderBlocks`
 * convention).
 * @param {object[]|object} result
 * @param {{multi: boolean}} opts
 * @returns {string}
 */
export function renderDefault(result, opts = {}) {
  const records = Array.isArray(result) ? result : [result];
  return renderBlocks(records, (r) => recordBlock(stripSource(r)), opts);
}

/**
 * Render one record as `key: value` lines. Scalars render verbatim; objects
 * and arrays collapse to a single line via `oneLine`. A non-object record
 * (string/number) renders as its own single line.
 * @param {*} record
 * @returns {string}
 */
function recordBlock(record) {
  if (record == null || typeof record !== "object" || Array.isArray(record)) {
    return oneLine(record);
  }
  return Object.entries(record)
    .map(([key, value]) => {
      const scalar = value == null || typeof value !== "object";
      return `${key}: ${scalar ? String(value) : oneLine(value)}`;
    })
    .join("\n");
}

/** Drop the orchestrator-injected `source` field before textifying. */
function stripSource(record) {
  if (record == null || typeof record !== "object" || Array.isArray(record)) {
    return record;
  }
  const { source, ...rest } = record;
  return rest;
}
