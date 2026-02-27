import { tool } from "@forwardimpact/libtype";

/**
 * Checks if a tool call is a hallucinated multi_tool_use.parallel call.
 * @param {string} name - Function name from tool call
 * @returns {boolean} True if this is a parallel hallucination
 */
function isParallelHallucination(name) {
  return name === "multi_tool_use.parallel" || name === "parallel";
}

/**
 * Extracts the function name from a nested tool_use, stripping prefixes.
 * @param {object} nestedTool - Nested tool use object
 * @returns {string} Clean function name
 */
function extractNestedName(nestedTool) {
  const rawName = nestedTool.recipient_name || nestedTool.name || "";
  return rawName.startsWith("functions.") ? rawName.slice(10) : rawName;
}

/**
 * Converts a nested tool_use to a proper ToolCall object.
 * @param {object} nestedTool - Nested tool use from parallel call
 * @param {string} parentId - Parent tool call ID
 * @param {number} index - Index of this tool in the array
 * @returns {object} Proper ToolCall object
 */
function convertNestedToolUse(nestedTool, parentId, index) {
  const nestedArgs = nestedTool.parameters || nestedTool.arguments || {};
  return tool.ToolCall.fromObject({
    id: `${parentId}_${index}`,
    type: "function",
    function: {
      name: extractNestedName(nestedTool),
      arguments: JSON.stringify(nestedArgs),
    },
  });
}

/**
 * Expands a hallucinated parallel tool call into proper individual tool calls.
 * @param {object} toolCall - The multi_tool_use.parallel tool call
 * @returns {object[]} Array of proper tool calls
 */
function expandParallelToolCall(toolCall) {
  try {
    const args = JSON.parse(toolCall.function.arguments || "{}");
    const toolUses = args.tool_uses || [];
    return toolUses.map((nested, i) =>
      convertNestedToolUse(nested, toolCall.id, i),
    );
  } catch {
    // If parsing fails, keep the original (will likely fail downstream)
    return [toolCall];
  }
}

/**
 * Fixes hallucinated multi_tool_use.parallel tool calls from OpenAI models.
 *
 * Some models occasionally emit a pseudo-tool call named "multi_tool_use.parallel"
 * or "parallel" that wraps multiple tool calls in its arguments. This function
 * detects and converts these to proper individual tool calls.
 * @see https://community.openai.com/t/model-tries-to-call-unknown-function-multi-tool-use-parallel/490653
 * @param {object[]} toolCalls - Array of tool call objects from LLM response
 * @returns {object[]} Fixed tool calls array with parallel calls expanded
 */
export function fixMultiToolUseParallel(toolCalls) {
  if (!toolCalls?.length) return toolCalls;

  return toolCalls.flatMap((toolCall) => {
    const functionName = toolCall.function?.name;
    if (isParallelHallucination(functionName)) {
      return expandParallelToolCall(toolCall);
    }
    return [toolCall];
  });
}
