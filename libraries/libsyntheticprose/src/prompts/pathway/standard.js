import { buildPreamble } from "./preamble.js";

/**
 * Prompt template for standard.yaml metadata.
 *
 * @param {object} skeleton - Standard skeleton from DSL
 * @param {object} ctx - Terrain context (domain, industry, standardName)
 * @param {object} schema - JSON schema for standard entity
 * @returns {{ system: string, user: string }}
 */
export function buildStandardPrompt(skeleton, ctx, schema) {
  return {
    system:
      buildPreamble(ctx.standardName || ctx.domain) +
      "\n\n" +
      [
        "You are an expert author of agent-aligned engineering standards.",
        "Output ONLY valid JSON. No markdown fences, no explanations.",
        `The organization domain is: ${ctx.domain}.`,
        `Industry: ${ctx.industry}.`,
      ].join(" "),

    user: [
      "Generate a standard metadata file for an agent-aligned engineering standard.",
      "",
      "## JSON Schema (you MUST conform to this exactly)",
      "```json",
      JSON.stringify(schema, null, 2),
      "```",
      "",
      "## Instructions",
      '- title: A short, compelling title for this engineering pathway (e.g., "BioNova Engineering Pathway").',
      "- emojiIcon: A single emoji that represents engineering growth.",
      '- tag: A short hashtag identifier (e.g., "#BioNova").',
      "- description: 2-3 sentences that describe the agent-aligned engineering standard's purpose.",
      `- distribution.siteUrl: Use "https://${ctx.domain}/pathway".`,
      "- entityDefinitions: Define these entity types:",
      "  driver, skill, behaviour, discipline, level, track, job, agent, tool.",
      "  Each needs: title, emojiIcon, description (1 sentence).",
      "",
      "Output a single JSON object.",
    ].join("\n"),
  };
}
