/**
 * Prompt template for stages.yaml — all stages in a single call.
 *
 * @param {string[]} stageIds - Stage ID list from DSL
 * @param {object} ctx - Universe context
 * @param {object} schema - JSON schema for stages
 * @returns {{ system: string, user: string }}
 */
export function buildStagePrompt(stageIds, ctx, schema) {
  return {
    system: [
      "You are an expert career framework author.",
      "Output ONLY valid JSON. No markdown fences, no explanations.",
      `The organization domain is: ${ctx.domain}.`,
      `Industry: ${ctx.industry}.`,
    ].join(" "),

    user: [
      "Generate engineering lifecycle stage definitions.",
      "",
      "## JSON Schema (you MUST conform to this exactly)",
      "```json",
      JSON.stringify(schema, null, 2),
      "```",
      "",
      `## Stage IDs: ${stageIds.join(", ")}`,
      "",
      "## Instructions",
      "- Output a JSON array of stage objects.",
      "- For each stage ID, generate:",
      "  - id: The stage ID (must be one of: specify, plan, onboard, code, review, deploy).",
      '  - name: Human-readable name (e.g., "Specify", "Plan").',
      "  - emojiIcon: A single emoji for this stage.",
      '  - description: 2-3 sentences in second person ("You...").',
      "  - summary: 1 sentence in third person.",
      "  - handoffs: Array of transitions to other stages, each with:",
      "    targetStage, label (button text), prompt (instructions for next stage).",
      "  - constraints: 2-3 restrictions on behaviour in this stage.",
      "  - readChecklist: 2-4 Read-Then-Do steps.",
      "  - confirmChecklist: 2-4 Do-Then-Confirm items.",
      "",
      "Output a JSON array.",
    ].join("\n"),
  };
}
