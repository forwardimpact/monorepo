/**
 * Component prop types
 *
 * Central type definitions for component contracts.
 * Components import these types for JSDoc documentation.
 * Presenters return data that matches these shapes.
 */

// ============================================================================
// Skill Matrix Types
// ============================================================================

/**
 * Skill matrix item that the skill-matrix component displays
 * @typedef {Object} SkillMatrixItem
 * @property {string} skillId - Skill ID for the link
 * @property {string} skillName - Display name
 * @property {string} capability - Skill capability (e.g., "broad", "technical")
 * @property {boolean} [humanOnly] - Whether this skill requires human presence
 * @property {'core'|'supporting'|'broad'|'track'} type - Skill tier in this role
 * @property {string} level - Level ID (e.g., "advanced", "expert")
 * @property {string} proficiencyDescription - Human-readable level description
 */

// ============================================================================
// Behaviour Profile Types
// ============================================================================

/**
 * Behaviour profile item that the behaviour-profile component displays
 * @typedef {Object} BehaviourProfileItem
 * @property {string} behaviourId - Behaviour ID for the link
 * @property {string} behaviourName - Display name
 * @property {'emerging'|'developing'|'practicing'|'role-modeling'|'exemplifying'} maturity - Maturity level
 * @property {string} maturityDescription - Human-readable maturity description

 */

// ============================================================================
// Progression Types
// ============================================================================

/**
 * Skill change item for progression table
 * @typedef {Object} SkillChangeItem
 * @property {string} id - Skill ID for the link
 * @property {string} name - Display name
 * @property {string} capability - Skill capability
 * @property {'core'|'supporting'|'broad'|'track'} type - Skill tier
 * @property {string} currentLevel - Current level ID (or null if new)
 * @property {string} targetLevel - Target level ID (or null if removed)
 * @property {number} currentIndex - Current level as 0-4 index (-1 if new)
 * @property {number} targetIndex - Target level as 0-4 index (-1 if removed)
 * @property {number} change - Level difference (positive = upgrade)
 * @property {boolean} isGained - True if skill is new in target role
 * @property {boolean} isLost - True if the target role removes the skill
 */

/**
 * Behaviour change item for progression table
 * @typedef {Object} BehaviourChangeItem
 * @property {string} id - Behaviour ID for the link
 * @property {string} name - Display name
 * @property {string} currentLevel - Current maturity (or null if new)
 * @property {string} targetLevel - Target maturity (or null if removed)
 * @property {number} currentIndex - Current maturity as 0-4 index (-1 if new)
 * @property {number} targetIndex - Target maturity as 0-4 index (-1 if removed)
 * @property {number} change - Maturity difference (positive = upgrade)
 * @property {boolean} isGained - True if behaviour is new in target role
 * @property {boolean} isLost - True if the target role removes the behaviour
 */

// ============================================================================
// Driver Coverage Types
// ============================================================================

/**
 * Driver coverage item for the driver-coverage display
 * @typedef {Object} DriverCoverageItem
 * @property {string} id - Driver ID
 * @property {string} name - Display name
 * @property {number} coverage - Overall coverage percentage (0-100)
 * @property {number} skillsCovered - Number of skills covered
 * @property {number} skillsTotal - Total skills the driver requires
 * @property {number} behavioursCovered - Number of behaviours covered
 * @property {number} behavioursTotal - Total behaviours the driver requires
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
 * @property {string} id - Item ID for the link
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
 * Interview question to display
 * @typedef {Object} InterviewQuestionItem
 * @property {string} targetId - Skill or behaviour ID
 * @property {string} targetName - Skill or behaviour name
 * @property {'skill'|'behaviour'} targetType - Type of target
 * @property {string} targetLevel - Required level
 * @property {string} question - Main question text
 * @property {string[]} followUps - Follow-up questions
 */

/**
 * Interview section that groups questions
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

// JSDoc @typedef exports the types. The file has no runtime exports.
// Components import types with: /** @typedef {import('../types.js').TypeName} TypeName */
