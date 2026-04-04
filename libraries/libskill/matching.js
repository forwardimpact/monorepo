/**
 * Engineering Pathway Matching Functions
 *
 * This module provides pure functions for self-assessment validation,
 * job matching, and tier classification.
 */

import {
  getSkillProficiencyIndex,
  getBehaviourMaturityIndex,
} from "@forwardimpact/map/levels";

import { deriveJob, isSeniorLevel } from "./derivation.js";
import { isValidJobCombination } from "./derivation-validation.js";

import {
  THRESHOLD_MATCH_STRONG,
  THRESHOLD_MATCH_GOOD,
  THRESHOLD_MATCH_STRETCH,
  SCORE_GAP,
  WEIGHT_ASSESSMENT_SKILL_DEFAULT,
  WEIGHT_ASSESSMENT_BEHAVIOUR_DEFAULT,
  WEIGHT_SENIOR_BASE,
  WEIGHT_SENIOR_EXPECTATIONS,
  LIMIT_PRIORITY_GAPS,
} from "./policies/thresholds.js";

/**
 * Match tier identifiers
 * @readonly
 * @enum {number}
 */
export const MatchTier = {
  STRONG: 1,
  GOOD: 2,
  STRETCH: 3,
  ASPIRATIONAL: 4,
};

/**
 * Match tier configuration with thresholds and display properties
 * @type {Object<number, {label: string, color: string, minScore: number, description: string}>}
 */
export const CONFIG_MATCH_TIER = {
  [MatchTier.STRONG]: {
    label: "Strong Match",
    color: "green",
    minScore: THRESHOLD_MATCH_STRONG,
    description: "Ready for this role now",
  },
  [MatchTier.GOOD]: {
    label: "Good Match",
    color: "blue",
    minScore: THRESHOLD_MATCH_GOOD,
    description: "Ready within 6-12 months of focused growth",
  },
  [MatchTier.STRETCH]: {
    label: "Stretch Role",
    color: "amber",
    minScore: THRESHOLD_MATCH_STRETCH,
    description: "Ambitious but achievable with dedicated development",
  },
  [MatchTier.ASPIRATIONAL]: {
    label: "Aspirational",
    color: "gray",
    minScore: 0,
    description: "Long-term career goal requiring significant growth",
  },
};

/**
 * Classify a match score into a tier
 * @param {number} score - Match score from 0 to 1
 * @returns {Object} Tier classification
 */
export function classifyMatch(score) {
  if (score >= CONFIG_MATCH_TIER[MatchTier.STRONG].minScore) {
    return { tier: MatchTier.STRONG, ...CONFIG_MATCH_TIER[MatchTier.STRONG] };
  }
  if (score >= CONFIG_MATCH_TIER[MatchTier.GOOD].minScore) {
    return { tier: MatchTier.GOOD, ...CONFIG_MATCH_TIER[MatchTier.GOOD] };
  }
  if (score >= CONFIG_MATCH_TIER[MatchTier.STRETCH].minScore) {
    return { tier: MatchTier.STRETCH, ...CONFIG_MATCH_TIER[MatchTier.STRETCH] };
  }
  return {
    tier: MatchTier.ASPIRATIONAL,
    ...CONFIG_MATCH_TIER[MatchTier.ASPIRATIONAL],
  };
}

/**
 * Score values for different gap sizes
 * @type {Object<number, number>}
 */
export const GAP_SCORES = SCORE_GAP;

/**
 * Calculate gap score with smooth decay
 * @param {number} gap - The gap size (negative = exceeds, positive = below)
 * @returns {number} Score from 0 to 1
 */
export function calculateGapScore(gap) {
  if (gap <= 0) return SCORE_GAP[0];
  if (gap === 1) return SCORE_GAP[1];
  if (gap === 2) return SCORE_GAP[2];
  if (gap === 3) return SCORE_GAP[3];
  return SCORE_GAP[4];
}

/**
 * Calculate skill match score using smooth decay scoring
 * @param {Object<string, string>} selfSkills - Self-assessed skill proficiencies
 * @param {Array} jobSkills - Required job skill proficiencies
 * @returns {{score: number, gaps: Array}}
 */
function calculateSkillScore(selfSkills, jobSkills) {
  if (jobSkills.length === 0) return { score: 1, gaps: [] };

  let totalScore = 0;
  const gaps = [];

  for (const jobSkill of jobSkills) {
    const selfLevel = selfSkills[jobSkill.skillId];
    const requiredIndex = getSkillProficiencyIndex(jobSkill.proficiency);

    if (!selfLevel) {
      const gap = requiredIndex + 1;
      totalScore += calculateGapScore(gap);
      gaps.push({
        id: jobSkill.skillId,
        name: jobSkill.skillName,
        type: "skill",
        current: "none",
        required: jobSkill.proficiency,
        gap,
      });
      continue;
    }

    const selfIndex = getSkillProficiencyIndex(selfLevel);
    const difference = selfIndex - requiredIndex;

    if (difference >= 0) {
      totalScore += 1;
    } else {
      const gap = -difference;
      totalScore += calculateGapScore(gap);
      gaps.push({
        id: jobSkill.skillId,
        name: jobSkill.skillName,
        type: "skill",
        current: selfLevel,
        required: jobSkill.proficiency,
        gap,
      });
    }
  }

  return { score: totalScore / jobSkills.length, gaps };
}

/**
 * Calculate behaviour match score using smooth decay scoring
 * @param {Object<string, string>} selfBehaviours - Self-assessed behaviour maturities
 * @param {Array} jobBehaviours - Required job behaviour maturities
 * @returns {{score: number, gaps: Array}}
 */
function calculateBehaviourScore(selfBehaviours, jobBehaviours) {
  if (jobBehaviours.length === 0) return { score: 1, gaps: [] };

  let totalScore = 0;
  const gaps = [];

  for (const jobBehaviour of jobBehaviours) {
    const selfMaturity = selfBehaviours[jobBehaviour.behaviourId];
    const requiredIndex = getBehaviourMaturityIndex(jobBehaviour.maturity);

    if (!selfMaturity) {
      const gap = requiredIndex + 1;
      totalScore += calculateGapScore(gap);
      gaps.push({
        id: jobBehaviour.behaviourId,
        name: jobBehaviour.behaviourName,
        type: "behaviour",
        current: "none",
        required: jobBehaviour.maturity,
        gap,
      });
      continue;
    }

    const selfIndex = getBehaviourMaturityIndex(selfMaturity);
    const difference = selfIndex - requiredIndex;

    if (difference >= 0) {
      totalScore += 1;
    } else {
      const gap = -difference;
      totalScore += calculateGapScore(gap);
      gaps.push({
        id: jobBehaviour.behaviourId,
        name: jobBehaviour.behaviourName,
        type: "behaviour",
        current: selfMaturity,
        required: jobBehaviour.maturity,
        gap,
      });
    }
  }

  return { score: totalScore / jobBehaviours.length, gaps };
}

/**
 * Calculate expectations match score for senior roles
 * @param {Object} selfExpectations - Self-assessed expectations
 * @param {Object} jobExpectations - Required level expectations
 * @returns {number} Score from 0 to 1
 */
function calculateExpectationsScore(selfExpectations, jobExpectations) {
  if (!selfExpectations || !jobExpectations) return 0;

  const fields = ["scope", "autonomy", "influence"];
  let matches = 0;
  let total = 0;

  for (const field of fields) {
    if (jobExpectations[field]) {
      total++;
      if (selfExpectations[field]) {
        matches++;
      }
    }
  }

  return total > 0 ? matches / total : 0;
}

/**
 * Calculate job match analysis between a self-assessment and a job
 * @param {Object} selfAssessment - The self-assessment
 * @param {Object} job - The job definition
 * @returns {Object} MatchAnalysis
 */
export function calculateJobMatch(selfAssessment, job) {
  const skillWeight =
    job.track?.assessmentWeights?.skillWeight ??
    WEIGHT_ASSESSMENT_SKILL_DEFAULT;
  const behaviourWeight =
    job.track?.assessmentWeights?.behaviourWeight ??
    WEIGHT_ASSESSMENT_BEHAVIOUR_DEFAULT;

  const skillResult = calculateSkillScore(
    selfAssessment.skillProficiencies || {},
    job.skillMatrix,
  );
  const behaviourResult = calculateBehaviourScore(
    selfAssessment.behaviourMaturities || {},
    job.behaviourProfile,
  );

  let overallScore =
    skillResult.score * skillWeight + behaviourResult.score * behaviourWeight;

  let expectationsScore = undefined;
  if (isSeniorLevel(job.level)) {
    expectationsScore = calculateExpectationsScore(
      selfAssessment.expectations,
      job.expectations,
    );
    overallScore =
      overallScore * WEIGHT_SENIOR_BASE +
      expectationsScore * WEIGHT_SENIOR_EXPECTATIONS;
  }

  const allGaps = [...skillResult.gaps, ...behaviourResult.gaps];
  allGaps.sort((a, b) => b.gap - a.gap);

  const tier = classifyMatch(overallScore);
  const priorityGaps = allGaps.slice(0, LIMIT_PRIORITY_GAPS);

  const result = {
    overallScore,
    skillScore: skillResult.score,
    behaviourScore: behaviourResult.score,
    weightsUsed: { skillWeight, behaviourWeight },
    gaps: allGaps,
    tier,
    priorityGaps,
  };

  if (expectationsScore !== undefined) {
    result.expectationsScore = expectationsScore;
  }

  return result;
}

/**
 * Find matching jobs for a self-assessment
 * @param {Object} params
 * @param {Object} params.selfAssessment - The self-assessment
 * @param {Array} params.disciplines - All disciplines
 * @param {Array} params.levels - All levels
 * @param {Array} params.tracks - All tracks
 * @param {Array} params.skills - All skills
 * @param {Array} params.behaviours - All behaviours
 * @param {Object} [params.validationRules] - Optional validation rules
 * @param {number} [params.topN=10] - Number of top matches to return
 * @returns {Array} Ranked job matches
 */
export function findMatchingJobs({
  selfAssessment,
  disciplines,
  levels,
  tracks,
  skills,
  behaviours,
  validationRules,
  topN = 10,
}) {
  const matches = [];

  for (const discipline of disciplines) {
    for (const level of levels) {
      if (
        !isValidJobCombination({
          discipline,
          level,
          track: null,
          validationRules,
          levels,
        })
      ) {
        continue;
      }

      const job = deriveJob({
        discipline,
        level,
        track: null,
        skills,
        behaviours,
        validationRules,
      });

      if (job) {
        const analysis = calculateJobMatch(selfAssessment, job);
        matches.push({ job, analysis });
      }
    }

    for (const track of tracks) {
      for (const level of levels) {
        if (
          !isValidJobCombination({
            discipline,
            level,
            track,
            validationRules,
            levels,
          })
        ) {
          continue;
        }

        const job = deriveJob({
          discipline,
          level,
          track,
          skills,
          behaviours,
          validationRules,
        });

        if (!job) continue;

        const analysis = calculateJobMatch(selfAssessment, job);
        matches.push({ job, analysis });
      }
    }
  }

  matches.sort((a, b) => b.analysis.overallScore - a.analysis.overallScore);
  return matches.slice(0, topN);
}

/**
 * Estimate the best-fit level rank for a self-assessment
 * @param {Object} params
 * @param {Object} params.selfAssessment - The self-assessment
 * @param {Array} params.levels - All levels
 * @param {Array} params.skills - All skills
 * @returns {{level: Object, confidence: number, averageSkillIndex: number}}
 */
export function estimateBestFitLevel({ selfAssessment, levels, _skills }) {
  const assessedSkills = Object.entries(
    selfAssessment.skillProficiencies || {},
  );

  if (assessedSkills.length === 0) {
    const sortedLevels = [...levels].sort(
      (a, b) => a.ordinalRank - b.ordinalRank,
    );
    return { level: sortedLevels[0], confidence: 0, averageSkillIndex: 0 };
  }

  let totalIndex = 0;
  for (const [, level] of assessedSkills) {
    totalIndex += getSkillProficiencyIndex(level);
  }
  const averageSkillIndex = totalIndex / assessedSkills.length;

  const sortedLevels = [...levels].sort(
    (a, b) => a.ordinalRank - b.ordinalRank,
  );

  let bestLevel = sortedLevels[0],
    minDistance = Infinity;

  for (const level of sortedLevels) {
    const primaryLevelIndex = getSkillProficiencyIndex(
      level.baseSkillProficiencies?.primary || "awareness",
    );
    const distance = Math.abs(averageSkillIndex - primaryLevelIndex);
    if (distance < minDistance) {
      minDistance = distance;
      bestLevel = level;
    }
  }

  const confidence = Math.max(0, 1 - minDistance / 2);
  return { level: bestLevel, confidence, averageSkillIndex };
}

export {
  deriveDevelopmentPath,
  findNextStepJob,
  analyzeCandidate,
  findRealisticMatches,
} from "./matching-development.js";
