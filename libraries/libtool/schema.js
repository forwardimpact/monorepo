/** @type {Record<string, string>} */
const PROTO_TYPE_MAP = {
  string: "string",
  int32: "integer",
  int64: "integer",
  uint32: "integer",
  uint64: "integer",
  float: "number",
  double: "number",
  bool: "boolean",
};

/**
 * Resolve protobuf type to JSON schema type string.
 * @param {string} protoType
 * @returns {string}
 */
function resolveJsonType(protoType) {
  return PROTO_TYPE_MAP[protoType] || "object";
}

/**
 * Map protobuf field type to JSON schema property type
 * @param {object} field - Protobuf field definition
 * @param {string} [description] - Optional description from descriptor
 * @returns {object} JSON schema property object
 */
export function mapFieldToSchema(field, description) {
  const property = {
    description:
      description || field.comment || `${field.name || "field"} field`,
  };

  if (field.rule === "repeated") {
    property.type = "array";
    property.items = { type: resolveJsonType(field.type) };
    return property;
  }

  property.type = resolveJsonType(field.type);
  return property;
}

/**
 * Generate OpenAI-compatible JSON schema from protobuf message type
 * @param {object} messageType - Protobuf message type
 * @param {object} [paramDescriptions] - Parameter descriptions from descriptor
 * @returns {object} JSON schema
 */
export function generateSchemaFromProtobuf(
  messageType,
  paramDescriptions = {},
) {
  const schema = {
    type: "object",
    properties: {},
    required: [],
  };

  if (!messageType || !messageType.fields) {
    return schema;
  }

  for (const [fieldName, field] of Object.entries(messageType.fields)) {
    // Skip fields automatically passed by the system
    if (
      fieldName === "llm_token" ||
      fieldName === "filter" ||
      fieldName === "resource_id"
    ) {
      continue;
    }

    const description = paramDescriptions[fieldName];
    const property = mapFieldToSchema(field, description);
    schema.properties[fieldName] = property;

    if (field.rule !== "repeated" && !field.optional) {
      schema.required.push(fieldName);
    }
  }

  return schema;
}

/**
 * Build tool description from descriptor fields
 * @param {object} descriptor - Descriptor with purpose, applicability, instructions, evaluation
 * @returns {string} Formatted description string
 */
export function buildToolDescription(descriptor) {
  const parts = [];

  if (descriptor.purpose) {
    parts.push(`PURPOSE: ${descriptor.purpose.trim()}`);
  }
  if (descriptor.applicability) {
    parts.push(`WHEN TO USE: ${descriptor.applicability.trim()}`);
  }
  if (descriptor.instructions) {
    parts.push(`HOW TO USE: ${descriptor.instructions.trim()}`);
  }
  if (descriptor.evaluation) {
    parts.push(`RETURNS: ${descriptor.evaluation.trim()}`);
  }

  return parts.join("\n\n") || "No description available";
}
