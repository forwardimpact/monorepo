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

  // Handle repeated fields (arrays) first, before scalar type mapping
  if (field.rule === "repeated") {
    property.type = "array";
    switch (field.type) {
      case "string":
        property.items = { type: "string" };
        break;
      case "int32":
      case "int64":
      case "uint32":
      case "uint64":
        property.items = { type: "integer" };
        break;
      case "float":
      case "double":
        property.items = { type: "number" };
        break;
      case "bool":
        property.items = { type: "boolean" };
        break;
      default:
        property.items = { type: "object" };
    }
    return property;
  }

  // Map scalar protobuf types to JSON schema types
  switch (field.type) {
    case "string":
      property.type = "string";
      break;
    case "int32":
    case "int64":
    case "uint32":
    case "uint64":
      property.type = "integer";
      break;
    case "float":
    case "double":
      property.type = "number";
      break;
    case "bool":
      property.type = "boolean";
      break;
    default:
      property.type = "object";
  }

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
