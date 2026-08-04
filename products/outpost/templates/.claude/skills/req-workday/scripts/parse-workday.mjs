#!/usr/bin/env bun
/**
 * Parse a Workday requisition export (.xlsx) and output structured JSON.
 *
 * The script reads Sheet1 for requisition metadata. It reads the "Candidates"
 * sheet for candidate data. It outputs a JSON object to stdout with:
 *   - requisition: { id, title, startDate, targetHireDate, location,
 *                     hiringManager, recruiter }
 *   - candidates:  [ { name, cleanName, stage, step, resumeFile, dateApplied,
 *                       currentTitle, currentCompany, source, referredBy,
 *                       availabilityDate, visaRequirement, eligibleToWork,
 *                       relocation, salaryExpectations, nonCompete, location,
 *                       phone, email, totalYearsExperience, allJobTitles,
 *                       companies, degrees, fieldsOfStudy, language,
 *                       resumeText, internalExternal } ]
 *
 * Usage:
 *   bun scripts/parse-workday.mjs <path-to-xlsx>
 *   bun scripts/parse-workday.mjs <path-to-xlsx> --summary
 *   bun scripts/parse-workday.mjs -h|--help
 *
 * Requires: bun install read-excel-file
 */

if (
  process.argv.includes("-h") ||
  process.argv.includes("--help") ||
  process.argv.length < 3
) {
  console.log(`parse-workday — extract candidates from a Workday requisition export

Usage:
  bun scripts/parse-workday.mjs <path-to-xlsx>            Full JSON output
  bun scripts/parse-workday.mjs <path-to-xlsx> --summary  Name + status only
  bun scripts/parse-workday.mjs -h|--help                 Show this help

Output (JSON):
  { requisition: { id, title, ... }, candidates: [ { name, ... }, ... ] }

Requires: bun install read-excel-file`);
  process.exit(process.argv.length < 3 ? 1 : 0);
}

let readXlsxFile;
try {
  readXlsxFile = (await import("read-excel-file/node")).default;
} catch {
  console.error(
    "Error: read-excel-file package not found. Install it first:\n  bun install read-excel-file",
  );
  process.exit(1);
}

const filePath = process.argv[2];
const summaryMode = process.argv.includes("--summary");

/**
 * Read a workbook. Tolerate Workday's ZIP container.
 *
 * Workday exports .xlsx via Apache POI's streaming writer. That writer sets
 * the ZIP "data descriptor" flag (bit 0x08) on every entry, so the sizes live
 * in a trailer after each entry, not in the local header. read-excel-file's
 * streaming unzipper trusts the (zeroed) local-header sizes, loses alignment,
 * and throws `invalid signature: 0x…`. fflate reads the authoritative ZIP
 * central directory, so on failure we re-pack into a clean container (sizes
 * in the local headers, no data descriptors) and retry. Files that already
 * parse take the original path unchanged.
 */
async function readWorkbook(path) {
  try {
    return await readXlsxFile(path);
  } catch (err) {
    let fflate;
    try {
      fflate = await import("fflate");
    } catch {
      throw err; // fflate unavailable — surface the original parse error
    }
    const { readFileSync } = await import("node:fs");
    const raw = readFileSync(path);
    const normalized = Buffer.from(
      fflate.zipSync(fflate.unzipSync(new Uint8Array(raw))),
    );
    return await readXlsxFile(normalized);
  }
}

// read-excel-file v9 returns the whole workbook as [{ sheet, data }] —
// read it once and index sheets from that.
const workbook = await readWorkbook(filePath);
const sheetNames = workbook.map((s) => s.sheet);

/** Read a sheet by number (1-indexed) or name. Rows are arrays of strings. */
function readSheet(_file, sheet) {
  const entry =
    typeof sheet === "number"
      ? workbook[sheet - 1]
      : workbook.find((s) => s.sheet === sheet);
  const rows = entry ? entry.data : [];
  // Normalise null cells to empty strings to match previous behaviour
  return rows.map((row) => row.map((cell) => (cell == null ? "" : cell)));
}

// --- Sheet 1: Requisition metadata ---

const sheet1Rows = readSheet(filePath, 1);

/** Extract the requisition ID and title from the header row. */
function parseReqHeader(headerText) {
  // Format: "4951493 Principal Software Engineer – Forward Deployed: 4951493 ..."
  const text = String(headerText).split(":")[0].trim();
  const match = text.match(/^(\d+)\s+(.+)$/);
  if (match) return { id: match[1], title: match[2] };
  return { id: "", title: text };
}

/** Build a key-value map from Sheet1 rows (column A = label, column B = value). */
function buildReqMetadata(rows) {
  const meta = {};
  for (const row of rows) {
    const key = String(row[0] || "").trim();
    const val = String(row[1] || "").trim();
    if (key && val) meta[key] = val;
  }
  return meta;
}

const reqHeader = parseReqHeader(sheet1Rows[0]?.[0] || "");
const reqMeta = buildReqMetadata(sheet1Rows.slice(1));

/** Clean a metadata date string (e.g. "02/10/2026 - 22 days ago" → "2026-02-10"). */
function cleanMetaDate(val) {
  if (!val) return "";
  const clean = val.replace(/\s*-\s*\d+\s+days?\s+ago$/i, "").trim();
  // Convert MM/DD/YYYY → YYYY-MM-DD
  const match = clean.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) return `${match[3]}-${match[1]}-${match[2]}`;
  return clean;
}

const requisition = {
  id: reqHeader.id,
  title: reqHeader.title,
  startDate: cleanMetaDate(reqMeta["Recruiting Start Date"]),
  targetHireDate: cleanMetaDate(reqMeta["Target Hire Date"]),
  location: reqMeta["Primary Location"] || "",
  hiringManager: reqMeta["Hiring Manager"] || "",
  recruiter: reqMeta["Recruiter"] || "",
};

// --- Candidates sheet ---

// Find the candidates sheet. Workday exports vary:
//   - Old format: 3+ sheets, candidates on a sheet named "Candidates" or Sheet3
//   - New format: 2 sheets, candidates on Sheet2
const candSheetName =
  sheetNames.find((n) => n.toLowerCase() === "candidates") ||
  sheetNames[Math.min(2, sheetNames.length - 1)];
const candRows = readSheet(filePath, candSheetName);

// Find the header row dynamically. Look for a row that contains "Stage".
// Old format: row 3 (index 2). New format: row 8 (index 7).
let HEADER_ROW = 2;
for (let i = 0; i < Math.min(15, candRows.length); i++) {
  if (candRows[i].some((c) => String(c).trim().toLowerCase() === "stage")) {
    HEADER_ROW = i;
    break;
  }
}
const DATA_START = HEADER_ROW + 1;

// --- Build header-driven column index map ---
// Column layout varies between Workday exports. Extra columns like "Jobs
// Applied to" or "Referred by" shift the indices. Map by header name to be
// resilient.

const headerRow = candRows[HEADER_ROW] || [];
const colMap = {};
const HEADER_ALIASES = {
  "job application": "name", // second "Job Application" column (index 1) has candidate name
  stage: "stage",
  "step / disposition": "step",
  "awaiting me": "awaitingMe",
  "awaiting action": "awaitingAction",
  resume: "resumeFile",
  "date applied": "dateApplied",
  "current job title": "currentTitle",
  "current company": "currentCompany",
  source: "source",
  "referred by": "referredBy",
  "availability date": "availabilityDate",
  "visa requirement": "visaRequirement",
  "eligible to work": "eligibleToWork",
  relocation: "relocation",
  "salary expectations": "salaryExpectations",
  "non-compete": "nonCompete",
  "candidate location": "location",
  phone: "phone",
  email: "email",
  "total years experience": "totalYearsExperience",
  "all job titles": "allJobTitles",
  companies: "companies",
  degrees: "degrees",
  "fields of study": "fieldsOfStudy",
  language: "language",
  "resume text": "resumeText",
};

// Skip columns we don't need (e.g. "Jobs Applied to", "Create Candidate Home Account URL")
for (let i = 0; i < headerRow.length; i++) {
  const hdr = String(headerRow[i]).trim().toLowerCase();
  const field = HEADER_ALIASES[hdr];
  if (field) {
    // "Job Application" appears twice (cols A and B). Always take the latest
    // occurrence. We then end up with the second one (index 1), which has the
    // name.
    colMap[field] = i;
  }
}

// Fallback: with no "name" column, use index 0 (new format) or 1 (old format)
if (colMap.name === undefined) colMap.name = 1;
// In the new format there is only one "Job Application" column (index 0).
// The "always take latest" logic already handles this correctly.

/** Get a cell value by field name, with fallback to empty string. */
function col(row, field) {
  const idx = colMap[field];
  if (idx === undefined) return "";
  return row[idx] ?? "";
}

// Any character outside the Latin script blocks (Basic Latin + Latin-1
// Supplement + Latin Extended-A/B + Latin Extended Additional). Accented Latin
// (é, ñ, ø, ç, Vietnamese, …) stays; Greek, Cyrillic, CJK, Arabic, Hebrew,
// etc. count as native-alphabet text to drop.
const NON_LATIN = /[^\u0020-\u024F\u1E00-\u1EFF]/;
const HAS_LATIN_LETTER = /[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]/;

/**
 * Clean a candidate name into the canonical Latin name.
 *
 * Workday encodes several things in the name cell as parentheticals:
 *   - Employment annotations: `(Internal)`, `(Prior Worker)`, `(External)`.
 *   - A native-alphabet transliteration of the name, e.g.
 *     `Nikos Papadopoulos (ΝΙΚΟΣ ΠΑΠΑΔΟΠΟΥΛΟΣ)` or `Wei Zhang （张伟）`.
 * A name may carry both, in either paren style. Normalise on the Latin name:
 * strip every trailing parenthetical (classify employment ones into
 * `internalExternal`, discard native-alphabet ones), then drop any residual
 * non-Latin-script tokens. Returns { cleanName, internalExternal }.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: annotation peel loop classifies employment vs transliteration cases
function parseName(raw) {
  // Normalise full-width parens （） to ASCII so both styles strip uniformly.
  let name = String(raw).replace(/（/g, "(").replace(/）/g, ")").trim();
  if (!name) return { cleanName: "", internalExternal: "" };

  let internalExternal = "";
  // Repeatedly peel a trailing parenthetical group (allowing one level of
  // nesting so `(External (Prior Worker))` is captured whole).
  const trailing = /\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*$/;
  let m;
  while ((m = name.match(trailing)) !== null) {
    const annotation = m[1].trim();
    if (/prior\s*worker/i.test(annotation)) {
      if (!internalExternal) internalExternal = "External (Prior Worker)";
    } else if (/internal/i.test(annotation)) {
      if (!internalExternal) internalExternal = "Internal";
    } else if (/external/i.test(annotation)) {
      if (!internalExternal) internalExternal = "External";
    } else if (NON_LATIN.test(annotation)) {
      // Native-alphabet transliteration of the name — drop, no IE signal.
    } else if (!internalExternal && annotation) {
      // Unknown Latin annotation — preserve prior behaviour (first one wins).
      internalExternal = annotation;
    }
    name = name.slice(0, name.length - m[0].length).trim();
  }

  // Drop any residual whole-word tokens that are purely non-Latin script
  // (e.g. a native name appended without parentheses). Keep Latin tokens
  // and pure punctuation/digits.
  name = name
    .split(/\s+/)
    .filter((tok) => HAS_LATIN_LETTER.test(tok) || !NON_LATIN.test(tok))
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();

  return { cleanName: name, internalExternal };
}

/** Detect source-based internal/external when the name annotation is absent. */
function inferInternalExternal(source, nameAnnotation) {
  if (nameAnnotation) return nameAnnotation;
  if (/internal/i.test(source)) return "Internal";
  return "External";
}

/** Format a date value (it may be a Date object or a string). */
function fmtDate(val) {
  if (!val) return "";
  if (val instanceof Date) {
    // Use local date parts so a UTC offset does not shift the day
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, "0");
    const d = String(val.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(val).trim();
  // Strip trailing " 00:00:00" and relative text like " - 22 days ago"
  return s
    .replace(/\s+\d{2}:\d{2}:\d{2}$/, "")
    .replace(/\s*-\s*\d+\s+days?\s+ago$/i, "");
}

/** Normalise multiline cell values into clean lists. */
function multiline(val) {
  if (!val) return "";
  return String(val)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join(", ");
}

const candidates = [];

for (let i = DATA_START; i < candRows.length; i++) {
  const row = candRows[i];
  const rawName = String(col(row, "name") || "").trim();
  const stage = String(col(row, "stage") || "").trim();

  // Skip empty rows. Stop at stage-summary rows (name present but no stage)
  if (!rawName) continue;
  if (!stage) break;

  const { cleanName, internalExternal: nameIE } = parseName(rawName);
  const source = String(col(row, "source") || "").trim();

  candidates.push({
    name: rawName,
    cleanName,
    stage,
    step: String(col(row, "step") || "").trim(),
    awaitingMe: String(col(row, "awaitingMe") || "").trim(),
    awaitingAction: String(col(row, "awaitingAction") || "").trim(),
    resumeFile: String(col(row, "resumeFile") || "").trim(),
    dateApplied: fmtDate(col(row, "dateApplied")),
    currentTitle: String(col(row, "currentTitle") || "").trim(),
    currentCompany: String(col(row, "currentCompany") || "").trim(),
    source,
    referredBy: String(col(row, "referredBy") || "").trim(),
    availabilityDate: fmtDate(col(row, "availabilityDate")),
    visaRequirement: String(col(row, "visaRequirement") || "").trim(),
    eligibleToWork: String(col(row, "eligibleToWork") || "").trim(),
    relocation: String(col(row, "relocation") || "").trim(),
    salaryExpectations: String(col(row, "salaryExpectations") || "").trim(),
    nonCompete: String(col(row, "nonCompete") || "").trim(),
    location: String(col(row, "location") || "").trim(),
    phone: String(col(row, "phone") || "").trim(),
    email: String(col(row, "email") || "").trim(),
    totalYearsExperience: String(col(row, "totalYearsExperience") || "").trim(),
    allJobTitles: multiline(col(row, "allJobTitles")),
    companies: multiline(col(row, "companies")),
    degrees: multiline(col(row, "degrees")),
    fieldsOfStudy: multiline(col(row, "fieldsOfStudy")),
    language: multiline(col(row, "language")),
    resumeText: String(col(row, "resumeText") || "").trim(),
    internalExternal: inferInternalExternal(source, nameIE),
  });
}

// --- Output ---

if (summaryMode) {
  console.log(`Requisition: ${requisition.id} — ${requisition.title}`);
  console.log(`Location: ${requisition.location}`);
  console.log(`Hiring Manager: ${requisition.hiringManager}`);
  console.log(`Recruiter: ${requisition.recruiter}`);
  console.log(`Candidates: ${candidates.length}`);
  console.log();
  for (const c of candidates) {
    const resume = c.resumeText ? "has resume" : "no resume";
    console.log(
      `  ${c.cleanName} — ${c.step || c.stage} (${c.internalExternal}, ${resume})`,
    );
  }
} else {
  console.log(JSON.stringify({ requisition, candidates }, null, 2));
}
