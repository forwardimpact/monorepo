import { buildPreamble } from "./preamble.js";
import { MATURITY_LEVELS } from "@forwardimpact/libsyntheticgen/vocabulary.js";

/**
 * Prompt template for a single behaviour entity.
 *
 * @param {object} skeleton - Behaviour skeleton { id, name }
 * @param {object} ctx - Terrain context
 * @param {object} schema - JSON schema for behaviour
 * @returns {{ system: string, user: string }}
 */
export function buildBehaviourPrompt(skeleton, ctx, schema, priorOutput) {
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
      "Generate a behaviour definition for an agent-aligned engineering standard.",
      "",
      "## JSON Schema",
      "Make your output conform to this schema exactly.",
      "```json",
      JSON.stringify(schema, null, 2),
      "```",
      "",
      `## Behaviour: "${skeleton.name}" (ID: ${skeleton.id})`,
      "",
      "## Instructions",
      "- name: Use the provided name exactly.",
      "- human.description: Write 2-3 sentences that describe this behaviour.",
      "- human.maturityDescriptions: Write one paragraph for each maturity",
      `  level (${MATURITY_LEVELS.join(", ")}).`,
      '  Use the second person ("You..."). Each level must show clear',
      "  progression in depth, consistency, and influence.",
      "- agent.title: Write a short title of 2-4 words. The title tells how",
      "  the agent applies this behaviour.",
      "- agent.workingStyle: Write 1-2 sentences that describe how the AI",
      "  agent shows this behaviour in its work style and communication.",
      "",
      ...(priorOutput?.levels
        ? [
            "",
            "## Previously generated context",
            "Level titles and proficiency baselines:",
            ...(Array.isArray(priorOutput.levels)
              ? priorOutput.levels.map(
                  (l) =>
                    `- ${l.id}: ${l.professionalTitle || l.id} (core: ${l.baseSkillProficiencies?.core || "N/A"})`,
                )
              : []),
          ]
        : []),
      "",
      "Output a single JSON object for this behaviour file.",
    ].join("\n"),
  };
}
