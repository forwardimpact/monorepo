import {
  ACTIVE_CLAIMS_HEADER_RE,
  ACTIVE_CLAIMS_HEADING,
  CARRY_CLEARANCE_MARKER_RE,
  CARRY_SURFACE_H1_RE,
  PRIORITY_INDEX_HEADING,
  WEEKLY_LOG_SEAM_RE,
} from "../constants.js";
import {
  PRIORITY_HEADER_RE,
  SUMMARY_H1_RE,
  WEEKLY_LOG_H1_RE,
} from "./scopes.js";

// Check builders and the derived matchers they share, extracted from rules.js
// so the rule table stays under the per-file line cap. Each builder takes a
// subject (plus optional ctx) and returns null | finding | finding[]. rules.js
// imports exactly the symbols its rule table references; the pure constants in
// constants.js/scopes.js it still imports straight from source.

export const PRIORITY_INDEX_HEADING_RE = new RegExp(
  `^${PRIORITY_INDEX_HEADING}$`,
  "m",
);
const ACTIVE_CLAIMS_HEADING_RE = new RegExp(`^${ACTIVE_CLAIMS_HEADING}$`, "m");
export const PRIORITY_SEPARATOR_RE =
  /^\|\s*---\s*\|\s*---\s*\|\s*---\s*\|\s*---\s*\|\s*---\s*\|/m;
export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// improvement-coach is the storyboard facilitator and carries no domain
// metrics; only the five domain agents need their own H3.
const STORYBOARD_DOMAIN_AGENTS = [
  "product-manager",
  "release-engineer",
  "security-engineer",
  "staff-engineer",
  "technical-writer",
];

// -- Check builders: subject (+ ctx) → null | finding | finding[] --

export const matches = (pattern) => (s) => (pattern.test(s.text) ? null : {});
export const firstLineMatches = (pattern) => (s) =>
  pattern.test(s.firstLine) ? null : {};
export const containsLine = (needle) => (s) =>
  s.fileLines.some((l) => l.trim() === needle) ? null : {};

export const lineBudget = (limit) => (s) =>
  s.lines > limit ? { value: s.lines } : null;
export const wordBudget = (limit) => (s) =>
  s.words > limit ? { value: s.words } : null;

export const firstH2Is = (expected) => (s) =>
  s.h2s.length === 0 || s.h2s[0] === expected ? null : { observed: s.h2s[0] };

export const nothingAfterH2 = (marker) => (s) => {
  const idx = s.h2s.indexOf(marker);
  if (idx === -1) return null;
  const after = s.h2s.slice(idx + 1);
  return after.length === 0 ? null : after.map((h) => ({ observed: h }));
};

export const fieldMatches = (name, pattern) => (s) =>
  pattern.test(s[name]) ? null : { value: s[name] };

export const columnCount = (expected) => (s) =>
  s.cells.length === expected ? null : { actual: s.cells.length, expected };

export const exists = (s) => (s.exists ? null : {});
export const expired = (s, ctx) => (s.expires_at < ctx.today ? {} : null);

// The heading must equal `requiredLine` exactly — a suffixed variant like
// "### Decision — <summary>" does not satisfy it, but is reported as a
// near miss so the writer fixes the heading instead of hunting for a
// "missing" line that is right there.
function entryHasDecision(lines, startIdx, requiredLine, stopRe) {
  let seen = 0;
  let nearMiss = null;
  for (let j = startIdx + 1; j < lines.length && seen < 5; j++) {
    const ln = lines[j].trim();
    if (ln === "") continue;
    seen++;
    if (ln === requiredLine) return { found: true };
    if (nearMiss === null && ln.startsWith(requiredLine)) nearMiss = ln;
    if (stopRe.test(lines[j])) break;
  }
  return { found: false, nearMiss };
}

export const decisionWithin5 =
  ({ entryRe, requiredLine, stopRe }) =>
  (s) => {
    const offenders = [];
    for (let i = 0; i < s.fileLines.length; i++) {
      if (!entryRe.test(s.fileLines[i])) continue;
      const res = entryHasDecision(s.fileLines, i, requiredLine, stopRe);
      if (!res.found) offenders.push({ lineNo: i + 1, nearMiss: res.nearMiss });
    }
    return offenders.length === 0 ? null : offenders;
  };

// Flag entry-shaped `## ` headings that the rotation seam-finder would skip —
// the grammar-drift that degrades a whole file to one unsplittable prologue and
// is otherwise silent (the decision-block rule matches only dated headings).
// Uses the same WEEKLY_LOG_SEAM_RE the seam-finder uses, so the flagged set is
// exactly the complement of the rotatable set.
export const headingGrammarDrift = (s) => {
  const offenders = [];
  for (let i = 0; i < s.fileLines.length; i++) {
    const line = s.fileLines[i];
    if (/^## /.test(line) && !WEEKLY_LOG_SEAM_RE.test(line)) {
      offenders.push({ lineNo: i + 1, observed: line.trim() });
    }
  }
  return offenders.length === 0 ? null : offenders;
};

function scanMarkers(fileLines, openRe, closeRe, label) {
  const openings = [];
  const findings = [];
  for (let i = 0; i < fileLines.length; i++) {
    const openMatch = fileLines[i].match(openRe);
    if (openMatch) {
      openings.push({ label: openMatch[1] || label, lineNo: i + 1 });
    } else if (closeRe.test(fileLines[i])) {
      if (openings.length > 0) openings.pop();
      else findings.push({ lineNo: i + 1, reason: "unpaired-close" });
    }
  }
  for (const open of openings) {
    findings.push({
      lineNo: open.lineNo,
      reason: "dangling-open",
      label: open.label,
    });
  }
  return findings;
}

export const markersBalanced =
  ({ openRe, closeRe, label }) =>
  (s) => {
    const findings = scanMarkers(s.fileLines, openRe, closeRe, label);
    return findings.length === 0 ? null : findings;
  };

export const allRequiredLines = (required) => (s) => {
  const findings = [];
  for (const r of required) {
    if (!s.fileLines.some((l) => r.pattern.test(l))) {
      findings.push({ label: r.label });
    }
  }
  return findings.length === 0 ? null : findings;
};

// -- H1 → filename agent prefix --

const slugify = (title) =>
  title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

export const summaryAgentMismatch = (s) => {
  const titleSlug = slugify(s.firstLine.match(SUMMARY_H1_RE)[1]);
  return titleSlug === s.agentPrefix ? null : { titleSlug };
};

export const weeklyAgentMismatch = (s) => {
  const m = s.firstLine.match(WEEKLY_LOG_H1_RE);
  if (!m) return null;
  const titleSlug = slugify(m[1]);
  return titleSlug === s.agentPrefix ? null : { titleSlug };
};

// Carry surface: the H1 agent slug (`# <agent> — Carries`) must agree with the
// filename prefix (`<agent>-carries.md`), the carry analogue of the summary /
// weekly-log agreement rules. The H1 is the slug form already, so slugify is a
// no-op for well-formed files; it normalises a stray capitalisation otherwise.
export const carryAgentMismatch = (s) => {
  const m = s.firstLine.match(CARRY_SURFACE_H1_RE);
  if (!m) return null;
  const titleSlug = slugify(m[1]);
  return titleSlug === s.agentPrefix ? null : { titleSlug };
};

// Each Carry entry is an H3 block; every block must name a clearance trigger
// (the `**Carry-clearance:**` marker). Walk the file's H3 boundaries and emit
// one finding per block missing the marker — the finding[]-returning shape
// `nothingAfterH2` uses.
export const carryEntryHasClearance = (s) => {
  const offenders = [];
  let blockStart = -1;
  let hasMarker = false;
  const close = () => {
    if (blockStart !== -1 && !hasMarker) {
      offenders.push({ lineNo: blockStart + 1 });
    }
  };
  for (let i = 0; i < s.fileLines.length; i++) {
    const line = s.fileLines[i];
    if (/^### /.test(line)) {
      close();
      blockStart = i;
      hasMarker = false;
    } else if (blockStart !== -1 && CARRY_CLEARANCE_MARKER_RE.test(line)) {
      hasMarker = true;
    }
  }
  close();
  return offenders.length === 0 ? null : offenders;
};

export const AGENT_H3_REQUIREMENTS = STORYBOARD_DOMAIN_AGENTS.map((agent) => ({
  label: agent,
  pattern: new RegExp(`^### ${agent}(\\s|$|—|-)`),
}));

// -- Metrics CSV duplicate rows --

// Report every data line byte-identical to an earlier data line in the same
// CSV. Line 1 is the header (positionally) and blank lines are skipped; the
// header is never a duplicate subject. Keying on exact line equality gives the
// spec's exit path for free: any column edit (run id or note) on one row makes
// the pair non-identical and stops the finding firing.
export const duplicateCsvRows = (s) => {
  const seen = new Set();
  const findings = [];
  s.rows.forEach((text, i) => {
    const lineNo = i + 1;
    if (lineNo === 1 || text.trim() === "") return;
    if (seen.has(text)) findings.push({ lineNo });
    else seen.add(text);
  });
  return findings.length === 0 ? null : findings;
};

export const memoryExists = (s) => s.exists;
export const memoryHasPriorityHeader = (s) =>
  s.exists && PRIORITY_HEADER_RE.test(s.text);
export const memoryHasClaimsHeading = (s) =>
  s.exists && ACTIVE_CLAIMS_HEADING_RE.test(s.text);
export const memoryHasClaimsHeader = (s) =>
  ACTIVE_CLAIMS_HEADER_RE.test(s.text);
export const storyboardExists = (s) => s.exists;
