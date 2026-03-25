/**
 * Prompt template for a single capability entity (with skills).
 *
 * @param {object} skeleton - Capability skeleton { id, name, skills, ordinalRank }
 * @param {object} ctx - Universe context
 * @param {object} schema - JSON schema for capability
 * @returns {{ system: string, user: string }}
 */
export function buildCapabilityPrompt(skeleton, ctx, schema) {
  return {
    system: [
      "You are an expert career framework author.",
      "Output ONLY valid JSON. No markdown fences, no explanations.",
      `The organization domain is: ${ctx.domain}.`,
      `Industry: ${ctx.industry}.`,
    ].join(" "),

    user: [
      "Generate a capability definition for a career framework.",
      "",
      "## JSON Schema (you MUST conform to this exactly)",
      "```json",
      JSON.stringify(schema, null, 2),
      "```",
      "",
      `## Skeleton`,
      `Capability ID: ${skeleton.id}`,
      `Capability name: ${skeleton.name}`,
      `Skills to define: ${skeleton.skills.join(", ")}`,
      `Ordinal rank: ${skeleton.ordinalRank}`,
      "",
      "## Instructions",
      "- id: Use the provided capability ID.",
      "- name: Use the provided name.",
      "- emojiIcon: A single emoji representing this capability.",
      `- ordinalRank: ${skeleton.ordinalRank}`,
      "- description: 1-2 sentences describing this capability area.",
      "- professionalResponsibilities: One sentence per proficiency level",
      "  (awareness through expert) describing IC expectations.",
      "- managementResponsibilities: Same for management track.",
      "- skills: For each skill ID listed above, generate:",
      "  - id: Use the provided skill ID exactly.",
      "  - name: Human-readable name (title case).",
      "  - human.description: 2-3 sentences.",
      "  - human.proficiencyDescriptions: One paragraph per level",
      "    (awareness, foundational, working, practitioner, expert).",
      '    Use second-person ("You..."). Each level must show clear',
      "    progression in scope, autonomy, and complexity.",
      "- For each skill, also generate an agent section:",
      "  - agent.name: kebab-case name (e.g., 'code-review', 'data-modeling').",
      "  - agent.description: 1 sentence describing what this agent skill provides.",
      "  - agent.useWhen: 1 sentence describing when/why an agent should use this skill.",
      "  - agent.stages: Object with keys: specify, plan, onboard, code, review, deploy.",
      "    Each stage has:",
      "    - focus: 1 sentence — the primary focus for this skill in this stage.",
      "    - readChecklist: Array of 2-3 items — steps to read/understand before acting.",
      "    - confirmChecklist: Array of 2-3 items — items to verify after completing work.",
      "",
      "Output the JSON object for this single capability file.",
    ].join("\n"),
  };
}
