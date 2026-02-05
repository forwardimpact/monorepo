/**
 * Behaviour formatting for microdata HTML output
 *
 * Generates clean, class-less HTML with microdata aligned with behaviour.schema.json
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
import { prepareBehavioursList, prepareBehaviourDetail } from "./shared.js";

/**
 * Format behaviour list as microdata HTML
 * @param {Array} behaviours - Raw behaviour entities
 * @returns {string} HTML with microdata
 */
export function behaviourListToMicrodata(behaviours) {
  const { items } = prepareBehavioursList(behaviours);

  const content = items
    .map(
      (
        behaviour,
      ) => `${openTag("article", { itemtype: "Behaviour", itemid: `#${behaviour.id}` })}
${prop("h2", "name", behaviour.name)}
${prop("p", "description", behaviour.truncatedDescription)}
</article>`,
    )
    .join("\n");

  return htmlDocument(
    "Behaviours",
    `<main>
<h1>Behaviours</h1>
${content}
</main>`,
  );
}

/**
 * Format behaviour detail as microdata HTML
 * @param {Object} behaviour - Raw behaviour entity
 * @param {Object} context - Additional context
 * @param {Array} context.drivers - All drivers
 * @returns {string} HTML with microdata
 */
export function behaviourToMicrodata(behaviour, { drivers }) {
  const view = prepareBehaviourDetail(behaviour, { drivers });

  if (!view) return "";

  const sections = [];

  // Maturity descriptions - uses MaturityDescriptions itemtype
  const maturityPairs = Object.entries(view.maturityDescriptions).map(
    ([maturity, desc]) => ({
      term: formatLevelName(maturity),
      definition: desc,
      itemprop: `${maturity.replace(/_([a-z])/g, (_, c) => c.toUpperCase())}Description`,
    }),
  );
  sections.push(
    section(
      "Maturity Levels",
      `${openTag("div", { itemtype: "MaturityDescriptions", itemprop: "maturityDescriptions" })}
${dl(maturityPairs)}
</div>`,
      2,
    ),
  );

  // Related drivers
  if (view.relatedDrivers.length > 0) {
    const driverItems = view.relatedDrivers.map(
      (d) => `<a href="#${escapeHtml(d.id)}">${escapeHtml(d.name)}</a>`,
    );
    sections.push(section("Linked to Drivers", ul(driverItems), 2));
  }

  const body = `<main>
${openTag("article", { itemtype: "Behaviour", itemid: `#${view.id}` })}
${prop("h1", "name", view.name)}
${metaTag("id", view.id)}
${propRaw(
  "div",
  "human",
  `${openTag("div", { itemtype: "BehaviourHumanSection" })}
${prop("p", "description", view.description)}
${sections.join("\n")}
</div>`,
)}
</article>
</main>`;

  return htmlDocument(view.name, body);
}
