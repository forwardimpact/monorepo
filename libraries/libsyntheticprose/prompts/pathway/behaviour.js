/**
 * Prompt template for a single behaviour entity.
 *
 * @param {object} skeleton - Behaviour skeleton { id, name }
 * @param {object} ctx - Universe context
 * @param {object} schema - JSON schema for behaviour
 * @returns {{ system: string, user: string }}
 */
export function buildBehaviourPrompt(skeleton, ctx, schema) {
  return {
    system: [
      "You are an expert career framework author.",
      "Output ONLY valid JSON. No markdown fences, no explanations.",
      `The organization domain is: ${ctx.domain}.`,
      `Industry: ${ctx.industry}.`,
    ].join(" "),

    user: [
      "Generate a behaviour definition for a career framework.",
      "",
      "## JSON Schema (you MUST conform to this exactly)",
      "```json",
      JSON.stringify(schema, null, 2),
      "```",
      "",
      `## Behaviour: "${skeleton.name}" (ID: ${skeleton.id})`,
      "",
      "## Instructions",
      "- name: Use the provided name exactly.",
      "- human.description: 2-3 sentences describing this behaviour.",
      "- human.maturityDescriptions: One paragraph per maturity level",
      "  (emerging, developing, practicing, role_modeling, exemplifying).",
      '  Use second-person ("You..."). Each level must show clear',
      "  progression in depth, consistency, and influence.",
      "- agent.title: Short title (2-4 words) for how the agent applies this behaviour.",
      "- agent.workingStyle: 1-2 sentences describing how the AI agent should embody",
      "  this behaviour in its work style and communication.",
      "",
      "Output a single JSON object for this behaviour file.",
    ].join("\n"),
  };
}
