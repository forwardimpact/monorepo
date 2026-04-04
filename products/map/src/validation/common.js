/**
 * @param {boolean} valid
 * @param {Array} errors
 * @param {Array} warnings
 * @returns {import('../levels.js').ValidationResult}
 */
export function createValidationResult(valid, errors = [], warnings = []) {
  return { valid, errors, warnings };
}

/**
 * @param {string} type
 * @param {string} message
 * @param {string} [path]
 * @param {*} [value]
 * @returns {import('../levels.js').ValidationError}
 */
export function createError(type, message, path, value) {
  const error = { type, message };
  if (path !== undefined) error.path = path;
  if (value !== undefined) error.value = value;
  return error;
}

/**
 * @param {string} type
 * @param {string} message
 * @param {string} [path]
 * @returns {import('../levels.js').ValidationWarning}
 */
export function createWarning(type, message, path) {
  const warning = { type, message };
  if (path !== undefined) warning.path = path;
  return warning;
}

/**
 * Check for duplicate IDs in an array of entities
 * @param {Array} items
 * @param {string} entityName
 * @returns {Array} errors
 */
export function checkDuplicateIds(items, entityName) {
  const errors = [];
  const seenIds = new Set();
  items.forEach((item, index) => {
    if (item.id) {
      if (seenIds.has(item.id)) {
        errors.push(
          createError(
            "DUPLICATE_ID",
            `Duplicate ${entityName} ID: ${item.id}`,
            `${entityName}s[${index}]`,
            item.id,
          ),
        );
      }
      seenIds.add(item.id);
    }
  });
  return errors;
}
