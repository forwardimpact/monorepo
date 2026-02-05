/**
 * Discipline formatting for microdata HTML output
 *
 * Generates clean, class-less HTML with microdata aligned with discipline.schema.json
 * RDF vocab: https://www.forwardimpact.team/schema/rdf/
 */

import {
  openTag,
  prop,
  metaTag,
  linkTag,
  section,
  ul,
  escapeHtml,
  htmlDocument,
} from "../microdata-shared.js";
import { prepareDisciplinesList, prepareDisciplineDetail } from "./shared.js";

/**
 * Format discipline list as microdata HTML
 * @param {Array} disciplines - Raw discipline entities
 * @returns {string} HTML with microdata
 */
export function disciplineListToMicrodata(disciplines) {
  const { items } = prepareDisciplinesList(disciplines);

  const content = items
    .map(
      (
        d,
      ) => `${openTag("article", { itemtype: "Discipline", itemid: `#${d.id}` })}
${prop("h2", "specialization", d.name)}
<p>Core: ${d.coreSkillsCount} | Supporting: ${d.supportingSkillsCount} | Broad: ${d.broadSkillsCount}</p>
</article>`,
    )
    .join("\n");

  return htmlDocument(
    "Disciplines",
    `<main>
<h1>Disciplines</h1>
${content}
</main>`,
  );
}

/**
 * Format discipline detail as microdata HTML
 * @param {Object} discipline - Raw discipline entity
 * @param {Object} context - Additional context
 * @param {Array} context.skills - All skills
 * @param {Array} context.behaviours - All behaviours
 * @param {boolean} [context.showBehaviourModifiers=true] - Whether to show behaviour modifiers section
 * @returns {string} HTML with microdata
 */
export function disciplineToMicrodata(
  discipline,
  { skills, behaviours, showBehaviourModifiers = true } = {},
) {
  const view = prepareDisciplineDetail(discipline, { skills, behaviours });

  if (!view) return "";

  const sections = [];

  // Core skills - using coreSkills property
  if (view.coreSkills.length > 0) {
    const skillLinks = view.coreSkills.map(
      (s) =>
        `${openTag("span", { itemprop: "coreSkills" })}<a href="#${escapeHtml(s.id)}">${escapeHtml(s.name)}</a></span>`,
    );
    sections.push(section("Core Skills", ul(skillLinks), 2));
  }

  // Supporting skills - using supportingSkills property
  if (view.supportingSkills.length > 0) {
    const skillLinks = view.supportingSkills.map(
      (s) =>
        `${openTag("span", { itemprop: "supportingSkills" })}<a href="#${escapeHtml(s.id)}">${escapeHtml(s.name)}</a></span>`,
    );
    sections.push(section("Supporting Skills", ul(skillLinks), 2));
  }

  // Broad skills - using broadSkills property
  if (view.broadSkills.length > 0) {
    const skillLinks = view.broadSkills.map(
      (s) =>
        `${openTag("span", { itemprop: "broadSkills" })}<a href="#${escapeHtml(s.id)}">${escapeHtml(s.name)}</a></span>`,
    );
    sections.push(section("Broad Skills", ul(skillLinks), 2));
  }

  // Behaviour modifiers - using BehaviourModifier itemtype
  if (showBehaviourModifiers && view.behaviourModifiers.length > 0) {
    const modifierItems = view.behaviourModifiers.map((b) => {
      const modifierStr = b.modifier > 0 ? `+${b.modifier}` : `${b.modifier}`;
      return `${openTag("span", { itemtype: "BehaviourModifier", itemprop: "behaviourModifiers" })}
${linkTag("targetBehaviour", `#${b.id}`)}
<a href="#${escapeHtml(b.id)}">${escapeHtml(b.name)}</a>: ${openTag("span", { itemprop: "modifierValue" })}${modifierStr}</span>
</span>`;
    });
    sections.push(section("Behaviour Modifiers", ul(modifierItems), 2));
  }

  const body = `<main>
${openTag("article", { itemtype: "Discipline", itemid: `#${view.id}` })}
${prop("h1", "specialization", view.name)}
${metaTag("id", view.id)}
${discipline.roleTitle ? prop("p", "roleTitle", discipline.roleTitle) : ""}
${prop("p", "description", view.description)}
${sections.join("\n")}
</article>
</main>`;

  return htmlDocument(view.name, body);
}
