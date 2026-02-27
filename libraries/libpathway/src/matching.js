/**
 * Engineering Pathway Matching Functions
 *
 * This module provides pure functions for self-assessment validation,
 * job matching, and development path derivation.
 */

import {
  getSkillProficiencyIndex,
  getBehaviourMaturityIndex,
} from "@forwardimpact/map/levels";

import {
  deriveJob,
  isValidJobCombination,
  isSeniorLevel,
} from "./derivation.js";

import {
  THRESHOLD_MATCH_STRONG,
  THRESHOLD_MATCH_GOOD,
  THRESHOLD_MATCH_STRETCH,
  SCORE_GAP,
  WEIGHT_DEV_TYPE_PRIMARY,
  WEIGHT_DEV_TYPE_SECONDARY,
  WEIGHT_DEV_TYPE_BROAD,
  WEIGHT_DEV_AI_BOOST,
  WEIGHT_ASSESSMENT_SKILL_DEFAULT,
  WEIGHT_ASSESSMENT_BEHAVIOUR_DEFAULT,
  WEIGHT_SENIOR_BASE,
  WEIGHT_SENIOR_EXPECTATIONS,
  LIMIT_PRIORITY_GAPS,
  WEIGHT_SAME_TRACK_BONUS,
  RANGE_LEVEL_OFFSET,
  RANGE_READY_LEVEL_OFFSET,
} from "./policies/thresholds.js";

// ============================================================================
// Match Tier Types and Constants
// ============================================================================

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
 * Uses threshold constants from policies/thresholds.js
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
 * @typedef {Object} MatchTierInfo
 * @property {number} tier - The tier number (1-4)
 * @property {string} label - Human-readable tier label
 * @property {string} color - Color for UI display
 * @property {string} description - Description of what this tier means
 */

/**
 * Classify a match score into a tier
 * @param {number} score - Match score from 0 to 1
 * @returns {MatchTierInfo} Tier classification
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

// ============================================================================
// Gap Scoring Constants
// ============================================================================

/**
 * Score values for different gap sizes
 * Re-exported from policies/thresholds.js for backward compatibility
 * @type {Object<number, number>}
 */
export const GAP_SCORES = SCORE_GAP;

/**
 * Calculate gap score with smooth decay
 * @param {number} gap - The gap size (negative = exceeds, positive = below)
 * @returns {number} Score from 0 to 1
 */
export function calculateGapScore(gap) {
  if (gap <= 0) return SCORE_GAP[0]; // Meets or exceeds
  if (gap === 1) return SCORE_GAP[1];
  if (gap === 2) return SCORE_GAP[2];
  if (gap === 3) return SCORE_GAP[3];
  return SCORE_GAP[4]; // 4+ levels below
}

/**
 * Calculate skill match score using smooth decay scoring
 * @param {Object<string, string>} selfSkills - Self-assessed skill proficiencies
 * @param {import('./levels.js').SkillMatrixEntry[]} jobSkills - Required job skill proficiencies
 * @returns {{score: number, gaps: import('./levels.js').MatchGap[]}}
 */
function calculateSkillScore(selfSkills, jobSkills) {
  if (jobSkills.length === 0) {
    return { score: 1, gaps: [] };
  }

  let totalScore = 0;
  const gaps = [];

  for (const jobSkill of jobSkills) {
    const selfLevel = selfSkills[jobSkill.skillId];
    const requiredIndex = getSkillProficiencyIndex(jobSkill.proficiency);

    if (!selfLevel) {
      // No self-assessment for this skill - count as gap with max penalty
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
      // Meets or exceeds requirement
      totalScore += 1;
    } else {
      // Below requirement - use smooth decay scoring
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

  return {
    score: totalScore / jobSkills.length,
    gaps,
  };
}

/**
 * Calculate behaviour match score using smooth decay scoring
 * @param {Object<string, string>} selfBehaviours - Self-assessed behaviour maturities
 * @param {import('./levels.js').BehaviourProfileEntry[]} jobBehaviours - Required job behaviour maturities
 * @returns {{score: number, gaps: import('./levels.js').MatchGap[]}}
 */
function calculateBehaviourScore(selfBehaviours, jobBehaviours) {
  if (jobBehaviours.length === 0) {
    return { score: 1, gaps: [] };
  }

  let totalScore = 0;
  const gaps = [];

  for (const jobBehaviour of jobBehaviours) {
    const selfMaturity = selfBehaviours[jobBehaviour.behaviourId];
    const requiredIndex = getBehaviourMaturityIndex(jobBehaviour.maturity);

    if (!selfMaturity) {
      // No self-assessment for this behaviour - count as gap with max penalty
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
      // Meets or exceeds requirement
      totalScore += 1;
    } else {
      // Below requirement - use smooth decay scoring
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

  return {
    score: totalScore / jobBehaviours.length,
    gaps,
  };
}

/**
 * Calculate expectations match score for senior roles
 * @param {Object} selfExpectations - Self-assessed expectations
 * @param {import('./levels.js').LevelExpectations} jobExpectations - Required level expectations
 * @returns {number} Score from 0 to 1
 */
function calculateExpectationsScore(selfExpectations, jobExpectations) {
  if (!selfExpectations || !jobExpectations) {
    return 0;
  }

  // Simple text matching - in a real system this would be more sophisticated
  const fields = ["scope", "autonomy", "influence"];
  let matches = 0;
  let total = 0;

  for (const field of fields) {
    if (jobExpectations[field]) {
      total++;
      if (selfExpectations[field]) {
        // Basic matching - could be enhanced with semantic similarity
        matches++;
      }
    }
  }

  return total > 0 ? matches / total : 0;
}

/**
 * Calculate job match analysis between a self-assessment and a job
 * @param {import('./levels.js').SelfAssessment} selfAssessment - The self-assessment
 * @param {import('./levels.js').JobDefinition} job - The job definition
 * @returns {import('./levels.js').MatchAnalysis}
 */
export function calculateJobMatch(selfAssessment, job) {
  // Get weights from track or use defaults (track may be null for trackless jobs)
  const skillWeight =
    job.track?.assessmentWeights?.skillWeight ??
    WEIGHT_ASSESSMENT_SKILL_DEFAULT;
  const behaviourWeight =
    job.track?.assessmentWeights?.behaviourWeight ??
    WEIGHT_ASSESSMENT_BEHAVIOUR_DEFAULT;

  // Calculate skill score
  const skillResult = calculateSkillScore(
    selfAssessment.skillProficiencies || {},
    job.skillMatrix,
  );

  // Calculate behaviour score
  const behaviourResult = calculateBehaviourScore(
    selfAssessment.behaviourMaturities || {},
    job.behaviourProfile,
  );

  // Calculate weighted overall score
  let overallScore =
    skillResult.score * skillWeight + behaviourResult.score * behaviourWeight;

  // For senior roles, add expectations score as a bonus
  let expectationsScore = undefined;
  if (isSeniorLevel(job.level)) {
    expectationsScore = calculateExpectationsScore(
      selfAssessment.expectations,
      job.expectations,
    );
    // Add up to 10% bonus for expectations match
    overallScore =
      overallScore * WEIGHT_SENIOR_BASE +
      expectationsScore * WEIGHT_SENIOR_EXPECTATIONS;
  }

  // Combine all gaps
  const allGaps = [...skillResult.gaps, ...behaviourResult.gaps];

  // Sort gaps by gap size (largest first)
  allGaps.sort((a, b) => b.gap - a.gap);

  // Classify match into tier
  const tier = classifyMatch(overallScore);

  // Identify top priority gaps
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
 * @param {import('./levels.js').SelfAssessment} params.selfAssessment - The self-assessment
 * @param {import('./levels.js').Discipline[]} params.disciplines - All disciplines
 * @param {import('./levels.js').Level[]} params.levels - All levels
 * @param {import('./levels.js').Track[]} params.tracks - All tracks
 * @param {import('./levels.js').Skill[]} params.skills - All skills
 * @param {import('./levels.js').Behaviour[]} params.behaviours - All behaviours
 * @param {import('./levels.js').JobValidationRules} [params.validationRules] - Optional validation rules
 * @param {number} [params.topN=10] - Number of top matches to return
 * @returns {import('./levels.js').JobMatch[]} Ranked job matches
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

  // Generate all valid job combinations
  for (const discipline of disciplines) {
    // First generate trackless jobs for each discipline × level
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

    // Then generate jobs with valid tracks
    for (const track of tracks) {
      for (const level of levels) {
        // Skip invalid combinations
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

        if (!job) {
          continue;
        }

        const analysis = calculateJobMatch(selfAssessment, job);
        matches.push({ job, analysis });
      }
    }
  }

  // Sort by overall score descending
  matches.sort((a, b) => b.analysis.overallScore - a.analysis.overallScore);

  // Return top N
  return matches.slice(0, topN);
}

/**
 * Estimate the best-fit level rank for a self-assessment
 * Maps the candidate's average skill proficiency to the most appropriate level
 * @param {Object} params
 * @param {import('./levels.js').SelfAssessment} params.selfAssessment - The self-assessment
 * @param {import('./levels.js').Level[]} params.levels - All levels (sorted by level)
 * @param {import('./levels.js').Skill[]} params.skills - All skills
 * @returns {{level: import('./levels.js').Level, confidence: number, averageSkillIndex: number}}
 */
export function estimateBestFitLevel({ selfAssessment, levels, _skills }) {
  const assessedSkills = Object.entries(
    selfAssessment.skillProficiencies || {},
  );

  if (assessedSkills.length === 0) {
    // No skills assessed - return lowest level
    const sortedLevels = [...levels].sort(
      (a, b) => a.ordinalRank - b.ordinalRank,
    );
    return {
      level: sortedLevels[0],
      confidence: 0,
      averageSkillIndex: 0,
    };
  }

  // Calculate average skill proficiency index
  let totalIndex = 0;
  for (const [, level] of assessedSkills) {
    totalIndex += getSkillProficiencyIndex(level);
  }
  const averageSkillIndex = totalIndex / assessedSkills.length;

  // Sort levels by ordinalRank
  const sortedLevels = [...levels].sort(
    (a, b) => a.ordinalRank - b.ordinalRank,
  );

  // Map skill index to level
  // Skill proficiencies: 0=awareness, 1=foundational, 2=working, 3=practitioner, 4=expert
  // We estimate based on what primary skill proficiency the level expects
  let bestLevel = sortedLevels[0];
  let minDistance = Infinity;

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

  // Confidence is higher when the average skill proficiency closely matches a level
  // Max confidence when exactly matching, lower when between levels
  const confidence = Math.max(0, 1 - minDistance / 2);

  return {
    level: bestLevel,
    confidence,
    averageSkillIndex,
  };
}

/**
 * Find realistic job matches with tier filtering
 * Returns matches grouped by tier, filtered to a realistic range (±1 level from best fit)
 * @param {Object} params
 * @param {import('./levels.js').SelfAssessment} params.selfAssessment - The self-assessment
 * @param {import('./levels.js').Discipline[]} params.disciplines - All disciplines
 * @param {import('./levels.js').Level[]} params.levels - All levels
 * @param {import('./levels.js').Track[]} params.tracks - All tracks
 * @param {import('./levels.js').Skill[]} params.skills - All skills
 * @param {import('./levels.js').Behaviour[]} params.behaviours - All behaviours
 * @param {import('./levels.js').JobValidationRules} [params.validationRules] - Optional validation rules
 * @param {boolean} [params.filterByLevel=true] - Whether to filter to ±1 level from best fit
 * @param {number} [params.topN=20] - Maximum matches to return
 * @returns {{
 *   matches: import('./levels.js').JobMatch[],
 *   matchesByTier: Object<number, import('./levels.js').JobMatch[]>,
 *   estimatedLevel: {level: import('./levels.js').Level, confidence: number},
 *   levelRange: {min: number, max: number}
 * }}
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
  // Estimate best-fit level
  const estimatedLevel = estimateBestFitLevel({
    selfAssessment,
    levels,
    skills,
  });

  // Determine level range (±RANGE_LEVEL_OFFSET levels)
  const bestFitLevel = estimatedLevel.level.ordinalRank;
  const levelRange = {
    min: bestFitLevel - RANGE_LEVEL_OFFSET,
    max: bestFitLevel + RANGE_LEVEL_OFFSET,
  };

  // Find all matches
  const allMatches = findMatchingJobs({
    selfAssessment,
    disciplines,
    levels,
    tracks,
    skills,
    behaviours,
    validationRules,
    topN: 100, // Get more than needed for filtering
  });

  // Filter by level range if enabled
  let filteredMatches = allMatches;
  if (filterByLevel) {
    filteredMatches = allMatches.filter(
      (m) =>
        m.job.level.ordinalRank >= levelRange.min &&
        m.job.level.ordinalRank <= levelRange.max,
    );
  }

  // Group by tier
  const matchesByTier = {
    1: [],
    2: [],
    3: [],
    4: [],
  };

  for (const match of filteredMatches) {
    const tierNum = match.analysis.tier.tier;
    matchesByTier[tierNum].push(match);
  }

  // Sort each tier by level ordinalRank (descending - more senior first), then by score
  for (const tierNum of Object.keys(matchesByTier)) {
    matchesByTier[tierNum].sort((a, b) => {
      // First sort by level ordinalRank descending (more senior first)
      const levelDiff = b.job.level.ordinalRank - a.job.level.ordinalRank;
      if (levelDiff !== 0) return levelDiff;
      // Then by score descending
      return b.analysis.overallScore - a.analysis.overallScore;
    });
  }

  // Intelligent filtering: limit lower-level matches when strong matches exist
  // Find the highest level ordinalRank with a Strong or Good match
  const strongAndGoodMatches = [...matchesByTier[1], ...matchesByTier[2]];
  let highestMatchedLevel = 0;
  for (const match of strongAndGoodMatches) {
    if (match.job.level.ordinalRank > highestMatchedLevel) {
      highestMatchedLevel = match.job.level.ordinalRank;
    }
  }

  // Filter each tier to only show levels within reasonable range of highest match
  // For Strong/Good matches: show up to RANGE_READY_LEVEL_OFFSET levels below highest match
  // For Stretch/Aspirational: show only at or above highest match (growth opportunities)
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

  // Combine all filtered matches, sorted by level (descending) then score
  const allFilteredMatches = [
    ...matchesByTier[1],
    ...matchesByTier[2],
    ...matchesByTier[3],
    ...matchesByTier[4],
  ];

  // Return top N overall
  const matches = allFilteredMatches.slice(0, topN);

  return {
    matches,
    matchesByTier,
    estimatedLevel: {
      level: estimatedLevel.level,
      confidence: estimatedLevel.confidence,
    },
    levelRange,
  };
}

/**
 * Derive a development path from current self-assessment to a target job
 * @param {Object} params
 * @param {import('./levels.js').SelfAssessment} params.selfAssessment - Current self-assessment
 * @param {import('./levels.js').JobDefinition} params.targetJob - Target job
 * @returns {import('./levels.js').DevelopmentPath}
 */
export function deriveDevelopmentPath({ selfAssessment, targetJob }) {
  const items = [];

  // Analyze skill gaps
  for (const jobSkill of targetJob.skillMatrix) {
    const selfLevel = selfAssessment.skillProficiencies?.[jobSkill.skillId];
    const selfIndex = selfLevel ? getSkillProficiencyIndex(selfLevel) : -1;
    const targetIndex = getSkillProficiencyIndex(jobSkill.proficiency);

    if (selfIndex < targetIndex) {
      // Calculate priority based on:
      // - Gap size (larger gaps = higher priority)
      // - Skill type (primary > secondary > broad)
      // - AI skills get a boost for "AI-era focus"
      const gapSize = targetIndex - selfIndex;
      const typeMultiplier =
        jobSkill.type === "primary"
          ? WEIGHT_DEV_TYPE_PRIMARY
          : jobSkill.type === "secondary"
            ? WEIGHT_DEV_TYPE_SECONDARY
            : WEIGHT_DEV_TYPE_BROAD;
      const aiBoost = jobSkill.capability === "ai" ? WEIGHT_DEV_AI_BOOST : 1;
      const priority = gapSize * typeMultiplier * aiBoost;

      items.push({
        id: jobSkill.skillId,
        name: jobSkill.skillName,
        type: "skill",
        currentLevel: selfLevel || "none",
        targetLevel: jobSkill.proficiency,
        priority,
        rationale:
          jobSkill.type === "primary"
            ? "Primary skill for this discipline - essential for the role"
            : jobSkill.type === "secondary"
              ? "Secondary skill - important for full effectiveness"
              : "Broad skill - needed for collaboration and context",
      });
    }
  }

  // Analyze behaviour gaps
  for (const jobBehaviour of targetJob.behaviourProfile) {
    const selfMaturity =
      selfAssessment.behaviourMaturities?.[jobBehaviour.behaviourId];
    const selfIndex = selfMaturity
      ? getBehaviourMaturityIndex(selfMaturity)
      : -1;
    const targetIndex = getBehaviourMaturityIndex(jobBehaviour.maturity);

    if (selfIndex < targetIndex) {
      // Priority for behaviours considers gap size
      const gapSize = targetIndex - selfIndex;
      const priority = gapSize;

      items.push({
        id: jobBehaviour.behaviourId,
        name: jobBehaviour.behaviourName,
        type: "behaviour",
        currentLevel: selfMaturity || "none",
        targetLevel: jobBehaviour.maturity,
        priority,
        rationale:
          "Required behaviour - important for professional effectiveness",
      });
    }
  }

  // Sort by priority (highest first)
  items.sort((a, b) => b.priority - a.priority);

  // Calculate readiness score
  const matchAnalysis = calculateJobMatch(selfAssessment, targetJob);
  const estimatedReadiness = matchAnalysis.overallScore;

  return {
    targetJob,
    items,
    estimatedReadiness,
  };
}

/**
 * Find the best next step job (one level rank up) based on current assessment
 * @param {Object} params
 * @param {import('./levels.js').SelfAssessment} params.selfAssessment - The self-assessment
 * @param {import('./levels.js').JobDefinition} params.currentJob - Current job (or best match)
 * @param {import('./levels.js').Discipline[]} params.disciplines - All disciplines
 * @param {import('./levels.js').Level[]} params.levels - All levels (sorted by level)
 * @param {import('./levels.js').Track[]} params.tracks - All tracks
 * @param {import('./levels.js').Skill[]} params.skills - All skills
 * @param {import('./levels.js').Behaviour[]} params.behaviours - All behaviours
 * @param {import('./levels.js').JobValidationRules} [params.validationRules] - Optional validation rules
 * @returns {import('./levels.js').JobMatch|null} Best next-step job or null if at top
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

  // Find next level rank
  const sortedLevels = [...levels].sort(
    (a, b) => a.ordinalRank - b.ordinalRank,
  );
  const nextLevel = sortedLevels.find((g) => g.ordinalRank > currentLevelLevel);

  if (!nextLevel) {
    return null; // Already at top level
  }

  // Find best match at the next level rank, same discipline preferred
  const candidates = [];

  for (const track of tracks) {
    // Check same discipline first
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

  if (candidates.length === 0) {
    return null;
  }

  // Sort by adjusted score
  candidates.sort((a, b) => b.adjustedScore - a.adjustedScore);

  return { job: candidates[0].job, analysis: candidates[0].analysis };
}

/**
 * Comprehensive analysis of a candidate's self-assessment
 * @param {Object} params
 * @param {import('./levels.js').SelfAssessment} params.selfAssessment - The self-assessment
 * @param {import('./levels.js').Discipline[]} params.disciplines - All disciplines
 * @param {import('./levels.js').Level[]} params.levels - All levels
 * @param {import('./levels.js').Track[]} params.tracks - All tracks
 * @param {import('./levels.js').Skill[]} params.skills - All skills
 * @param {import('./levels.js').Behaviour[]} params.behaviours - All behaviours
 * @param {import('./levels.js').JobValidationRules} [params.validationRules] - Optional validation rules
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
  // Find best matching jobs
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

  // Generate development path for the best match
  const bestMatch = matches[0];
  const developmentPath = bestMatch
    ? deriveDevelopmentPath({ selfAssessment, targetJob: bestMatch.job })
    : null;

  // Calculate overall skill profile
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

  // Calculate overall behaviour profile
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
