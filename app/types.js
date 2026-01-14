/**
 * Component prop types
 *
 * Central type definitions for component contracts.
 * Components import these types for JSDoc documentation.
 * Presenters return data matching these shapes.
 */

// ============================================================================
// Skill Matrix Types
// ============================================================================

/**
 * Skill matrix item for display in skill-matrix component
 * @typedef {Object} SkillMatrixItem
 * @property {string} skillId - Skill ID for linking
 * @property {string} skillName - Display name
 * @property {string} capability - Skill capability (e.g., "broad", "technical")
 * @property {boolean} [humanOnly] - Whether this skill requires human presence
 * @property {'primary'|'secondary'|'tertiary'} type - Skill type in this role
 * @property {string} level - Level ID (e.g., "advanced", "expert")
 * @property {string} levelDescription - Human-readable level description
 */

// ============================================================================
// Behaviour Profile Types
// ============================================================================

/**
 * Behaviour profile item for display in behaviour-profile component
 * @typedef {Object} BehaviourProfileItem
 * @property {string} behaviourId - Behaviour ID for linking
 * @property {string} behaviourName - Display name
 * @property {'emerging'|'developing'|'practicing'|'role_modeling'|'exemplifying'} maturity - Maturity level
 * @property {string} maturityDescription - Human-readable maturity description

 */

// ============================================================================
// Progression Types
// ============================================================================

/**
 * Skill change item for progression table
 * @typedef {Object} SkillChangeItem
 * @property {string} id - Skill ID for linking
 * @property {string} name - Display name
 * @property {string} capability - Skill capability
 * @property {'primary'|'secondary'|'tertiary'} type - Skill type
 * @property {string} currentLevel - Current level ID (or null if new)
 * @property {string} targetLevel - Target level ID (or null if removed)
 * @property {number} currentIndex - Current level as 0-5 index
 * @property {number} targetIndex - Target level as 0-5 index
 * @property {number} change - Level difference (positive = upgrade)
 * @property {boolean} isGained - True if skill is new in target role
 * @property {boolean} isLost - True if skill is removed in target role
 */

/**
 * Behaviour change item for progression table
 * @typedef {Object} BehaviourChangeItem
 * @property {string} id - Behaviour ID for linking
 * @property {string} name - Display name
 * @property {string} currentLevel - Current maturity (or null if new)
 * @property {string} targetLevel - Target maturity (or null if removed)
 * @property {number} currentIndex - Current maturity as 0-4 index
 * @property {number} targetIndex - Target maturity as 0-4 index
 * @property {number} change - Maturity difference (positive = upgrade)
 * @property {boolean} isGained - True if behaviour is new in target role
 * @property {boolean} isLost - True if behaviour is removed in target role
 */

// ============================================================================
// Driver Coverage Types
// ============================================================================

/**
 * Driver coverage item for driver coverage display
 * @typedef {Object} DriverCoverageItem
 * @property {string} id - Driver ID
 * @property {string} name - Display name
 * @property {number} coverage - Overall coverage percentage (0-100)
 * @property {number} skillsCovered - Number of skills covered
 * @property {number} skillsTotal - Total skills required by driver
 * @property {number} behavioursCovered - Number of behaviours covered
 * @property {number} behavioursTotal - Total behaviours required by driver
 */

// ============================================================================
// Radar Chart Types
// ============================================================================

/**
 * Data point for radar chart
 * @typedef {Object} RadarDataPoint
 * @property {string} label - Axis label
 * @property {number} value - Value (0-maxValue)
 * @property {number} maxValue - Maximum value for this axis
 * @property {string} [description] - Tooltip description
 */

// ============================================================================
// Card Types
// ============================================================================

/**
 * Card list item for list/card views
 * @typedef {Object} CardListItem
 * @property {string} id - Item ID for linking
 * @property {string} name - Display name
 * @property {string} [description] - Optional description
 * @property {string} [href] - Link destination
 * @property {string[]} [badges] - Badge labels
 * @property {Object} [meta] - Additional metadata
 */

// ============================================================================
// Interview Types
// ============================================================================

/**
 * Interview question for display
 * @typedef {Object} InterviewQuestionItem
 * @property {string} targetId - Skill or behaviour ID
 * @property {string} targetName - Skill or behaviour name
 * @property {'skill'|'behaviour'} targetType - Type of target
 * @property {string} targetLevel - Required level
 * @property {string} question - Main question text
 * @property {string[]} followUps - Follow-up questions
 */

/**
 * Interview section grouping questions
 * @typedef {Object} InterviewSectionItem
 * @property {string} id - Section ID (skill or behaviour ID)
 * @property {string} name - Section name
 * @property {'skill'|'behaviour'} type - Type of section
 * @property {string} level - Required level
 * @property {InterviewQuestionItem[]} questions - Questions in this section
 */

// ============================================================================
// Exports (for JSDoc imports)
// ============================================================================

// Types are exported via JSDoc @typedef, not runtime exports.
// Components import types using: /** @typedef {import('../types.js').TypeName} TypeName */
