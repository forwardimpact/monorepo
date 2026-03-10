/**
 * Prompt template for framework.yaml metadata.
 *
 * @param {object} skeleton - Framework skeleton from DSL
 * @param {object} ctx - Universe context (domain, industry)
 * @param {object} schema - JSON schema for framework entity
 * @returns {{ system: string, user: string }}
 */
export function buildFrameworkPrompt(skeleton, ctx, schema) {
  return {
    system: [
      "You are an expert career framework author.",
      "Output ONLY valid JSON. No markdown fences, no explanations.",
      `The organization domain is: ${ctx.domain}.`,
      `Industry: ${ctx.industry}.`,
    ].join(" "),

    user: [
      "Generate a framework metadata file for an engineering career framework.",
      "",
      "## JSON Schema (you MUST conform to this exactly)",
      "```json",
      JSON.stringify(schema, null, 2),
      "```",
      "",
      "## Instructions",
      '- title: A short, compelling title for this engineering pathway (e.g., "BioNova Engineering Pathway").',
      "- emojiIcon: A single emoji representing engineering growth.",
      '- tag: A short hashtag identifier (e.g., "#BioNova").',
      "- description: 2-3 sentences describing the framework's purpose.",
      `- distribution.siteUrl: Use "https://${ctx.domain}/pathway".`,
      "- entityDefinitions: Provide definitions for these entity types:",
      "  driver, skill, behaviour, discipline, level, track, job, agent, stage, tool.",
      "  Each needs: title, emojiIcon, description (1 sentence).",
      "",
      "Output a single JSON object.",
    ].join("\n"),
  };
}
