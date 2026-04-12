/**
 * Shared evidence helpers reused across evidence-based commands.
 * All functions are pure.
 */

import { SKILL_PROFICIENCY_ORDER } from "@forwardimpact/map/levels";

/**
 * Group raw evidence rows by skillId.
 * @param {Array<object>} evidenceRows
 * @returns {Map<string, {matched: number, unmatched: number, rows: Array<object>}>}
 */
export function groupEvidenceBySkill(evidenceRows) {
  const groups = new Map();
  for (const row of evidenceRows) {
    const key = row.skill_id;
    if (!groups.has(key)) {
      groups.set(key, { matched: 0, unmatched: 0, rows: [] });
    }
    const g = groups.get(key);
    g.rows.push(row);
    if (row.matched) g.matched++;
    else g.unmatched++;
  }
  return groups;
}

/**
 * Group evidence rows by ISO quarter (YYYY-QN) derived from created_at.
 * @param {Array<object>} evidenceRows
 * @returns {Map<string, Array<object>>}
 */
export function groupEvidenceByQuarter(evidenceRows) {
  const groups = new Map();
  for (const row of evidenceRows) {
    const q = toQuarter(row.created_at);
    if (!groups.has(q)) groups.set(q, []);
    groups.get(q).push(row);
  }
  return groups;
}

/**
 * Pick the highest matched level per (quarter, skill).
 * @param {Array<object>} evidenceRows
 * @returns {Array<{quarter: string, skillId: string, highestLevel: string}>}
 */
export function highestLevelPerSkillPerQuarter(evidenceRows) {
  // Group by quarter, then by skill
  const byQuarter = groupEvidenceByQuarter(evidenceRows);
  const results = [];

  for (const [quarter, rows] of byQuarter) {
    const bySkill = new Map();
    for (const row of rows) {
      if (!row.matched) continue;
      const key = row.skill_id;
      const currentIdx = bySkill.get(key) ?? -1;
      const rowIdx = SKILL_PROFICIENCY_ORDER.indexOf(row.level_id);
      if (rowIdx > currentIdx) {
        bySkill.set(key, rowIdx);
      }
    }
    for (const [skillId, idx] of bySkill) {
      results.push({
        quarter,
        skillId,
        highestLevel: SKILL_PROFICIENCY_ORDER[idx],
      });
    }
  }

  results.sort(
    (a, b) =>
      a.quarter.localeCompare(b.quarter) || a.skillId.localeCompare(b.skillId),
  );
  return results;
}

/**
 * Build a readiness checklist from target markers and evidence rows.
 * @param {object} markers - Markers at the target proficiency level ({human: string[], agent: string[]}).
 * @param {Array<object>} evidenceRows - Evidence rows filtered to this person.
 * @returns {Array<{marker: string, variant: string, evidenced: boolean, artifactId?: string, rationale?: string}>}
 */
export function buildMarkerChecklist(markers, evidenceRows) {
  const checklist = [];

  for (const variant of ["human", "agent"]) {
    const markerTexts = markers[variant] ?? [];
    for (const marker of markerTexts) {
      const match = evidenceRows.find(
        (e) => e.matched && e.marker_text === marker,
      );
      checklist.push({
        marker,
        variant,
        evidenced: !!match,
        artifactId: match?.artifact_id ?? null,
        rationale: match?.rationale ?? null,
      });
    }
  }

  return checklist;
}

/**
 * Compute coverage ratio: (artifacts with >= 1 evidence row) / (total artifacts).
 * @param {Array<object>} artifacts - All artifacts.
 * @param {Array<object>} unscoredArtifacts - Artifacts without evidence.
 * @returns {{scored: number, total: number, ratio: number}}
 */
export function computeCoverageRatio(artifacts, unscoredArtifacts) {
  const total = artifacts.length;
  const unscored = unscoredArtifacts.length;
  const scored = total - unscored;
  const ratio = total > 0 ? scored / total : 0;
  return { scored, total, ratio };
}

/**
 * Filter evidence rows to only those belonging to a set of team emails.
 * Evidence rows carry the email via the joined github_artifacts record.
 * @param {Array<object>} evidenceRows
 * @param {Set<string>} teamEmails
 * @returns {Array<object>}
 */
export function filterEvidenceByTeam(evidenceRows, teamEmails) {
  return evidenceRows.filter((row) => {
    const email = row.github_artifacts?.email;
    return email && teamEmails.has(email);
  });
}

/**
 * Convert an ISO date string to a quarter label (YYYY-QN).
 * @param {string} dateStr
 * @returns {string}
 */
function toQuarter(dateStr) {
  if (!dateStr) return "unknown";
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const month = d.getMonth(); // 0-based
  const q = Math.floor(month / 3) + 1;
  return `${year}-Q${q}`;
}
