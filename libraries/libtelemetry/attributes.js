/**
 * Telemetry attribute mapping configuration
 * Maps protobuf fields to span attributes with type handling
 * @typedef {object} AttributeConfig
 * @property {string} key - Field name in request/response object (can be nested like 'usage.total_tokens')
 * @property {string} type - Type: 'string' for direct value, 'count' for array length, 'number' for numeric value
 */

/**
 * Standard telemetry attributes to parse from requests and responses
 * Span attributes are automatically prefixed with "request." or "response."
 * except for "resource_id" which becomes "resource.id"
 * @type {AttributeConfig[]}
 */
export const TELEMETRY_ATTRIBUTES_MAP = [
  // Tool usage
  { key: "type", type: "string" },
  { key: "function.name", type: "string" },
  { key: "tools", type: "count" },
  { key: "tool_call_id", type: "string" },

  // Agent/handoff identification
  { key: "agent_id", type: "string" },
  { key: "label", type: "string" },

  // Query
  { key: "input", type: "first" },
  { key: "subject", type: "string" },
  { key: "predicate", type: "string" },
  { key: "object", type: "string" },

  // Query filters
  { key: "filter.threshold", type: "number" },
  { key: "filter.limit", type: "number" },
  { key: "filter.max_tokens", type: "number" },

  // Query results
  { key: "content", type: "length" },
  { key: "identifiers", type: "count" },

  // Other generic attributes
  { key: "messages", type: "count" },
  { key: "context", type: "count" },
  { key: "conversation", type: "count" },
];

/**
 * Helper to get nested object values (e.g., "usage.total_tokens")
 * @param {object} obj - Object to extract value from
 * @param {string} path - Dot-separated path to value
 * @returns {*} Value at path or undefined
 */
function getNestedValue(obj, path) {
  if (!obj || !path) return undefined;
  return path.split(".").reduce((current, key) => current?.[key], obj);
}

/**
 * Extracts attributes from request or response for span events
 * @param {object} data - Request or response object
 * @returns {object} Extracted attributes
 */
export function extractAttributes(data) {
  const attributes = {};

  for (const config of TELEMETRY_ATTRIBUTES_MAP) {
    const value = getNestedValue(data, config.key);
    if (value === undefined || value === null) continue;

    // Replace dots in keys with underscores for easier JMESPath parsing
    const key = config.key.replace(/\./g, "_");

    switch (config.type) {
      case "count": {
        const count = Array.isArray(value) ? value.length : 0;
        attributes[`${key}_count`] = count;
        break;
      }
      case "first": {
        const count = Array.isArray(value) ? value.length : 0;
        attributes[`${key}_count`] = count;
        attributes[`${key}_0`] = value[0];
        break;
      }
      case "number":
        attributes[key] = Number(value);
        break;
      case "length":
        attributes[`${key}_length`] = value.length;
        break;
      default:
        attributes[key] = value;
    }
  }

  return attributes;
}
