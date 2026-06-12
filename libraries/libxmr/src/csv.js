import {
  COLUMNS,
  DEFAULT_SHIFT_TYPE,
  HEADER,
  ISO_DATE_RE,
} from "./constants.js";

/** Error thrown when CSV text is structurally corrupted (git conflict markers) and must not be charted. */
export class CSVIntegrityError extends Error {
  /** Create a CSVIntegrityError carrying the 1-based line number and offending line content. */
  constructor(line, content) {
    super(`git conflict marker at line ${line}: "${content}"`);
    this.name = "CSVIntegrityError";
    this.line = line;
    this.content = content;
  }
}

// Anchored git conflict-marker shapes: `<<<<<<< <label>` (merge HEAD or
// autostash "Updated upstream"), the bare `=======` separator, and
// `>>>>>>> <label>`. The schema's first column is an ISO date, so no
// legitimate row can start with any of these.
const CONFLICT_MARKER_RE = /^(<{7} |={7}$|>{7} )/;

// A conflict-marker line means the file is a failed merge, not data —
// downstream stats would silently chart duplicated or junk rows. Line
// numbers are computed on the raw text so they match the file on disk.
function assertNoConflictMarkers(text) {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (CONFLICT_MARKER_RE.test(lines[i])) {
      throw new CSVIntegrityError(i + 1, lines[i]);
    }
  }
}

// Parse one CSV line into a row object. Quote-aware but does NOT support
// the `""` escape inside quoted fields — Kata-metrics CSVs use the `note`
// field for free text and the schema does not require embedded quotes.
/** Parse a single CSV line into a row object with date, metric, value, unit, run, and note fields. */
export function parseLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      fields.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  fields.push(current);
  return {
    date: fields[0],
    metric: fields[1],
    value: Number(fields[2]),
    unit: fields[3] || "",
    run: fields[4] || "",
    note: fields[5] || "",
    eventType: fields[6] || "",
    raw: { fields },
  };
}

/** Parse a full CSV text (with header) into an array of row objects, skipping the header line. Throws CSVIntegrityError on git conflict markers. */
export function parseCSV(text) {
  assertNoConflictMarkers(text);
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  return lines.slice(1).map((line) => {
    const row = parseLine(line);
    delete row.raw;
    return row;
  });
}

/** Validate CSV text against the expected header and field constraints, returning errors by line. */
export function validateCSV(text) {
  const errors = [];

  if (text.trim() === "") {
    errors.push({ line: 1, message: "file is empty" });
    return { valid: false, rows: 0, errors };
  }

  const lines = text.trim().split("\n");

  if (lines[0].trim() !== HEADER) {
    errors.push({ line: 1, message: headerMismatchMessage(lines[0].trim()) });
  }

  let dataRows = 0;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") continue;
    dataRows++;
    validateRow(parseLine(line), i + 1, errors);
  }

  return { valid: errors.length === 0, rows: dataRows, errors };
}

function validateRow(row, lineNumber, errors) {
  if (!row.date || !ISO_DATE_RE.test(row.date)) {
    errors.push({
      line: lineNumber,
      field: "date",
      message: `invalid ISO 8601 date "${row.date}"`,
    });
  }
  if (!row.metric) {
    errors.push({
      line: lineNumber,
      field: "metric",
      message: "missing metric name",
    });
  }
  if (Number.isNaN(row.value)) {
    errors.push({
      line: lineNumber,
      field: "value",
      message: `not a number "${row.raw.fields[2] ?? ""}"`,
    });
  }
  if (!row.unit) {
    errors.push({ line: lineNumber, field: "unit", message: "missing unit" });
  }
  if (row.eventType.trim() === "") {
    errors.push({
      line: lineNumber,
      field: "event_type",
      message: "missing event_type",
    });
  }
}

// Column-diff message so a reader sees which columns drifted, not just
// that two long strings differ.
function headerMismatchMessage(got) {
  const gotCols = got.split(",").map((c) => c.trim());
  const extra = gotCols.filter((c) => !COLUMNS.includes(c));
  const missing = COLUMNS.filter((c) => !gotCols.includes(c));
  return (
    `header mismatch: expected [${COLUMNS.join(",")}], ` +
    `got [${gotCols.join(",")}]; ` +
    `extra=[${extra.join(",")}] missing=[${missing.join(",")}]`
  );
}

/** List distinct metrics in a CSV with their unit, point count, and date range, restricted to one event_type (default kata-shift; "*" disables the filter). */
export function listMetrics(csvText, eventType = DEFAULT_SHIFT_TYPE) {
  let rows = parseCSV(csvText);
  if (eventType !== "*") {
    rows = rows.filter((row) => row.eventType === eventType);
  }

  const groups = {};
  for (const row of rows) {
    if (!groups[row.metric]) groups[row.metric] = [];
    groups[row.metric].push(row);
  }

  return Object.entries(groups).map(([name, group]) => {
    group.sort((a, b) => a.date.localeCompare(b.date));
    return {
      metric: name,
      unit: group[0].unit,
      n: group.length,
      from: group[0].date,
      to: group[group.length - 1].date,
    };
  });
}
