/**
 * Development Path and Candidate Analysis
 *
 * Pure functions for deriving development paths and analyzing candidates.
 * Extracted from matching.js to satisfy max-lines and complexity rules.
 */

import {
  getSkillProficiencyIndex,
  getBehaviourMaturityIndex,
} from "@forwardimpact/map/levels";

import { deriveJob } from "./derivation.js";
import { isValidJobCombination } from "./derivation-validation.js";

import {
  WEIGHT_DEV_TYPE_PRIMARY,
  WEIGHT_DEV_TYPE_SECONDARY,
  WEIGHT_DEV_TYPE_BROAD,
  WEIGHT_DEV_AI_BOOST,
  WEIGHT_SAME_TRACK_BONUS,
} from "./policies/thresholds.js";

import {
  calculateJobMatch,
  findMatchingJobs,
  estimateBestFitLevel,
} from "./matching.js";

import {
  RANGE_LEVEL_OFFSET,
  RANGE_READY_LEVEL_OFFSET,
} from "./policies/thresholds.js";

/**
 * Type weight lookup for development path priority
 * @type {Object<string, number>}
 */
const DEV_TYPE_WEIGHTS = {
  primary: WEIGHT_DEV_TYPE_PRIMARY,
  secondary: WEIGHT_DEV_TYPE_SECONDARY,
};

/**
 * Calculate development priority for a skill gap
 * @param {number} gapSize - Gap in proficiency levels
 * @param {string} skillType - Skill type (primary/secondary/broad)
 * @param {string} capability - Capability ID
 * @returns {number} Priority score
 */
function calculateSkillDevPriority(gapSize, skillType, capability) {
  const typeMultiplier = DEV_TYPE_WEIGHTS[skillType] || WEIGHT_DEV_TYPE_BROAD;
  const aiBoost = capability === "ai" ? WEIGHT_DEV_AI_BOOST : 1;
  return gapSize * typeMultiplier * aiBoost;
}

/**
 * Get rationale text for a skill type
 * @param {string} skillType - Skill type
 * @returns {string} Rationale text
 */
function getSkillRationale(skillType) {
  if (skillType === "primary") {
    return "Primary skill for this discipline - essential for the role";
  }
  if (skillType === "secondary") {
    return "Secondary skill - important for full effectiveness";
  }
  return "Broad skill - needed for collaboration and context";
}

/**
 * Derive a development path from current self-assessment to a target job
 * @param {Object} params
 * @param {Object} params.selfAssessment - Current self-assessment
 * @param {Object} params.targetJob - Target job
 * @returns {Object} DevelopmentPath
 */
export function deriveDevelopmentPath({ selfAssessment, targetJob }) {
  const items = [];

  for (const jobSkill of targetJob.skillMatrix) {
    const selfLevel = selfAssessment.skillProficiencies?.[jobSkill.skillId];
    const selfIndex = selfLevel ? getSkillProficiencyIndex(selfLevel) : -1;
    const targetIndex = getSkillProficiencyIndex(jobSkill.proficiency);

    if (selfIndex < targetIndex) {
      const gapSize = targetIndex - selfIndex;
      items.push({
        id: jobSkill.skillId,
        name: jobSkill.skillName,
        type: "skill",
        currentLevel: selfLevel || "none",
        targetLevel: jobSkill.proficiency,
        priority: calculateSkillDevPriority(
          gapSize,
          jobSkill.type,
          jobSkill.capability,
        ),
        rationale: getSkillRationale(jobSkill.type),
      });
    }
  }

  for (const jobBehaviour of targetJob.behaviourProfile) {
    const selfMaturity =
      selfAssessment.behaviourMaturities?.[jobBehaviour.behaviourId];
    const selfIndex = selfMaturity
      ? getBehaviourMaturityIndex(selfMaturity)
      : -1;
    const targetIndex = getBehaviourMaturityIndex(jobBehaviour.maturity);

    if (selfIndex < targetIndex) {
      items.push({
        id: jobBehaviour.behaviourId,
        name: jobBehaviour.behaviourName,
        type: "behaviour",
        currentLevel: selfMaturity || "none",
        targetLevel: jobBehaviour.maturity,
        priority: targetIndex - selfIndex,
        rationale:
          "Required behaviour - important for professional effectiveness",
      });
    }
  }

  items.sort((a, b) => b.priority - a.priority);

  const matchAnalysis = calculateJobMatch(selfAssessment, targetJob);

  return {
    targetJob,
    items,
    estimatedReadiness: matchAnalysis.overallScore,
  };
}

/**
 * Find the best next step job (one level rank up) based on current assessment
 * @param {Object} params
 * @param {Object} params.selfAssessment - The self-assessment
 * @param {Object} params.currentJob - Current job (or best match)
 * @param {Object} params._disciplines - All disciplines (unused)
 * @param {Array} params.levels - All levels (sorted by level)
 * @param {Array} params.tracks - All tracks
 * @param {Array} params.skills - All skills
 * @param {Array} params.behaviours - All behaviours
 * @param {Object} [params.validationRules] - Optional validation rules
 * @returns {Object|null} Best next-step job or null if at top
 */
export function findNextStepJob({
  selfAssessment,
  currentJob,
  _disciplines,
  levels,
  tracks,
  skills,
  behaviours,
  validationRules,
}) {
  const currentLevelLevel = currentJob.level.ordinalRank;

  const sortedLevels = [...levels].sort(
    (a, b) => a.ordinalRank - b.ordinalRank,
  );
  const nextLevel = sortedLevels.find((g) => g.ordinalRank > currentLevelLevel);

  if (!nextLevel) return null;

  const candidates = [];

  for (const track of tracks) {
    if (
      isValidJobCombination({
        discipline: currentJob.discipline,
        level: nextLevel,
        track,
        validationRules,
        levels,
      })
    ) {
      const job = deriveJob({
        discipline: currentJob.discipline,
        level: nextLevel,
        track,
        skills,
        behaviours,
        validationRules,
      });

      if (job) {
        const analysis = calculateJobMatch(selfAssessment, job);
        const trackBonus =
          track.id === currentJob.track.id ? WEIGHT_SAME_TRACK_BONUS : 0;
        candidates.push({
          job,
          analysis,
          adjustedScore: analysis.overallScore + trackBonus,
        });
      }
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.adjustedScore - a.adjustedScore);

  return { job: candidates[0].job, analysis: candidates[0].analysis };
}

/**
 * Comprehensive analysis of a candidate's self-assessment
 * @param {Object} params
 * @param {Object} params.selfAssessment - The self-assessment
 * @param {Array} params.disciplines - All disciplines
 * @param {Array} params.levels - All levels
 * @param {Array} params.tracks - All tracks
 * @param {Array} params.skills - All skills
 * @param {Array} params.behaviours - All behaviours
 * @param {Object} [params.validationRules] - Optional validation rules
 * @param {number} [params.topN=5] - Number of top job matches to return
 * @returns {Object} Comprehensive analysis
 */
export function analyzeCandidate({
  selfAssessment,
  disciplines,
  levels,
  tracks,
  skills,
  behaviours,
  validationRules,
  topN = 5,
}) {
  const matches = findMatchingJobs({
    selfAssessment,
    disciplines,
    levels,
    tracks,
    skills,
    behaviours,
    validationRules,
    topN,
  });

  const bestMatch = matches[0];
  const developmentPath = bestMatch
    ? deriveDevelopmentPath({ selfAssessment, targetJob: bestMatch.job })
    : null;

  const skillProfile = {};
  for (const [skillId, level] of Object.entries(
    selfAssessment.skillProficiencies || {},
  )) {
    const skill = skills.find((s) => s.id === skillId);
    if (skill) {
      skillProfile[skillId] = {
        name: skill.name,
        capability: skill.capability,
        level,
      };
    }
  }

  const behaviourProfile = {};
  for (const [behaviourId, maturity] of Object.entries(
    selfAssessment.behaviourMaturities || {},
  )) {
    const behaviour = behaviours.find((b) => b.id === behaviourId);
    if (behaviour) {
      behaviourProfile[behaviourId] = {
        name: behaviour.name,
        maturity,
      };
    }
  }

  return {
    selfAssessment,
    topMatches: matches,
    bestMatch,
    developmentPath,
    skillProfile,
    behaviourProfile,
  };
}

/**
 * Find realistic job matches with tier filtering
 * @param {Object} params
 * @param {Object} params.selfAssessment - The self-assessment
 * @param {Array} params.disciplines - All disciplines
 * @param {Array} params.levels - All levels
 * @param {Array} params.tracks - All tracks
 * @param {Array} params.skills - All skills
 * @param {Array} params.behaviours - All behaviours
 * @param {Object} [params.validationRules] - Optional validation rules
 * @param {boolean} [params.filterByLevel=true] - Whether to filter to +/-1 level
 * @param {number} [params.topN=20] - Maximum matches to return
 * @returns {Object} Matches grouped by tier with metadata
 */
export function findRealisticMatches({
  selfAssessment,
  disciplines,
  levels,
  tracks,
  skills,
  behaviours,
  validationRules,
  filterByLevel = true,
  topN = 20,
}) {
  const estimatedLevel = estimateBestFitLevel({
    selfAssessment,
    levels,
    skills,
  });

  const bestFitLevel = estimatedLevel.level.ordinalRank;
  const levelRange = {
    min: bestFitLevel - RANGE_LEVEL_OFFSET,
    max: bestFitLevel + RANGE_LEVEL_OFFSET,
  };

  const allMatches = findMatchingJobs({
    selfAssessment,
    disciplines,
    levels,
    tracks,
    skills,
    behaviours,
    validationRules,
    topN: 100,
  });

  let filteredMatches = allMatches;
  if (filterByLevel) {
    filteredMatches = allMatches.filter(
      (m) =>
        m.job.level.ordinalRank >= levelRange.min &&
        m.job.level.ordinalRank <= levelRange.max,
    );
  }

  const matchesByTier = { 1: [], 2: [], 3: [], 4: [] };
  for (const match of filteredMatches)
    matchesByTier[match.analysis.tier.tier].push(match);

  for (const tierNum of Object.keys(matchesByTier)) {
    matchesByTier[tierNum].sort((a, b) => {
      const levelDiff = b.job.level.ordinalRank - a.job.level.ordinalRank;
      if (levelDiff !== 0) return levelDiff;
      return b.analysis.overallScore - a.analysis.overallScore;
    });
  }

  const strongAndGoodMatches = [...matchesByTier[1], ...matchesByTier[2]];
  let highestMatchedLevel = 0;
  for (const match of strongAndGoodMatches) {
    if (match.job.level.ordinalRank > highestMatchedLevel) {
      highestMatchedLevel = match.job.level.ordinalRank;
    }
  }

  if (highestMatchedLevel > 0) {
    const minLevelForReady = highestMatchedLevel - RANGE_READY_LEVEL_OFFSET;
    const minLevelForStretch = highestMatchedLevel;

    matchesByTier[1] = matchesByTier[1].filter(
      (m) => m.job.level.ordinalRank >= minLevelForReady,
    );
    matchesByTier[2] = matchesByTier[2].filter(
      (m) => m.job.level.ordinalRank >= minLevelForReady,
    );
    matchesByTier[3] = matchesByTier[3].filter(
      (m) => m.job.level.ordinalRank >= minLevelForStretch,
    );
    matchesByTier[4] = matchesByTier[4].filter(
      (m) => m.job.level.ordinalRank >= minLevelForStretch,
    );
  }

  const allFilteredMatches = [
    ...matchesByTier[1],
    ...matchesByTier[2],
    ...matchesByTier[3],
    ...matchesByTier[4],
  ];

  return {
    matches: allFilteredMatches.slice(0, topN),
    matchesByTier,
    estimatedLevel: {
      level: estimatedLevel.level,
      confidence: estimatedLevel.confidence,
    },
    levelRange,
  };
}
