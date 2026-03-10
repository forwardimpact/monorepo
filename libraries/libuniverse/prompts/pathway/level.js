/**
 * Prompt template for levels.yaml — all levels in a single call.
 *
 * @param {object[]} levels - Level skeletons from DSL
 * @param {object} ctx - Universe context
 * @param {object} schema - JSON schema for levels
 * @returns {{ system: string, user: string }}
 */
export function buildLevelPrompt(levels, ctx, schema) {
  const levelList = levels
    .map(
      (l) =>
        `  - id: ${l.id}, professionalTitle: "${l.professionalTitle || ""}", rank: ${l.rank}, experience: "${l.experience || ""}"`,
    )
    .join("\n");

  return {
    system: [
      "You are an expert career framework author.",
      "Output ONLY valid JSON. No markdown fences, no explanations.",
      `The organization domain is: ${ctx.domain}.`,
      `Industry: ${ctx.industry}.`,
    ].join(" "),

    user: [
      "Generate career level definitions for an engineering pathway.",
      "",
      "## JSON Schema (you MUST conform to this exactly)",
      "```json",
      JSON.stringify(schema, null, 2),
      "```",
      "",
      "## Level Skeletons",
      levelList,
      "",
      "## Instructions",
      "- Output a JSON array of level objects.",
      "- For each level, generate:",
      "  - id: Use the provided ID (uppercase, e.g., J040).",
      "  - professionalTitle: Use the provided title or generate one.",
      "  - managementTitle: Generate a management-track equivalent.",
      "  - ordinalRank: Use the provided rank.",
      "  - typicalExperienceRange: Use the provided experience range.",
      "  - qualificationSummary: 2-3 sentences describing qualifications.",
      "    May use {typicalExperienceRange} placeholder.",
      "  - baseSkillProficiencies: { primary, secondary, broad } using",
      "    awareness/foundational/working/practitioner/expert.",
      "    Increase across levels (L1→awareness, L5→expert for primary).",
      "  - baseBehaviourMaturity: emerging/developing/practicing/role_modeling/exemplifying.",
      "    Increase across levels.",
      "  - expectations: { impactScope, autonomyExpectation, influenceScope, complexityHandled }.",
      "    Each 1 sentence showing clear progression.",
      "  - breadthCriteria: Only for rank >= 4. Object mapping proficiency → min count.",
      "",
      "Output a JSON array.",
    ].join("\n"),
  };
}
