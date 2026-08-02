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
        "Output only valid JSON. Do not add markdown fences. Do not add explanations.",
        `The organization domain is: ${ctx.domain}.`,
        `Industry: ${ctx.industry}.`,
      ].join(" "),

    user: [
      "Generate a standard metadata file for an agent-aligned engineering standard.",
      "",
      "## JSON Schema",
      "Make your output conform to this schema exactly.",
      "```json",
      JSON.stringify(schema, null, 2),
      "```",
      "",
      "## Instructions",
      "- title: Write a short, compelling title for this engineering",
      '  pathway. Example: "BioNova Engineering Pathway".',
      "- emojiIcon: Give one emoji that represents engineering growth.",
      '- tag: Write a short hashtag identifier. Example: "#BioNova".',
      "- description: Write 2-3 sentences that describe the purpose of the",
      "  agent-aligned engineering standard.",
      `- distribution.siteUrl: Use "https://${ctx.domain}/pathway".`,
      "- entityDefinitions: Define these entity types:",
      "  driver, skill, behaviour, discipline, level, track, job, agent, tool.",
      "  Each entity type needs: title, emojiIcon, and a description of 1",
      "  sentence.",
      "",
      "Output a single JSON object.",
    ].join("\n"),
  };
}
