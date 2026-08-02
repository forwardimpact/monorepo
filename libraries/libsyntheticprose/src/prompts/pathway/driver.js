import { buildPreamble } from "./preamble.js";

/**
 * Prompt template for drivers.yaml (all drivers in a single call).
 *
 * @param {object[]} drivers - Driver skeletons from DSL
 * @param {object} ctx - Terrain context (includes skillIds, behaviourIds)
 * @param {object} schema - JSON schema for drivers
 * @returns {{ system: string, user: string }}
 */
export function buildDriverPrompt(drivers, ctx, schema) {
  const driverList = drivers
    .map((d) => {
      const parts = [`  - id: ${d.id}, name: "${d.name}"`];
      if (d.skills?.length) parts.push(`    skills: [${d.skills.join(", ")}]`);
      if (d.behaviours?.length)
        parts.push(`    behaviours: [${d.behaviours.join(", ")}]`);
      return parts.join("\n");
    })
    .join("\n");

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
      "Generate organizational driver definitions for an agent-aligned engineering standard.",
      "",
      "## JSON Schema",
      "Make your output conform to this schema exactly.",
      "```json",
      JSON.stringify(schema, null, 2),
      "```",
      "",
      "## Driver Skeletons",
      driverList,
      "",
      `## Available skill IDs: ${(ctx.skillIds || []).join(", ")}`,
      `## Available behaviour IDs: ${(ctx.behaviourIds || []).join(", ")}`,
      "",
      "## Instructions",
      "- Output a JSON array of driver objects.",
      "- For each driver:",
      "  - id: Use the provided ID.",
      "  - name: Use the provided name.",
      "  - description: Write 2-3 sentences that describe this",
      "    organizational outcome.",
      "  - contributingSkills: Use the skill IDs from the skeleton.",
      "    Each skill ID must come from the available list above.",
      "  - contributingBehaviours: Use the behaviour IDs from the skeleton.",
      "    Each behaviour ID must come from the available list above.",
      "",
      "Output a JSON array.",
    ].join("\n"),
  };
}
