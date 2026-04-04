/**
 * Cross-content validation — pure function over the entity graph.
 *
 * @module libuniverse/validate
 */

import { PROFICIENCY_LEVELS } from "@forwardimpact/libsyntheticgen/vocabulary.js";
import {
  checkWebhookPayloadSchemas,
  checkWebhookDeliveryIds,
  checkWebhookSenderUsernames,
  checkGetDXTeamsResponse,
  checkGetDXSnapshotsListResponse,
  checkGetDXSnapshotsInfoResponses,
  checkSnapshotScoreDriverIds,
  checkScoreTrajectories,
  checkEvidenceProficiency,
  checkEvidenceSkillIds,
  checkInitiativeScorecardRefs,
  checkInitiativeOwnerEmails,
  checkInitiativeDriverRefs,
  checkCommentSnapshotRefs,
  checkCommentEmailRefs,
  checkCommentTeamRefs,
  checkScorecardCheckIds,
  checkRosterSnapshotQuarters,
  checkProjectTeamEmails,
} from "./validate-activity.js";

/**
 * Validate cross-content integrity of generated entities.
 * @param {object} entities
 * @returns {{passed: boolean, total: number, failures: number, checks: object[]}}
 */
export function validateCrossContent(entities) {
  const checks = [
    checkPeopleCoverage(entities),
    checkPathwayValidity(entities),
    checkRosterCompleteness(entities),
    checkTeamAssignments(entities),
    checkManagerReferences(entities),
    checkGithubUsernames(entities),
    checkWebhookPayloadSchemas(entities),
    checkWebhookDeliveryIds(entities),
    checkWebhookSenderUsernames(entities),
    checkGetDXTeamsResponse(entities),
    checkGetDXSnapshotsListResponse(entities),
    checkGetDXSnapshotsInfoResponses(entities),
    checkSnapshotScoreDriverIds(entities),
    checkScoreTrajectories(entities),
    checkEvidenceProficiency(entities),
    checkEvidenceSkillIds(entities),
    checkInitiativeScorecardRefs(entities),
    checkInitiativeOwnerEmails(entities),
    checkInitiativeDriverRefs(entities),
    checkCommentSnapshotRefs(entities),
    checkCommentEmailRefs(entities),
    checkCommentTeamRefs(entities),
    checkScorecardCheckIds(entities),
    checkRosterSnapshotQuarters(entities),
    checkProjectTeamEmails(entities),
    checkProseLength(entities),
    checkProficiencyMonotonicity(entities),
    checkSelfAssessmentPlausibility(entities),
  ];

  const failures = checks.filter((c) => !c.passed);
  return {
    passed: failures.length === 0,
    total: checks.length,
    failures: failures.length,
    checks,
  };
}

// ─── Check functions ─────────────────────────────

function checkPeopleCoverage(entities) {
  const teamIds = new Set(entities.teams.map((t) => t.id));
  const uncovered = entities.people.filter((p) => !teamIds.has(p.team_id));
  return {
    name: "people_coverage",
    passed: uncovered.length === 0,
    message:
      uncovered.length === 0
        ? "All people assigned to valid teams"
        : `${uncovered.length} people assigned to unknown teams`,
  };
}

function validateDisciplineSkills(disciplines, skillIds) {
  const errors = [];
  for (const disc of disciplines || []) {
    for (const skillId of [
      ...(disc.core || []),
      ...(disc.supporting || []),
      ...(disc.broad || []),
    ]) {
      if (!skillIds.has(skillId)) {
        errors.push(
          `Discipline '${disc.id}' references unknown skill '${skillId}'`,
        );
      }
    }
  }
  return errors;
}

function validateDriverRefs(drivers, skillIds, behaviourIds) {
  const errors = [];
  for (const driver of drivers || []) {
    for (const skillId of driver.skills || []) {
      if (!skillIds.has(skillId)) {
        errors.push(
          `Driver '${driver.id}' references unknown skill '${skillId}'`,
        );
      }
    }
    for (const behId of driver.behaviours || []) {
      if (!behaviourIds.has(behId)) {
        errors.push(
          `Driver '${driver.id}' references unknown behaviour '${behId}'`,
        );
      }
    }
  }
  return errors;
}

function checkPathwayValidity(entities) {
  const fw = entities.framework;
  const hasFramework = fw && fw.proficiencies && fw.proficiencies.length > 0;
  const hasPathwayEntities =
    fw?.capabilities?.length > 0 && typeof fw.capabilities[0] === "object";

  if (!hasPathwayEntities) {
    return {
      name: "pathway_validity",
      passed: !!hasFramework,
      message: hasFramework
        ? "Framework config present with proficiencies"
        : "Missing framework configuration or proficiencies",
    };
  }

  const skillIds = new Set(fw.capabilities.flatMap((c) => c.skills || []));
  const behaviourIds = new Set(fw.behaviours.map((b) => b.id));
  const errors = [
    ...validateDisciplineSkills(fw.disciplines, skillIds),
    ...validateDriverRefs(fw.drivers, skillIds, behaviourIds),
  ];

  return {
    name: "pathway_validity",
    passed: errors.length === 0,
    message:
      errors.length === 0
        ? "Pathway data structure valid with cross-references"
        : `Pathway errors: ${errors.join("; ")}`,
  };
}

function checkRosterCompleteness(entities) {
  const roster = entities.activity?.roster || [];
  const hasAll = entities.people.every((p) =>
    roster.some((r) => r.email === p.email),
  );
  return {
    name: "roster_completeness",
    passed: hasAll,
    message: hasAll
      ? "All people present in activity roster"
      : "Some people missing from activity roster",
  };
}

function checkTeamAssignments(entities) {
  const teamSizes = new Map();
  for (const person of entities.people) {
    teamSizes.set(person.team_id, (teamSizes.get(person.team_id) || 0) + 1);
  }
  const emptyTeams = entities.teams.filter(
    (t) => (teamSizes.get(t.id) || 0) === 0,
  );
  return {
    name: "team_assignments",
    passed: emptyTeams.length === 0,
    message:
      emptyTeams.length === 0
        ? "All teams have at least one member"
        : `${emptyTeams.length} teams have no members`,
  };
}

function checkManagerReferences(entities) {
  const managers = entities.people.filter((p) => p.is_manager);
  const teamIds = new Set(entities.teams.map((t) => t.id));
  const orphaned = managers.filter((m) => !teamIds.has(m.team_id));
  return {
    name: "manager_references",
    passed: orphaned.length === 0,
    message:
      orphaned.length === 0
        ? "All managers reference valid teams"
        : `${orphaned.length} managers reference unknown teams`,
  };
}

function checkGithubUsernames(entities) {
  const usernames = entities.people.map((p) => p.github).filter(Boolean);
  const unique = new Set(usernames);
  return {
    name: "github_usernames",
    passed: unique.size === usernames.length,
    message:
      unique.size === usernames.length
        ? "All GitHub usernames are unique"
        : `${usernames.length - unique.size} duplicate GitHub usernames`,
  };
}

// ─── E1: Prose length validation ────────────────

const PROSE_RANGES = {
  description: { min: 50, max: 2000 },
  proficiencyDescription: { min: 20, max: 500 },
  maturityDescription: { min: 20, max: 500 },
};

function validateDescriptionLengths(items, label) {
  const errors = [];
  for (const item of items || []) {
    if (typeof item !== "object" || !item.description) continue;
    const len = item.description.length;
    if (
      len < PROSE_RANGES.description.min ||
      len > PROSE_RANGES.description.max
    ) {
      errors.push(
        `${label} '${item.id || item.name}' description: ${len} chars`,
      );
    }
  }
  return errors;
}

function checkProseLength(entities) {
  const fw = entities.framework;
  if (!fw)
    return { name: "prose_length", passed: true, message: "No framework data" };

  const errors = [
    ...validateDescriptionLengths(fw.capabilities, "Capability"),
    ...validateDescriptionLengths(fw.behaviours, "Behaviour"),
  ];

  return {
    name: "prose_length",
    passed: errors.length === 0,
    message:
      errors.length === 0
        ? "All prose fields within expected length range"
        : `${errors.length} prose fields outside range: ${errors.slice(0, 3).join("; ")}`,
  };
}

// ─── E2: Proficiency monotonicity ──────────────

const PROF_INDEX = Object.fromEntries(PROFICIENCY_LEVELS.map((p, i) => [p, i]));

function collectAllSkillIds(levels, levelIds) {
  const skillIds = new Set();
  for (const levelId of levelIds) {
    const baselines =
      levels[levelId]?.baselines || levels[levelId]?.skillBaselines || {};
    for (const skillId of Object.keys(baselines)) {
      skillIds.add(skillId);
    }
  }
  return skillIds;
}

function getBaselines(levels, levelId) {
  return levels[levelId]?.baselines || levels[levelId]?.skillBaselines || {};
}

function findMonotonicityViolations(levels, levelIds, skillIds) {
  const violations = [];
  for (const skillId of skillIds) {
    let prevIdx = -1;
    for (const levelId of levelIds) {
      const prof = getBaselines(levels, levelId)[skillId];
      if (!prof || PROF_INDEX[prof] === undefined) continue;
      const idx = PROF_INDEX[prof];
      if (idx < prevIdx) {
        violations.push(`Skill '${skillId}' decreases at level '${levelId}'`);
      }
      prevIdx = idx;
    }
  }
  return violations;
}

function checkProficiencyMonotonicity(entities) {
  const pathway = entities.pathway;
  if (!pathway?.levels) {
    return {
      name: "proficiency_monotonicity",
      passed: true,
      message: "No pathway level data",
    };
  }

  const levels = pathway.levels;
  const levelIds = Object.keys(levels);
  if (levelIds.length < 2) {
    return {
      name: "proficiency_monotonicity",
      passed: true,
      message: "Fewer than 2 levels",
    };
  }

  const skillIds = collectAllSkillIds(levels, levelIds);
  const violations = findMonotonicityViolations(levels, levelIds, skillIds);

  return {
    name: "proficiency_monotonicity",
    passed: violations.length === 0,
    message:
      violations.length === 0
        ? "All skill proficiencies are non-decreasing across levels"
        : `${violations.length} monotonicity violations: ${violations.slice(0, 3).join("; ")}`,
  };
}

// ─── E3: Self-assessment plausibility ──────────

function checkSelfAssessmentPlausibility(entities) {
  const pathway = entities.pathway;
  if (!pathway?.selfAssessments) {
    return {
      name: "self_assessment_plausibility",
      passed: true,
      message: "No self-assessment data",
    };
  }

  const assessments = pathway.selfAssessments;
  if (!Array.isArray(assessments) || assessments.length === 0) {
    return {
      name: "self_assessment_plausibility",
      passed: true,
      message: "No self-assessments",
    };
  }

  const violations = [];
  const threshold = 2; // Allow ±2 deviation from expected

  for (let i = 0; i < assessments.length; i++) {
    const assessment = assessments[i];
    const profs = Object.values(assessment.skillProficiencies || {});
    if (profs.length === 0) continue;

    const indices = profs
      .map((p) => PROF_INDEX[p])
      .filter((idx) => idx !== undefined);
    if (indices.length === 0) continue;

    const median = indices.sort((a, b) => a - b)[
      Math.floor(indices.length / 2)
    ];
    const expectedBase = Math.min(i, PROFICIENCY_LEVELS.length - 1);

    if (Math.abs(median - expectedBase) > threshold) {
      violations.push(
        `Assessment '${assessment.id}': median proficiency ${median} vs expected ~${expectedBase}`,
      );
    }
  }

  return {
    name: "self_assessment_plausibility",
    passed: violations.length === 0,
    message:
      violations.length === 0
        ? "Self-assessment distributions are plausible"
        : `${violations.length} implausible assessments: ${violations.slice(0, 3).join("; ")}`,
  };
}

/**
 * Content validator class with DI.
 */
export class ContentValidator {
  /**
   * @param {object} logger - Logger instance
   */
  constructor(logger) {
    if (!logger) throw new Error("logger is required");
    this.logger = logger;
  }

  /**
   * Validate cross-content integrity of generated entities.
   * @param {object} entities
   * @returns {{passed: boolean, total: number, failures: number, checks: object[]}}
   */
  validate(entities) {
    return validateCrossContent(entities);
  }
}
