/**
 * Simple HTML escape function to prevent XSS attacks
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
  if (typeof str !== "string") return str;
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/**
 * @typedef {object} Middleware
 * @property {Function} create - Creates middleware function for Hono
 */

/**
 * Validation middleware implementation for Hono
 * @implements {Middleware}
 */
export class ValidationMiddleware {
  /**
   * Creates validation middleware instance
   * @param {import("@forwardimpact/libconfig").Config} [_config] - Configuration object
   */
  constructor(_config = null) {}

  /**
   * Validates required fields in data
   * @param {object} data - Data to validate
   * @param {object} schema - Validation schema
   * @returns {string|null} Error message or null if valid
   */
  #validateRequiredFields(data, schema) {
    if (!schema.required) return null;

    for (const field of schema.required) {
      if (
        !(field in data) ||
        data[field] === undefined ||
        data[field] === null
      ) {
        return `Missing required field: ${field}`;
      }
    }
    return null;
  }

  /**
   * Validates field types in data
   * @param {object} data - Data to validate
   * @param {object} schema - Validation schema
   * @returns {string|null} Error message or null if valid
   */
  #validateFieldTypes(data, schema) {
    if (!schema.types) return null;

    for (const [field, value] of Object.entries(data)) {
      const expectedType = schema.types[field];
      if (!expectedType || value === undefined || value === null) continue;

      const typeChecks = {
        string: typeof value === "string",
        number: typeof value === "number",
        array: Array.isArray(value),
      };

      if (!typeChecks[expectedType]) {
        return `Field ${field} must be a ${expectedType}`;
      }
    }
    return null;
  }

  /**
   * Validates field lengths in data
   * @param {object} data - Data to validate
   * @param {object} schema - Validation schema
   * @returns {string|null} Error message or null if valid
   */
  #validateFieldLengths(data, schema) {
    if (!schema.maxLengths) return null;

    for (const [field, value] of Object.entries(data)) {
      const maxLength = schema.maxLengths[field];
      if (!maxLength || typeof value !== "string") continue;

      if (value.length > maxLength) {
        return `Field ${field} exceeds maximum length of ${maxLength}`;
      }
    }
    return null;
  }

  /**
   * Sanitizes string fields in data
   * @param {object} data - Data to sanitize
   * @returns {object} Sanitized data
   */
  #sanitizeData(data) {
    const sanitized = {};
    for (const [key, value] of Object.entries(data)) {
      sanitized[key] = typeof value === "string" ? escapeHtml(value) : value;
    }
    return sanitized;
  }

  /**
   * Creates input validation middleware
   * @param {object} schema - Validation schema
   * @returns {Function} Hono middleware function
   */
  create(schema) {
    return async (c, next) => {
      const data = await c.req.json();
      if (!data || typeof data !== "object") {
        return c.json({ error: "Invalid request data" }, 400);
      }

      const requiredError = this.#validateRequiredFields(data, schema);
      if (requiredError) {
        return c.json({ error: requiredError }, 400);
      }

      const typeError = this.#validateFieldTypes(data, schema);
      if (typeError) {
        return c.json({ error: typeError }, 400);
      }

      const lengthError = this.#validateFieldLengths(data, schema);
      if (lengthError) {
        return c.json({ error: lengthError }, 400);
      }

      const sanitizedData = this.#sanitizeData(data);
      c.set("validatedData", sanitizedData);
      await next();
    };
  }
}
