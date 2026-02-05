/**
 * Skill formatting for microdata HTML output
 *
 * Generates clean, class-less HTML with microdata aligned with capability.schema.json
 * RDF vocab: https://www.forwardimpact.team/schema/rdf/
 */

import {
  openTag,
  prop,
  propRaw,
  metaTag,
  section,
  dl,
  ul,
  escapeHtml,
  formatLevelName,
  htmlDocument,
} from "../microdata-shared.js";
import { prepareSkillsList, prepareSkillDetail } from "./shared.js";

/**
 * Format skill list as microdata HTML
 * @param {Array} skills - Raw skill entities
 * @param {Array} capabilities - Capability entities
 * @returns {string} HTML with microdata
 */
export function skillListToMicrodata(skills, capabilities) {
  const { groups, groupOrder } = prepareSkillsList(skills, capabilities);

  const content = groupOrder
    .map((capability) => {
      const capabilitySkills = groups[capability];
      const skillItems = capabilitySkills
        .map(
          (
            skill,
          ) => `${openTag("article", { itemtype: "Skill", itemid: `#${skill.id}` })}
${prop("h3", "name", skill.name)}
${prop("p", "description", skill.truncatedDescription)}
${metaTag("capability", capability)}
</article>`,
        )
        .join("\n");

      return section(formatLevelName(capability), skillItems, 2);
    })
    .join("\n");

  return htmlDocument(
    "Skills",
    `<main>
<h1>Skills</h1>
${content}
</main>`,
  );
}

/**
 * Format skill detail as microdata HTML
 * @param {Object} skill - Raw skill entity
 * @param {Object} context - Additional context
 * @param {Array} context.disciplines - All disciplines
 * @param {Array} context.tracks - All tracks
 * @param {Array} context.drivers - All drivers
 * @param {Array} context.capabilities - Capability entities
 * @returns {string} HTML with microdata
 */
export function skillToMicrodata(
  skill,
  { disciplines, tracks, drivers, capabilities },
) {
  const view = prepareSkillDetail(skill, {
    disciplines,
    tracks,
    drivers,
    capabilities,
  });

  if (!view) return "";

  const sections = [];

  // Human-only badge
  if (view.isHumanOnly) {
    sections.push(`<p><strong>Human-Only</strong> — Requires interpersonal skills; excluded from agents</p>
${metaTag("isHumanOnly", "true")}`);
  }

  // Level descriptions - uses LevelDescriptions itemtype
  const levelPairs = Object.entries(view.levelDescriptions).map(
    ([level, desc]) => ({
      term: formatLevelName(level),
      definition: desc,
      itemprop: `${level}Description`,
    }),
  );
  sections.push(
    section(
      "Level Descriptions",
      `${openTag("div", { itemtype: "LevelDescriptions", itemprop: "levelDescriptions" })}
${dl(levelPairs)}
</div>`,
      2,
    ),
  );

  // Related disciplines
  if (view.relatedDisciplines.length > 0) {
    const disciplineItems = view.relatedDisciplines.map(
      (d) =>
        `<a href="#${escapeHtml(d.id)}">${escapeHtml(d.name)}</a> (${escapeHtml(d.skillType)})`,
    );
    sections.push(section("Used in Disciplines", ul(disciplineItems), 2));
  }

  // Related tracks with modifiers
  if (view.relatedTracks.length > 0) {
    const trackItems = view.relatedTracks.map((t) => {
      const modifierStr = t.modifier > 0 ? `+${t.modifier}` : `${t.modifier}`;
      return `<a href="#${escapeHtml(t.id)}">${escapeHtml(t.name)}</a>: ${modifierStr}`;
    });
    sections.push(section("Modified by Tracks", ul(trackItems), 2));
  }

  // Related drivers
  if (view.relatedDrivers.length > 0) {
    const driverItems = view.relatedDrivers.map(
      (d) => `<a href="#${escapeHtml(d.id)}">${escapeHtml(d.name)}</a>`,
    );
    sections.push(section("Linked to Drivers", ul(driverItems), 2));
  }

  const body = `<main>
${openTag("article", { itemtype: "Skill", itemid: `#${view.id}` })}
${prop("h1", "name", view.name)}
${metaTag("id", view.id)}
${metaTag("capability", view.capability)}
${propRaw(
  "div",
  "human",
  `${openTag("div", { itemtype: "SkillHumanSection" })}
${prop("p", "description", view.description)}
${sections.join("\n")}
</div>`,
)}
</article>
</main>`;

  return htmlDocument(view.name, body);
}
