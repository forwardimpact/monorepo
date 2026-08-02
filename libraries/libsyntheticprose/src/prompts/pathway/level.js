import { buildPreamble } from "./preamble.js";
import {
  PROFICIENCY_LEVELS,
  MATURITY_LEVELS,
} from "@forwardimpact/libsyntheticgen/vocabulary.js";

/**
 * Prompt template for levels.yaml (all levels in a single call).
 *
 * @param {object[]} levels - Level skeletons from DSL
 * @param {object} ctx - Terrain context
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
      "Generate career level definitions for an engineering pathway.",
      "",
      "## JSON Schema",
      "Make your output conform to this schema exactly.",
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
      "  - id: Use the provided ID in uppercase, for example J040.",
      "  - professionalTitle: Write one of these forms: a single capitalized",
      '    rank word ("Associate", "Senior", "Staff", "Principal"), a',
      '    seniority-qualified rank ("Senior Staff", "Senior Principal"), or',
      '    a "Level <roman>" or "Level <digit>" form.',
      "    If the level skeleton supplies professionalTitle, use it verbatim.",
      '    If it does not, write "Level <roman>" from the supplied rank (1→I, 2→II, …).',
      "    Do not write a multi-word role-complete title such as",
      '    "Senior Engineer". The discipline supplies the role.',
      "  - managementTitle: Generate a management-track equivalent.",
      "  - ordinalRank: Use the provided rank.",
      "  - typicalExperienceRange: Use the provided experience range.",
      "  - qualificationSummary: Write 2-3 sentences that describe the",
      "    qualifications. You can use the {typicalExperienceRange}",
      "    placeholder.",
      "  - baseSkillProficiencies: Write { core, supporting, broad } with",
      `    values from: ${PROFICIENCY_LEVELS.join(", ")}.`,
      `    Increase the values across levels (L1→${PROFICIENCY_LEVELS[0]}, L5→${PROFICIENCY_LEVELS.at(-1)} for core).`,
      `  - baseBehaviourMaturity: Use one of: ${MATURITY_LEVELS.join(", ")}.`,
      "    Increase the value across levels.",
      "  - expectations: Write { impactScope, autonomyExpectation,",
      "    influenceScope, complexityHandled }. Write 1 sentence for each.",
      "    Show clear progression across levels.",
      "    autonomyExpectation must start with a base-form verb, for example",
      '    "Work…", "Lead…", "Define…". Do not start with a third-person',
      '    form such as "Works…", "Owns…", "Drives…".',
      "  - breadthCriteria: Write this only for rank >= 4. Write an object",
      "    that maps a proficiency to a minimum count.",
      "",
      "Output a JSON array.",
    ].join("\n"),
  };
}
