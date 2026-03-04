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
 * Requires: npm install xlsx
 */

import { readFileSync } from "node:fs";

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

Requires: npm install xlsx`);
  process.exit(process.argv.length < 3 ? 1 : 0);
}

let XLSX;
try {
  XLSX = await import("xlsx");
} catch {
  console.error(
    "Error: xlsx package not found. Install it first:\n  npm install xlsx",
  );
  process.exit(1);
}

const filePath = process.argv[2];
const summaryMode = process.argv.includes("--summary");

const data = readFileSync(filePath);
const wb = XLSX.read(data, { type: "buffer", cellDates: true });

// --- Sheet 1: Requisition metadata ---

const ws1 = wb.Sheets[wb.SheetNames[0]];
const sheet1Rows = XLSX.utils.sheet_to_json(ws1, { header: 1, defval: "" });

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

// --- Sheet 3: Candidates ---

// Find the "Candidates" sheet (usually index 2, but search by name to be safe)
const candSheetName =
  wb.SheetNames.find((n) => n.toLowerCase() === "candidates") ||
  wb.SheetNames[2];
const ws3 = wb.Sheets[candSheetName];
const candRows = XLSX.utils.sheet_to_json(ws3, { header: 1, defval: "" });

// Row 3 (index 2) has column headers. Data starts at row 4 (index 3).
// Stage summary rows start when column A has a non-empty value that looks like
// a label or number — detect by checking if column C (Stage) is empty and
// column A has a value.
const DATA_START = 3;

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
    let ie = "";
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
  const rawName = String(row[1] || "").trim(); // Column B (index 1)
  const stage = String(row[2] || "").trim(); // Column C (index 2)

  // Stop at stage-summary rows: column A has a value, column C (stage) is empty
  if (!rawName || (!stage && String(row[0] || "").trim())) break;
  if (!rawName) continue;

  const { cleanName, internalExternal: nameIE } = parseName(rawName);
  const source = String(row[10] || "").trim();

  candidates.push({
    name: rawName,
    cleanName,
    stage,
    step: String(row[3] || "").trim(),
    awaitingMe: String(row[4] || "").trim(),
    awaitingAction: String(row[5] || "").trim(),
    resumeFile: String(row[6] || "").trim(),
    dateApplied: fmtDate(row[7]),
    currentTitle: String(row[8] || "").trim(),
    currentCompany: String(row[9] || "").trim(),
    source,
    referredBy: String(row[11] || "").trim(),
    availabilityDate: fmtDate(row[13]),
    visaRequirement: String(row[14] || "").trim(),
    eligibleToWork: String(row[15] || "").trim(),
    relocation: String(row[16] || "").trim(),
    salaryExpectations: String(row[17] || "").trim(),
    nonCompete: String(row[18] || "").trim(),
    location: String(row[19] || "").trim(),
    phone: String(row[20] || "").trim(),
    email: String(row[21] || "").trim(),
    totalYearsExperience: String(row[22] || "").trim(),
    allJobTitles: multiline(row[23]),
    companies: multiline(row[24]),
    degrees: multiline(row[25]),
    fieldsOfStudy: multiline(row[26]),
    language: multiline(row[27]),
    resumeText: String(row[28] || "").trim(),
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
