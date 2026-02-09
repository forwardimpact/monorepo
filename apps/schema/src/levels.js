/**
 * Engineering Pathway Type Definitions
 *
 * This module defines all data structures used in the engineering pathway.
 */

/**
 * Skill levels from lowest to highest proficiency
 * @readonly
 * @enum {string}
 */
export const SkillLevel = {
  AWARENESS: "awareness",
  FOUNDATIONAL: "foundational",
  WORKING: "working",
  PRACTITIONER: "practitioner",
  EXPERT: "expert",
};

/**
 * Ordered array of skill levels for comparison/clamping
 * @type {string[]}
 */
export const SKILL_LEVEL_ORDER = [
  SkillLevel.AWARENESS,
  SkillLevel.FOUNDATIONAL,
  SkillLevel.WORKING,
  SkillLevel.PRACTITIONER,
  SkillLevel.EXPERT,
];

/**
 * Behaviour maturity levels from lowest to highest
 * @readonly
 * @enum {string}
 */
export const BehaviourMaturity = {
  EMERGING: "emerging",
  DEVELOPING: "developing",
  PRACTICING: "practicing",
  ROLE_MODELING: "role_modeling",
  EXEMPLIFYING: "exemplifying",
};

/**
 * Ordered array of behaviour maturity levels for comparison/clamping
 * @type {string[]}
 */
export const BEHAVIOUR_MATURITY_ORDER = [
  BehaviourMaturity.EMERGING,
  BehaviourMaturity.DEVELOPING,
  BehaviourMaturity.PRACTICING,
  BehaviourMaturity.ROLE_MODELING,
  BehaviourMaturity.EXEMPLIFYING,
];

// ============================================================================
// Data-driven Stage Functions
// ============================================================================
// Stage ordering is derived from loaded stage data, not hardcoded.
// Use getStageOrder(stages) to get stage IDs in lifecycle order.

/**
 * Get ordered stage IDs from loaded stage data
 *
 * Stages are defined in stages.yaml and their array order IS the
 * canonical lifecycle order. This function extracts IDs preserving
 * that order, similar to getCapabilityOrder for capabilities.
 *
 * @param {Object[]} stages - Loaded stages array from stages.yaml
 * @returns {string[]} Stage IDs in lifecycle order
 */
export function getStageOrder(stages) {
  return stages.map((s) => s.id);
}

/**
 * Skill capabilities (what capability area)
 * @readonly
 * @enum {string}
 */
export const Capability = {
  DELIVERY: "delivery",
  SCALE: "scale",
  RELIABILITY: "reliability",
  DATA: "data",
  AI: "ai",
  ML: "ml",
  PROCESS: "process",
  BUSINESS: "business",
  PEOPLE: "people",
  DOCUMENTATION: "documentation",
  PRODUCT: "product",
};

// ============================================================================
// Data-driven Capability Functions
// ============================================================================
// These functions work with loaded capability data for responsibility derivation

/**
 * Get capability metadata from loaded capability data
 * @param {Object[]} capabilities - Loaded capabilities array
 * @param {string} capabilityId - The capability ID to look up
 * @returns {Object|undefined} The capability object or undefined
 */
export function getCapabilityById(capabilities, capabilityId) {
  return capabilities.find((c) => c.id === capabilityId);
}

/**
 * Get ordered capability IDs from loaded capability data
 * @param {Object[]} capabilities - Loaded capabilities array
 * @returns {string[]} Capability IDs in display order
 */
export function getCapabilityOrder(capabilities) {
  return [...capabilities]
    .sort((a, b) => (a.ordinalRank || 0) - (b.ordinalRank || 0))
    .map((c) => c.id);
}

/**
 * Group skills by capability in display order
 * @param {import('./levels.js').Skill[]} skills - Array of skills to group
 * @param {Object[]} capabilities - Loaded capabilities array for ordering
 * @returns {Object<string, import('./levels.js').Skill[]>} Object with capabilities as keys (in display order)
 */
export function groupSkillsByCapability(skills, capabilities) {
  const capabilityOrder = getCapabilityOrder(capabilities);
  const result = {};

  // Initialize all capabilities in display order (ensures consistent key order)
  for (const capability of capabilityOrder) {
    result[capability] = [];
  }

  // Populate with skills
  for (const skill of skills) {
    if (result[skill.capability]) {
      result[skill.capability].push(skill);
    }
  }

  // Remove empty capabilities and sort skills within each capability by name
  for (const capability of Object.keys(result)) {
    if (result[capability].length === 0) {
      delete result[capability];
    } else {
      result[capability].sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  return result;
}

/**
 * Get emoji for a capability from loaded capability data
 * @param {Object[]} capabilities - Loaded capabilities array
 * @param {string} capabilityId - The capability ID
 * @returns {string} The emoji or default "💡"
 */
export function getCapabilityEmoji(capabilities, capabilityId) {
  const capability = getCapabilityById(capabilities, capabilityId);
  return capability?.emojiIcon || "💡";
}

/**
 * Get responsibility statement for a capability at a specific skill level
 *
 * Uses professionalResponsibilities for professional disciplines and
 * managementResponsibilities for management disciplines.
 *
 * @param {Object[]} capabilities - Loaded capabilities array
 * @param {string} capabilityId - The capability ID
 * @param {string} level - The skill level (awareness, foundational, working, practitioner, expert)
 * @param {Object} [discipline] - Optional discipline to determine which responsibilities to use
 * @param {boolean} [discipline.isManagement] - Whether this is a management discipline
 * @returns {string|undefined} The responsibility statement or undefined
 */
export function getCapabilityResponsibility(
  capabilities,
  capabilityId,
  level,
  discipline,
) {
  const capability = getCapabilityById(capabilities, capabilityId);
  const responsibilityKey = discipline?.isManagement
    ? "managementResponsibilities"
    : "professionalResponsibilities";
  return capability?.[responsibilityKey]?.[level];
}

/**
 * Skill type within a discipline
 * @readonly
 * @enum {string}
 */
export const SkillType = {
  PRIMARY: "primary",
  SECONDARY: "secondary",
  BROAD: "broad",
  TRACK: "track",
};

/**
 * @typedef {Object} LevelDescription
 * @property {string} level - The level identifier
 * @property {string} description - Description of what this level means
 */

/**
 * @typedef {Object} Skill
 * @property {string} id - Unique identifier
 * @property {string} name - Display name
 * @property {string} capability - One of Capability values
 * @property {string} description - General description of the skill
 * @property {Object<string, string>} levelDescriptions - Description for each skill level
 */

/**
 * @typedef {Object} Behaviour
 * @property {string} id - Unique identifier
 * @property {string} name - Display name
 * @property {string} description - General description of the behaviour
 * @property {Object<string, string>} maturityDescriptions - Description for each maturity level
 */

/**
 * @typedef {Object} Driver
 * @property {string} id - Unique identifier
 * @property {string} name - Display name
 * @property {string} description - Description of the organizational outcome
 * @property {string[]} contributingSkills - Array of skill IDs that support this driver
 * @property {string[]} contributingBehaviours - Array of behaviour IDs that support this driver
 */

/**
 * @typedef {Object} Discipline
 * @property {string} id - Unique identifier
 * @property {string} specialization - Display name for the field (e.g., "Software Engineering")
 * @property {string} roleTitle - Display name for a person in this role (e.g., "Software Engineer")
 * @property {string} [name] - Legacy display name (deprecated, use specialization/roleTitle)
 * @property {string} description - Description of the discipline
 * @property {Array<string|null>} validTracks - Valid track configurations. null = allow trackless (generalist), string = track ID
 * @property {string[]} coreSkills - Skill IDs requiring deep expertise (Practitioner/Expert)
 * @property {string[]} supportingSkills - Skill IDs requiring solid competence (Working/Practitioner)
 * @property {string[]} broadSkills - Skill IDs requiring awareness (Awareness/Foundational)
 * @property {Object<string, number>} behaviourModifiers - Map of behaviour ID to modifier (+1, 0, -1)
 */

/**
 * @typedef {Object} AssessmentWeights
 * @property {number} skillWeight - Weight for skill matching (0.0-1.0)
 * @property {number} behaviourWeight - Weight for behaviour matching (0.0-1.0)
 */

/**
 * @typedef {Object} Track
 * @property {string} id - Unique identifier
 * @property {string} name - Display name
 * @property {string} description - Description of the track focus
 * @property {Object<string, number>} skillModifiers - Map of capability/skill ID to level modifier (positive or negative integer)
 * @property {Object<string, number>} behaviourModifiers - Map of behaviour ID to maturity modifier (positive or negative integer)
 * @property {AssessmentWeights} [assessmentWeights] - Optional custom weights for job matching
 * @property {string} [minGrade] - Optional minimum grade ID this track is valid for
 */

/**
 * @typedef {Object} GradeSkillLevels
 * @property {string} primary - Base skill level for primary skills
 * @property {string} secondary - Base skill level for secondary skills
 * @property {string} broad - Base skill level for broad skills
 */

/**
 * @typedef {Object} GradeExpectations
 * @property {string} impactScope - Expected scope of work/impact
 * @property {string} autonomyExpectation - Expected level of autonomy
 * @property {string} influenceScope - Expected sphere of influence
 * @property {string} complexityHandled - Expected complexity of work handled
 */

/**
 * @typedef {Object} BreadthCriteria
 * @property {number} [practitioner] - Minimum number of skills at Practitioner level
 * @property {number} [expert] - Minimum number of skills at Expert level
 */

/**
 * @typedef {Object} Grade
 * @property {string} id - Unique identifier
 * @property {string} professionalTitle - Display name for professional/IC track (e.g., "Level I", "Staff")
 * @property {string} managementTitle - Display name for management track (e.g., "Associate", "Director")
 * @property {string} [name] - Legacy display name (deprecated, use professionalTitle/managementTitle)
 * @property {string} [typicalExperienceRange] - Typical years of experience range (e.g., "0-2", "20+")
 * @property {number} ordinalRank - Numeric level for ordering (higher = more senior)
 * @property {GradeSkillLevels} baseSkillLevels - Base skill levels by skill type
 * @property {string} baseBehaviourMaturity - Base behaviour maturity level
 * @property {GradeExpectations} expectations - Role expectations
 * @property {BreadthCriteria} [breadthCriteria] - For senior grades, breadth requirements
 */

/**
 * @typedef {Object} SkillMatrixEntry
 * @property {string} skillId - The skill ID
 * @property {string} skillName - The skill name
 * @property {string} capability - The skill capability
 * @property {string} type - The skill type (primary/secondary/broad)
 * @property {string} level - The derived skill level
 * @property {string} levelDescription - Description for this level
 */

/**
 * @typedef {Object} BehaviourProfileEntry
 * @property {string} behaviourId - The behaviour ID
 * @property {string} behaviourName - The behaviour name
 * @property {string} maturity - The derived maturity level
 * @property {string} maturityDescription - Description for this maturity level

 */

/**
 * @typedef {Object} JobDefinition
 * @property {string} id - Generated job ID (discipline_grade_track)
 * @property {string} title - Generated job title
 * @property {Discipline} discipline - Reference to the discipline
 * @property {Grade} grade - Reference to the grade
 * @property {Track} track - Reference to the track
 * @property {SkillMatrixEntry[]} skillMatrix - Complete derived skill matrix
 * @property {BehaviourProfileEntry[]} behaviourProfile - Complete derived behaviour profile
 * @property {GradeExpectations} expectations - Grade-level expectations
 */

/**
 * @typedef {Object} Question
 * @property {string} id - Unique identifier
 * @property {string} text - The question text
 * @property {string} type - Question type (technical, situational, behavioural)
 * @property {string[]} [followUps] - Optional follow-up questions
 * @property {string[]} [lookingFor] - What good answers should include
 * @property {number} [expectedDurationMinutes] - Estimated time to ask and answer
 */

/**
 * @typedef {Object<string, Question[]>} LevelQuestions - Questions organized by level
 */

/**
 * @typedef {Object} RoleTypeQuestions
 * @property {LevelQuestions} [professionalQuestions] - Questions for professional/IC roles
 * @property {LevelQuestions} [managementQuestions] - Questions for management roles
 */

/**
 * @typedef {Object} QuestionBank
 * @property {Object<string, RoleTypeQuestions>} skillLevels - Questions by skill ID, then by role type (professional/management), then by level
 * @property {Object<string, RoleTypeQuestions>} behaviourMaturities - Questions by behaviour ID, then by role type, then by maturity
 * @property {Object<string, RoleTypeQuestions>} [capabilityLevels] - Questions by capability ID, then by role type, then by level
 */

/**
 * @typedef {Object} SelfAssessment
 * @property {string} [id] - Optional identifier
 * @property {Object<string, string>} skills - Map of skill ID to self-assessed level
 * @property {Object<string, string>} behaviours - Map of behaviour ID to self-assessed maturity
 * @property {Object} [expectations] - Optional self-assessment of scope/autonomy/influence
 * @property {string} [expectations.scope] - Self-assessed scope
 * @property {string} [expectations.autonomy] - Self-assessed autonomy
 * @property {string} [expectations.influence] - Self-assessed influence
 */

/**
 * @typedef {Object} MatchGap
 * @property {string} id - Skill or behaviour ID
 * @property {string} name - Skill or behaviour name
 * @property {string} type - 'skill' or 'behaviour'
 * @property {string} current - Current level
 * @property {string} required - Required level
 * @property {number} gap - Numeric gap (positive means below requirement)
 */

/**
 * @typedef {Object} MatchAnalysis
 * @property {number} overallScore - Combined weighted score (0-1)
 * @property {number} skillScore - Skill match score (0-1)
 * @property {number} behaviourScore - Behaviour match score (0-1)
 * @property {MatchingWeights} weightsUsed - The weights used in calculation
 * @property {MatchGap[]} gaps - Array of gaps where requirements not met
 * @property {MatchTierInfo} tier - Match tier classification
 * @property {MatchGap[]} priorityGaps - Top 3 gaps by severity for focused development
 * @property {number} [expectationsScore] - For senior roles, expectations match score
 */

/**
 * @typedef {Object} JobMatch
 * @property {JobDefinition} job - The matched job
 * @property {MatchAnalysis} analysis - Match analysis details
 */

/**
 * @typedef {Object} DevelopmentItem
 * @property {string} id - Skill or behaviour ID
 * @property {string} name - Skill or behaviour name
 * @property {string} type - 'skill' or 'behaviour'
 * @property {string} currentLevel - Current level
 * @property {string} targetLevel - Target level for the job
 * @property {number} priority - Priority score (higher = more important)
 * @property {string} rationale - Why this development is important
 */

/**
 * @typedef {Object} DevelopmentPath
 * @property {JobDefinition} targetJob - The target job
 * @property {DevelopmentItem[]} items - Prioritized development items
 * @property {number} estimatedReadiness - Current readiness score (0-1)
 */

/**
 * @typedef {Object} DriverCoverage
 * @property {string} driverId - The driver ID
 * @property {string} driverName - The driver name
 * @property {number} skillCoverage - Percentage of linked skills at Working+ (0-1)
 * @property {number} behaviourCoverage - Percentage of linked behaviours at Practicing+ (0-1)
 * @property {number} overallScore - Weighted average of skill and behaviour coverage
 * @property {string[]} coveredSkills - Skills that meet the threshold
 * @property {string[]} coveredBehaviours - Behaviours that meet the threshold
 * @property {string[]} missingSkills - Skills below threshold
 * @property {string[]} missingBehaviours - Behaviours below threshold
 */

/**
 * @typedef {Object} InterviewQuestion
 * @property {Question} question - The question details
 * @property {string} targetId - The skill or behaviour ID this assesses
 * @property {string} targetName - The skill or behaviour name
 * @property {string} targetType - 'skill' or 'behaviour'
 * @property {string} targetLevel - The level this question assesses
 * @property {number} priority - Priority in the interview (higher = ask first)
 */

/**
 * @typedef {Object} InterviewGuide
 * @property {JobDefinition} job - The job being interviewed for
 * @property {InterviewQuestion[]} questions - Ordered list of questions
 * @property {number} estimatedMinutes - Total estimated time
 * @property {Object} coverage - Coverage summary
 * @property {string[]} coverage.skills - Skills covered
 * @property {string[]} coverage.behaviours - Behaviours covered
 */

/**
 * @typedef {Object} ValidationError
 * @property {string} type - Error type identifier
 * @property {string} message - Human-readable error message
 * @property {string} [path] - Path to the invalid data
 * @property {*} [value] - The invalid value
 */

/**
 * @typedef {Object} ValidationWarning
 * @property {string} type - Warning type identifier
 * @property {string} message - Human-readable warning message
 * @property {string} [path] - Path to the concerning data
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether validation passed
 * @property {ValidationError[]} errors - Array of validation errors
 * @property {ValidationWarning[]} warnings - Array of validation warnings
 */

/**
 * @typedef {Object} JobValidationRules
 * @property {Array<{discipline: string, grade?: string, track?: string}>} [invalidCombinations] - Invalid combinations
 * @property {Object<string, string[]>} [validTracksByDiscipline] - Valid tracks per discipline
 */

/**
 * Helper function to get skill level index
 * @param {string} level - The skill level
 * @returns {number} The index (0-4), or -1 if invalid
 */
export function getSkillLevelIndex(level) {
  return SKILL_LEVEL_ORDER.indexOf(level);
}

/**
 * Helper function to get behaviour maturity index
 * @param {string} maturity - The maturity level
 * @returns {number} The index (0-3), or -1 if invalid
 */
export function getBehaviourMaturityIndex(maturity) {
  return BEHAVIOUR_MATURITY_ORDER.indexOf(maturity);
}

/**
 * Clamp a skill level index to valid range
 * @param {number} index - The index to clamp
 * @returns {string} The clamped skill level
 */
export function clampSkillLevel(index) {
  const clampedIndex = Math.max(
    0,
    Math.min(SKILL_LEVEL_ORDER.length - 1, index),
  );
  return SKILL_LEVEL_ORDER[clampedIndex];
}

/**
 * Clamp a behaviour maturity index to valid range
 * @param {number} index - The index to clamp
 * @returns {string} The clamped maturity level
 */
export function clampBehaviourMaturity(index) {
  const clampedIndex = Math.max(
    0,
    Math.min(BEHAVIOUR_MATURITY_ORDER.length - 1, index),
  );
  return BEHAVIOUR_MATURITY_ORDER[clampedIndex];
}

/**
 * Check if a skill level meets or exceeds a requirement
 * @param {string} actual - The actual skill level
 * @param {string} required - The required skill level
 * @returns {boolean} True if actual meets or exceeds required
 */
export function skillLevelMeetsRequirement(actual, required) {
  return getSkillLevelIndex(actual) >= getSkillLevelIndex(required);
}

/**
 * Check if a behaviour maturity meets or exceeds a requirement
 * @param {string} actual - The actual maturity level
 * @param {string} required - The required maturity level
 * @returns {boolean} True if actual meets or exceeds required
 */
export function behaviourMaturityMeetsRequirement(actual, required) {
  return (
    getBehaviourMaturityIndex(actual) >= getBehaviourMaturityIndex(required)
  );
}

/**
 * Get emoji for a concept from framework data
 * @param {Object} framework - Framework object loaded from framework.yaml
 * @param {string} concept - The concept type: 'driver', 'skill', 'behaviour', 'discipline', 'grade', or 'track'
 * @returns {string} The emoji for the concept or default "💡"
 */
export function getConceptEmoji(framework, concept) {
  return framework?.entityDefinitions?.[concept]?.emojiIcon || "💡";
}
