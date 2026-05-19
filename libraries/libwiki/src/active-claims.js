import {
  ACTIVE_CLAIMS_HEADING,
  ACTIVE_CLAIMS_TABLE_HEADER,
  ACTIVE_CLAIMS_TABLE_SEPARATOR,
} from "./constants.js";

const HEADER_RE =
  /^\|\s*agent\s*\|\s*target\s*\|\s*branch\s*\|\s*pr\s*\|\s*claimed_at\s*\|\s*expires_at\s*\|\s*$/;
const SEPARATOR_RE = /^\|\s*---\s*\|/;
const ROW_RE =
  /^\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*$/;

function findSection(lines) {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === ACTIVE_CLAIMS_HEADING) return i;
  }
  return -1;
}

function findNextH2(lines, start) {
  for (let i = start; i < lines.length; i++) {
    if (/^## /.test(lines[i])) return i;
  }
  return lines.length;
}

function isEmptyStateCell(cell) {
  return cell === "*None*" || cell === "—";
}

function rowFromMatch(match) {
  const [, agent, target, branch, pr, claimed_at, expires_at] = match;
  if (isEmptyStateCell(agent.trim())) return null;
  return {
    agent: agent.trim(),
    target: target.trim(),
    branch: branch.trim(),
    pr: pr.trim() === "—" || pr.trim() === "" ? null : pr.trim(),
    claimed_at: claimed_at.trim(),
    expires_at: expires_at.trim(),
  };
}

function scanRowsBetween(lines, start, end) {
  const claims = [];
  let inTable = false;
  let seenSeparator = false;
  for (let i = start; i < end; i++) {
    const line = lines[i];
    if (HEADER_RE.test(line)) {
      inTable = true;
      continue;
    }
    if (inTable && SEPARATOR_RE.test(line)) {
      seenSeparator = true;
      continue;
    }
    if (!(inTable && seenSeparator && line.startsWith("|"))) continue;
    const match = line.match(ROW_RE);
    if (!match) continue;
    const row = rowFromMatch(match);
    if (row) claims.push(row);
  }
  return claims;
}

/** Parse the `## Active Claims` table from MEMORY.md text. Returns [] if absent. */
export function parseClaims(memoryText) {
  if (typeof memoryText !== "string") return [];
  const lines = memoryText.split("\n");
  const heading = findSection(lines);
  if (heading === -1) return [];
  const sectionEnd = findNextH2(lines, heading + 1);
  return scanRowsBetween(lines, heading + 1, sectionEnd);
}

function formatRow({ agent, target, branch, pr, claimed_at, expires_at }) {
  const prCell = pr == null || pr === "" ? "—" : pr;
  return `| ${agent} | ${target} | ${branch} | ${prCell} | ${claimed_at} | ${expires_at} |`;
}

function appendNewSection(memoryText, claim) {
  const block = [
    "",
    ACTIVE_CLAIMS_HEADING,
    "",
    ACTIVE_CLAIMS_TABLE_HEADER,
    ACTIVE_CLAIMS_TABLE_SEPARATOR,
    formatRow(claim),
    "",
  ];
  return memoryText.replace(/\n*$/, "") + "\n" + block.join("\n");
}

function findTableIndices(lines, heading, sectionEnd) {
  let headerIdx = -1;
  let separatorIdx = -1;
  for (let i = heading + 1; i < sectionEnd; i++) {
    if (HEADER_RE.test(lines[i])) headerIdx = i;
    if (headerIdx !== -1 && SEPARATOR_RE.test(lines[i])) {
      separatorIdx = i;
      break;
    }
  }
  return { headerIdx, separatorIdx };
}

function insertTableWithRow(lines, heading, sectionEnd, claim) {
  let insertAt = heading + 1;
  while (insertAt < sectionEnd && lines[insertAt].trim() === "") insertAt++;
  while (insertAt < sectionEnd && lines[insertAt].trim() !== "") insertAt++;
  const toInsert = [
    "",
    ACTIVE_CLAIMS_TABLE_HEADER,
    ACTIVE_CLAIMS_TABLE_SEPARATOR,
    formatRow(claim),
  ];
  lines.splice(insertAt, 0, ...toInsert);
  return lines.join("\n");
}

function appendRowAfterTable(lines, sectionEnd, separatorIdx, claim) {
  let lastRowIdx = separatorIdx;
  for (let i = separatorIdx + 1; i < sectionEnd; i++) {
    if (!lines[i].startsWith("|")) break;
    lastRowIdx = i;
  }
  if (lastRowIdx > separatorIdx) {
    const match = lines[lastRowIdx].match(ROW_RE);
    if (match && isEmptyStateCell(match[1].trim())) {
      lines[lastRowIdx] = formatRow(claim);
      return lines.join("\n");
    }
  }
  lines.splice(lastRowIdx + 1, 0, formatRow(claim));
  return lines.join("\n");
}

/** Append a claim row to MEMORY.md text. Refuses if (agent, target) already present. */
export function appendClaim(memoryText, claim, _today) {
  const existing = parseClaims(memoryText);
  if (
    existing.some((c) => c.agent === claim.agent && c.target === claim.target)
  ) {
    return { text: memoryText, inserted: false, reason: "duplicate" };
  }
  const lines = memoryText.split("\n");
  const heading = findSection(lines);
  if (heading === -1) {
    return { text: appendNewSection(memoryText, claim), inserted: true };
  }
  const sectionEnd = findNextH2(lines, heading + 1);
  const { headerIdx, separatorIdx } = findTableIndices(
    lines,
    heading,
    sectionEnd,
  );
  if (headerIdx === -1 || separatorIdx === -1) {
    return {
      text: insertTableWithRow(lines, heading, sectionEnd, claim),
      inserted: true,
    };
  }
  return {
    text: appendRowAfterTable(lines, sectionEnd, separatorIdx, claim),
    inserted: true,
  };
}

/** Remove the claim row matching (agent, target). Idempotent. */
export function removeClaim(memoryText, { agent, target }) {
  const lines = memoryText.split("\n");
  const heading = findSection(lines);
  if (heading === -1) return { text: memoryText, removed: false };
  const sectionEnd = findNextH2(lines, heading + 1);
  for (let i = heading + 1; i < sectionEnd; i++) {
    const match = lines[i].match(ROW_RE);
    if (!match) continue;
    if (match[1].trim() === agent && match[2].trim() === target) {
      lines.splice(i, 1);
      return { text: lines.join("\n"), removed: true };
    }
  }
  return { text: memoryText, removed: false };
}

/** Split claims into active vs expired based on `expires_at >= today`. */
export function filterExpired(claims, today) {
  const active = [];
  const expired = [];
  for (const c of claims) {
    if (!c.expires_at || c.expires_at >= today) active.push(c);
    else expired.push(c);
  }
  return { active, expired };
}
