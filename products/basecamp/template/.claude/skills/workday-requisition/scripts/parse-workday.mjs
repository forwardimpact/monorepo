#!/usr/bin/env node
/**
 * Parse a Workday requisition export (.xlsx) and output structured JSON.
 *
 * Reads Sheet1 for requisition metadata and the "Candidates" sheet for
 * candidate data. Outputs a JSON object to stdout with:
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
 *   node scripts/parse-workday.mjs <path-to-xlsx>
 *   node scripts/parse-workday.mjs <path-to-xlsx> --summary
 *   node scripts/parse-workday.mjs -h|--help
 *
 * Requires: npm install read-excel-file
 */

if (
  process.argv.includes("-h") ||
  process.argv.includes("--help") ||
  process.argv.length < 3
) {
  console.log(`parse-workday — extract candidates from a Workday requisition export

Usage:
  node scripts/parse-workday.mjs <path-to-xlsx>            Full JSON output
  node scripts/parse-workday.mjs <path-to-xlsx> --summary  Name + status only
  node scripts/parse-workday.mjs -h|--help                 Show this help

Output (JSON):
  { requisition: { id, title, ... }, candidates: [ { name, ... }, ... ] }

Requires: npm install read-excel-file`);
  process.exit(process.argv.length < 3 ? 1 : 0);
}

let readXlsxFile;
try {
  readXlsxFile = (await import("read-excel-file/node")).default;
} catch {
  console.error(
    "Error: read-excel-file package not found. Install it first:\n  npm install read-excel-file",
  );
  process.exit(1);
}

const filePath = process.argv[2];
const summaryMode = process.argv.includes("--summary");

/** Read a sheet by number (1-indexed) or name, returning rows as arrays of strings. */
async function readSheet(file, sheet) {
  const rows = await readXlsxFile(file, { sheet });
  // Normalise null cells to empty strings to match previous behaviour
  return rows.map((row) => row.map((cell) => (cell == null ? "" : cell)));
}

// Get sheet names to find the candidates sheet
const sheets = await readXlsxFile(filePath, { getSheets: true });
const sheetNames = sheets.map((s) => s.name);

// --- Sheet 1: Requisition metadata ---

const sheet1Rows = await readSheet(filePath, 1);

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
const candRows = await readSheet(filePath, candSheetName);

// Find the header row dynamically — look for a row containing "Stage"
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
// Column layout varies between Workday exports (extra columns like "Jobs Applied to"
// or "Referred by" shift indices). Map by header name to be resilient.

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
    // "Job Application" appears twice (cols A and B) — always take the latest
    // occurrence so we end up with the second one (index 1) which has the name
    colMap[field] = i;
  }
}

// Fallback: if "name" wasn't mapped, use index 0 (new format) or 1 (old format)
if (colMap.name === undefined) colMap.name = 1;
// In new format there's only one "Job Application" column (index 0) — the
// "always take latest" logic already handles this correctly.

/** Get a cell value by field name, with fallback to empty string. */
function col(row, field) {
  const idx = colMap[field];
  if (idx === undefined) return "";
  return row[idx] ?? "";
}

/**
 * Clean a candidate name by stripping annotations like (Prior Worker),
 * (Internal), etc. Returns { cleanName, internalExternal }.
 */
function parseName(raw) {
  const name = String(raw).trim();
  if (!name) return { cleanName: "", internalExternal: "" };

  const match = name.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (match) {
    const annotation = match[2].trim();
    let ie;
    if (/prior\s*worker/i.test(annotation)) ie = "External (Prior Worker)";
    else if (/internal/i.test(annotation)) ie = "Internal";
    else ie = annotation;
    return { cleanName: match[1].trim(), internalExternal: ie };
  }
  return { cleanName: name, internalExternal: "" };
}

/** Detect source-based internal/external when name annotation is absent. */
function inferInternalExternal(source, nameAnnotation) {
  if (nameAnnotation) return nameAnnotation;
  if (/internal/i.test(source)) return "Internal";
  return "External";
}

/** Format a date value (may be Date object or string). */
function fmtDate(val) {
  if (!val) return "";
  if (val instanceof Date) {
    // Use local date parts to avoid UTC offset shifting the day
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

  // Skip empty rows; stop at stage-summary rows (name present but no stage)
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
