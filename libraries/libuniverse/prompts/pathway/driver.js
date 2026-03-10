/**
 * Prompt template for drivers.yaml — all drivers in a single call.
 *
 * @param {object[]} drivers - Driver skeletons from DSL
 * @param {object} ctx - Universe context (includes skillIds, behaviourIds)
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
    system: [
      "You are an expert career framework author.",
      "Output ONLY valid JSON. No markdown fences, no explanations.",
      `The organization domain is: ${ctx.domain}.`,
      `Industry: ${ctx.industry}.`,
    ].join(" "),

    user: [
      "Generate organizational driver definitions for a career framework.",
      "",
      "## JSON Schema (you MUST conform to this exactly)",
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
      "  - description: 2-3 sentences describing this organizational outcome.",
      "  - contributingSkills: Use the skill IDs listed in the skeleton.",
      "    All referenced skill IDs MUST be from the available list above.",
      "  - contributingBehaviours: Use the behaviour IDs listed in the skeleton.",
      "    All referenced behaviour IDs MUST be from the available list above.",
      "",
      "Output a JSON array.",
    ].join("\n"),
  };
}
