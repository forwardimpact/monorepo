/**
 * Custom error types for the application
 */

/**
 * Entity not found error
 */
export class NotFoundError extends Error {
  /**
   * @param {string} entityType - Type of entity (e.g., 'Skill', 'Behaviour')
   * @param {string} entityId - ID that was not found
   * @param {string} backPath - Path to navigate back to
   */
  constructor(entityType, entityId, backPath) {
    super(`${entityType} not found: ${entityId}`);
    this.name = "NotFoundError";
    this.entityType = entityType;
    this.entityId = entityId;
    this.backPath = backPath;
  }
}

/**
 * Invalid combination error (e.g., invalid job configuration)
 */
export class InvalidCombinationError extends Error {
  /**
   * @param {string} message - Error message
   * @param {string} backPath - Path to navigate back to
   */
  constructor(message, backPath) {
    super(message);
    this.name = "InvalidCombinationError";
    this.backPath = backPath;
  }
}

/**
 * Data loading error
 */
export class DataLoadError extends Error {
  /**
   * @param {string} message - Error message
   */
  constructor(message) {
    super(message);
    this.name = "DataLoadError";
  }
}
