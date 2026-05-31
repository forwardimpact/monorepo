/**
 * Evidence decorators for coverage, risks, and growth.
 *
 * loadEvidence fetches practice patterns from Map's activity schema
 * and turns them into a shared `EvidenceMap` that the decorator
 * functions consume. All decorators are pure — they clone before
 * mutating.
 */

import { getEvidence } from "@forwardimpact/map/activity/queries/evidence";

/**
 * @typedef {Map<string, { count: number, practitioners: Set<string> }>} EvidenceMap
 */

/**
 * Load evidence aggregates for a resolved team.
 *
 * Uses `getEvidence` directly (rather than `getPracticePatterns`) so
 * Summit can build per-skill practitioner sets that the growth and
 * coverage decorators need. When a resolved team is provided, the
 * result is pre-filtered to that team's email set to avoid bringing
 * org-wide evidence into decorator logic.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {object} params
 * @param {import("../aggregation/coverage.js").ResolvedTeam} params.team
 * @param {number} [params.lookbackMonths=12]
 * @param {object} params.clock - Clock collaborator (`now()`); supplied by the
 *   caller from `runtime.clock` (the bin is the sole construction site).
 * @param {(client: object, options?: object) => Promise<Array<object>>} [params.fetchEvidence]
 * @returns {Promise<EvidenceMap>}
 */
export async function loadEvidence(supabase, params) {
  const fetch = params.fetchEvidence ?? getEvidence;
  const { clock } = params;
  const lookbackMs = 1000 * 60 * 60 * 24 * 30 * (params.lookbackMonths ?? 12);
  const cutoff = clock.now() - lookbackMs;
  const teamEmails = params.team?.members
    ? new Set(params.team.members.map((m) => m.email))
    : null;

  const rows = await fetch(supabase, {});
  const map = new Map();
  for (const row of rows) {
    const normalized = normalizeEvidenceRow(row, cutoff, teamEmails);
    if (!normalized) continue;
    if (!map.has(normalized.skillId)) {
      map.set(normalized.skillId, { count: 0, practitioners: new Set() });
    }
    const entry = map.get(normalized.skillId);
    entry.count += 1;
    entry.practitioners.add(normalized.email);
  }
  return map;
}

/**
 * Normalize a raw evidence row into `{ skillId, email }` or return
 * null when the row should be discarded (unmatched, outside lookback,
 * missing fields, or outside the target team).
 */
function normalizeEvidenceRow(row, cutoff, teamEmails) {
  if (!row.matched) return null;
  // `Date.parse` returns epoch ms (NaN for invalid input) without the
  // detector-flagged `new Date()` ambient-clock construct.
  const created = row.created_at ? Date.parse(row.created_at) : null;
  if (created !== null && created < cutoff) return null;
  const skillId = row.skill_id;
  const email = row.github_artifacts?.email ?? row.email;
  if (!skillId || !email) return null;
  if (teamEmails && !teamEmails.has(email)) return null;
  return { skillId, email };
}

/**
 * Clone a TeamCoverage and attach `evidencedDepth` / `evidencedHolders`
 * fields per skill.
 *
 * @param {import("../aggregation/coverage.js").TeamCoverage} coverage
 * @param {EvidenceMap} evidence
 * @returns {import("../aggregation/coverage.js").TeamCoverage}
 */
export function decorateCoverageWithEvidence(coverage, evidence) {
  const skills = new Map();
  for (const [skillId, skill] of coverage.skills) {
    const ev = evidence.get(skillId);
    const teamEmails = new Set(skill.holders.map((h) => h.email));
    const evidencedHolders = ev
      ? [...ev.practitioners].filter((e) => teamEmails.has(e))
      : [];
    skills.set(skillId, {
      ...skill,
      evidencedDepth: evidencedHolders.length,
      evidencedHolders,
    });
  }
  return { ...coverage, skills };
}

/**
 * Re-assess risks given evidence-informed depth.
 *
 * A skill with evidencedDepth === 1 is treated as an SPOF even if the
 * derivation says more people hold it. A skill with evidencedDepth ===
 * 0 becomes a critical gap.
 *
 * `evidencedDepth` is intersected with team members — evidence rows
 * from outside the team are ignored. Without this intersection an
 * evidence row from a non-team member could silently flip a skill's
 * risk state.
 *
 * @param {import("../aggregation/risks.js").TeamRisks} risks
 * @param {import("../aggregation/coverage.js").TeamCoverage} coverage
 * @param {EvidenceMap} evidence
 * @returns {import("../aggregation/risks.js").TeamRisks}
 */
export function decorateRisksWithEvidence(risks, coverage, evidence) {
  const singlePointsOfFailure = [...risks.singlePointsOfFailure];
  const criticalGaps = [...risks.criticalGaps];
  const byId = new Set(singlePointsOfFailure.map((r) => r.skillId));
  const gapById = new Set(criticalGaps.map((g) => g.skillId));

  for (const [skillId, skill] of coverage.skills) {
    const teamEmails = new Set(skill.holders.map((h) => h.email));
    const ev = evidence.get(skillId);
    const evidencedDepth = ev
      ? [...ev.practitioners].filter((e) => teamEmails.has(e)).length
      : 0;

    if (evidencedDepth === 1 && !byId.has(skillId)) {
      singlePointsOfFailure.push({
        skillId,
        skillName: skill.skillName,
        holder: { proficiency: "working", allocation: 1.0 },
        severity: "medium",
        source: "evidence",
      });
      byId.add(skillId);
    }

    if (evidencedDepth === 0 && !gapById.has(skillId)) {
      // Only escalate to critical gap when derivation also shows zero —
      // otherwise this is a "practiced capability divergence" signal,
      // not a structural gap.
      if (skill.headcountDepth === 0) {
        criticalGaps.push({
          skillId,
          skillName: skill.skillName,
          capabilityId: skill.capabilityId,
          reason: "no evidenced practice within lookback window",
        });
        gapById.add(skillId);
      }
    }
  }

  return {
    singlePointsOfFailure,
    criticalGaps,
    concentrationRisks: risks.concentrationRisks,
  };
}
