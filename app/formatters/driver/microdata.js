/**
 * Driver formatting for microdata HTML output
 *
 * Generates clean, class-less HTML with microdata aligned with drivers.schema.json
 * RDF vocab: https://schema.forwardimpact.team/rdf/
 */

import {
  openTag,
  prop,
  metaTag,
  section,
  ul,
  escapeHtml,
  htmlDocument,
} from "../microdata-shared.js";
import { prepareDriversList, prepareDriverDetail } from "./shared.js";

/**
 * Format driver list as microdata HTML
 * @param {Array} drivers - Raw driver entities
 * @returns {string} HTML with microdata
 */
export function driverListToMicrodata(drivers) {
  const { items } = prepareDriversList(drivers);

  const content = items
    .map(
      (
        driver,
      ) => `${openTag("article", { itemtype: "Driver", itemid: `#${driver.id}` })}
${prop("h2", "name", driver.name)}
${prop("p", "description", driver.truncatedDescription)}
<p>Skills: ${driver.contributingSkillsCount} | Behaviours: ${driver.contributingBehavioursCount}</p>
</article>`,
    )
    .join("\n");

  return htmlDocument(
    "Drivers",
    `<main>
<h1>Drivers</h1>
${content}
</main>`,
  );
}

/**
 * Format driver detail as microdata HTML
 * @param {Object} driver - Raw driver entity
 * @param {Object} context - Additional context
 * @param {Array} context.skills - All skills
 * @param {Array} context.behaviours - All behaviours
 * @returns {string} HTML with microdata
 */
export function driverToMicrodata(driver, { skills, behaviours }) {
  const view = prepareDriverDetail(driver, { skills, behaviours });

  if (!view) return "";

  const sections = [];

  // Contributing skills - using contributingSkills property
  if (view.contributingSkills.length > 0) {
    const skillLinks = view.contributingSkills.map(
      (s) =>
        `${openTag("span", { itemprop: "contributingSkills" })}<a href="#${escapeHtml(s.id)}">${escapeHtml(s.name)}</a></span>`,
    );
    sections.push(section("Contributing Skills", ul(skillLinks), 2));
  }

  // Contributing behaviours - using contributingBehaviours property
  if (view.contributingBehaviours.length > 0) {
    const behaviourLinks = view.contributingBehaviours.map(
      (b) =>
        `${openTag("span", { itemprop: "contributingBehaviours" })}<a href="#${escapeHtml(b.id)}">${escapeHtml(b.name)}</a></span>`,
    );
    sections.push(section("Contributing Behaviours", ul(behaviourLinks), 2));
  }

  const body = `<main>
${openTag("article", { itemtype: "Driver", itemid: `#${view.id}` })}
${prop("h1", "name", view.name)}
${metaTag("id", view.id)}
${prop("p", "description", view.description)}
${sections.join("\n")}
</article>
</main>`;

  return htmlDocument(view.name, body);
}
