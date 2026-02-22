/**
 * Level formatting for microdata HTML output
 *
 * Generates clean, class-less HTML with microdata aligned with levels.schema.json
 * RDF vocab: https://www.forwardimpact.team/schema/rdf/
 */

import {
  openTag,
  prop,
  metaTag,
  linkTag,
  section,
  dl,
  escapeHtml,
  formatLevelName,
  htmlDocument,
} from "../microdata-shared.js";
import { prepareLevelsList, prepareLevelDetail } from "./shared.js";

/**
 * Format level list as microdata HTML
 * @param {Array} levels - Raw level entities
 * @returns {string} HTML with microdata
 */
export function levelListToMicrodata(levels) {
  const { items } = prepareLevelsList(levels);

  const content = items
    .map(
      (g) => `${openTag("article", { itemtype: "Level", itemid: `#${g.id}` })}
${prop("h2", "id", g.id)}
<p>${escapeHtml(g.displayName)}</p>
${g.typicalExperienceRange ? prop("p", "typicalExperienceRange", g.typicalExperienceRange) : ""}
${metaTag("ordinalRank", String(g.ordinalRank))}
</article>`,
    )
    .join("\n");

  return htmlDocument(
    "Levels",
    `<main>
<h1>Levels</h1>
${content}
</main>`,
  );
}

/**
 * Format level detail as microdata HTML
 * @param {Object} level - Raw level entity
 * @returns {string} HTML with microdata
 */
export function levelToMicrodata(level) {
  const view = prepareLevelDetail(level);

  if (!view) return "";

  const sections = [];

  // Titles section
  if (view.professionalTitle || view.managementTitle) {
    const titlePairs = [];
    if (view.professionalTitle) {
      titlePairs.push({
        term: "Professional Track",
        definition: view.professionalTitle,
        itemprop: "professionalTitle",
      });
    }
    if (view.managementTitle) {
      titlePairs.push({
        term: "Management Track",
        definition: view.managementTitle,
        itemprop: "managementTitle",
      });
    }
    sections.push(section("Titles", dl(titlePairs), 2));
  }

  // Base skill proficiencies - using BaseSkillProficiencies itemtype
  if (
    view.baseSkillProficiencies &&
    Object.keys(view.baseSkillProficiencies).length > 0
  ) {
    const levelPairs = Object.entries(view.baseSkillProficiencies).map(
      ([type, level]) => ({
        term: formatLevelName(type),
        definition: formatLevelName(level),
        itemprop: type,
      }),
    );
    sections.push(
      section(
        "Base Skill Proficiencies",
        `${openTag("div", { itemtype: "BaseSkillProficiencies", itemprop: "baseSkillProficiencies" })}
${dl(levelPairs)}
</div>`,
        2,
      ),
    );
  }

  // Base behaviour maturity - link to BehaviourMaturity
  if (view.baseBehaviourMaturity) {
    const maturityContent = `${linkTag("baseBehaviourMaturity", `#${level.baseBehaviourMaturity}`)}
<p>${formatLevelName(level.baseBehaviourMaturity)}</p>`;
    sections.push(section("Base Behaviour Maturity", maturityContent, 2));
  }

  // Expectations - using LevelExpectations itemtype
  if (view.expectations && Object.keys(view.expectations).length > 0) {
    const expectationPairs = Object.entries(view.expectations).map(
      ([key, value]) => ({
        term: formatLevelName(key),
        definition: value,
        itemprop: key,
      }),
    );
    sections.push(
      section(
        "Expectations",
        `${openTag("div", { itemtype: "LevelExpectations", itemprop: "expectations" })}
${dl(expectationPairs)}
</div>`,
        2,
      ),
    );
  }

  const body = `<main>
${openTag("article", { itemtype: "Level", itemid: `#${view.id}` })}
<h1>${prop("span", "id", view.id)} — ${escapeHtml(view.displayName)}</h1>
${metaTag("ordinalRank", String(view.ordinalRank))}
${view.typicalExperienceRange ? prop("p", "typicalExperienceRange", `Experience: ${view.typicalExperienceRange}`) : ""}
${sections.join("\n")}
</article>
</main>`;

  return htmlDocument(`${view.id} - ${view.displayName}`, body);
}
