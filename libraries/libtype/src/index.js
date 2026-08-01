import { generateUUID } from "@forwardimpact/libsecret";
import { countTokens } from "@forwardimpact/libutil";

import * as types from "./generated/types/types.js";

// Export everything from the generated types, both core and tool namespaces
export * from "./generated/types/types.js";

// Export codegen metadata for config-driven tool registration
export { metadata } from "./generated/types/metadata.js";

// Core namespaces only. The list deliberately excludes tools and any
// experimental namespaces
const {
  common = {},
  resource = {},
  vector = {},
  graph = {},
  tool = {},
  span = {},
} = types;

/**
 * Generate a name for the resource. It always uses a UUID for uniqueness.
 * For content-based idempotency (e.g., ResourceProcessor), inject
 * the name explicitly with id.name before you call withIdentifier().
 * @param {object} instance - The resource instance
 * @returns {string} The generated name
 */
function generateName(instance) {
  // Preserve the explicitly provided name
  if (instance.id.name) {
    return instance.id.name.split(".").pop();
  }
  // Preserve the name field if it is present
  if (instance.name && typeof instance.name === "string") {
    return instance.name;
  }
  // Always use a UUID for uniqueness
  return generateUUID();
}

/**
 * Make sure the identifier has assigned values. Call this before you
 * persist the resource.
 * @param {string} [parent] - Parent ID
 * @param {string[]} [subjects] - Subject URIs
 */
function withIdentifier(parent, subjects) {
  // Initialize the id if it is missing
  this.id = this.id || new resource.Identifier();
  this.id.subjects = subjects?.length
    ? subjects.map(String)
    : this.id.subjects || [];
  this.id.parent = parent ? String(parent) : this.id.parent || "";

  const type = this.constructor.getTypeUrl("guide.dev").split("/").pop();
  if (!type)
    throw new Error("resource.withIdentifier: Resource type must not be null");

  // Get the name with the fallback chain
  const name = generateName(this);

  this.id.type = type;
  this.id.name = name;

  // Set the tokens field only if it is not already set. This preserves the
  // explicit values
  if (this.id.tokens === undefined || this.id.tokens === null) {
    if (this.content && typeof this.content === "string") {
      this.id.tokens = countTokens(this.content);
    } else {
      // Set to 0 for empty, null, undefined, or non-string content
      this.id.tokens = 0;
    }
  }
}

common.Conversation.prototype.withIdentifier = withIdentifier;
common.Message.prototype.withIdentifier = withIdentifier;
tool.ToolFunction.prototype.withIdentifier = withIdentifier;
tool.ToolCallMessage.prototype.withIdentifier = withIdentifier;

resource.Identifier.prototype.toString = function () {
  if (!this?.type)
    throw new Error(
      "resource.Identifier.toString: Resource type must not be null: " +
        JSON.stringify(this),
    );
  if (!this?.name)
    throw new Error(
      "resource.Identifier.toString: Resource name must not be null",
    );

  // Check for a string, because a conversion can happen earlier
  // TODO: Do we still need this?
  if (this.parent == "undefined") this.parent = undefined;

  // Extract the tree from the parent
  let tree = [];
  if (this.parent && this.parent !== "undefined" && this.parent !== "") {
    const path = String(this.parent).split(":").pop() || "";
    if (path) tree = path.split("/");
    tree.push(`${this.type}.${this.name}`);
  } else {
    tree.push(`${this.type}.${this.name}`);
  }

  return tree.join("/");
};

/**
 * Monkey-patches for common.Message
 */
const MessageCtor = common.Message;
const MessagefromObject = MessageCtor.fromObject;

// Monkey-patch Message.fromObject to apply the identifier
common.Message.fromObject = function (object) {
  const typed = MessagefromObject(object);
  typed.withIdentifier();
  return typed;
};

/**
 * Monkey-patches for common.Conversation
 */
const ConversationCtor = common.Conversation;
const ConversationfromObject = ConversationCtor.fromObject;

// Monkey-patch Conversation.fromObject to apply the identifier
common.Conversation.fromObject = function (object) {
  const typed = ConversationfromObject(object);
  typed.withIdentifier();
  return typed;
};

/**
 * Monkey-patches for tool.ToolFunction
 */
const ToolFunctionCtor = tool.ToolFunction;
const ToolFunctionfromObject = ToolFunctionCtor.fromObject;

// Monkey-patch ToolFunction.fromObject to gracefully convert .name to .id.name
tool.ToolFunction.fromObject = function (object) {
  // If the object has a name property, construct the identifier from it
  if (object?.name) {
    if (object?.id) {
      object.id.name = object.name;
    } else {
      object.id = { name: object.name };
    }
  } else if (object?.id?.name) {
    object.name = object.id.name;
  }

  const typed = ToolFunctionfromObject(object);
  typed.withIdentifier();
  return typed;
};

/**
 * Monkey-patches for tool.ToolCallMessage
 */
const ToolCallMessageCtor = tool.ToolCallMessage;
const ToolCallMessagefromObject = ToolCallMessageCtor.fromObject;

// Monkey-patch ToolCallMessage.fromObject to apply the identifier
tool.ToolCallMessage.fromObject = function (object) {
  const typed = ToolCallMessagefromObject(object);
  typed.withIdentifier();
  return typed;
};

export {
  // Export all the namespaces with any applied patches
  common,
  resource,
  vector,
  graph,
  tool,
  span,
};
