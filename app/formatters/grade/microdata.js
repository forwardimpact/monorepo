/**
 * Grade formatting for microdata HTML output
 *
 * Generates clean, class-less HTML with microdata aligned with grades.schema.json
 * RDF vocab: https://schema.forwardimpact.team/rdf/
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
import { prepareGradesList, prepareGradeDetail } from "./shared.js";

/**
 * Format grade list as microdata HTML
 * @param {Array} grades - Raw grade entities
 * @returns {string} HTML with microdata
 */
export function gradeListToMicrodata(grades) {
  const { items } = prepareGradesList(grades);

  const content = items
    .map(
      (g) => `${openTag("article", { itemtype: "Grade", itemid: `#${g.id}` })}
${prop("h2", "id", g.id)}
<p>${escapeHtml(g.displayName)}</p>
${g.typicalExperienceRange ? prop("p", "typicalExperienceRange", g.typicalExperienceRange) : ""}
${metaTag("ordinalRank", String(g.ordinalRank))}
</article>`,
    )
    .join("\n");

  return htmlDocument(
    "Grades",
    `<main>
<h1>Grades</h1>
${content}
</main>`,
  );
}

/**
 * Format grade detail as microdata HTML
 * @param {Object} grade - Raw grade entity
 * @returns {string} HTML with microdata
 */
export function gradeToMicrodata(grade) {
  const view = prepareGradeDetail(grade);

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

  // Base skill levels - using BaseSkillLevels itemtype
  if (view.baseSkillLevels && Object.keys(view.baseSkillLevels).length > 0) {
    const levelPairs = Object.entries(view.baseSkillLevels).map(
      ([type, level]) => ({
        term: formatLevelName(type),
        definition: formatLevelName(level),
        itemprop: type,
      }),
    );
    sections.push(
      section(
        "Base Skill Levels",
        `${openTag("div", { itemtype: "BaseSkillLevels", itemprop: "baseSkillLevels" })}
${dl(levelPairs)}
</div>`,
        2,
      ),
    );
  }

  // Base behaviour maturity - link to BehaviourMaturity
  if (
    view.baseBehaviourMaturity &&
    Object.keys(view.baseBehaviourMaturity).length > 0
  ) {
    const maturityPairs = Object.entries(view.baseBehaviourMaturity).map(
      ([type, maturity]) => ({
        term: formatLevelName(type),
        definition: formatLevelName(maturity),
      }),
    );
    // Handle both single value and object cases
    const maturityContent =
      typeof grade.baseBehaviourMaturity === "string"
        ? `${linkTag("baseBehaviourMaturity", `#${grade.baseBehaviourMaturity}`)}
<p>${formatLevelName(grade.baseBehaviourMaturity)}</p>`
        : dl(maturityPairs);
    sections.push(section("Base Behaviour Maturity", maturityContent, 2));
  }

  // Expectations - using GradeExpectations itemtype
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
        `${openTag("div", { itemtype: "GradeExpectations", itemprop: "expectations" })}
${dl(expectationPairs)}
</div>`,
        2,
      ),
    );
  }

  const body = `<main>
${openTag("article", { itemtype: "Grade", itemid: `#${view.id}` })}
<h1>${prop("span", "id", view.id)} — ${escapeHtml(view.displayName)}</h1>
${metaTag("ordinalRank", String(view.ordinalRank))}
${view.typicalExperienceRange ? prop("p", "typicalExperienceRange", `Experience: ${view.typicalExperienceRange}`) : ""}
${sections.join("\n")}
</article>
</main>`;

  return htmlDocument(`${view.id} - ${view.displayName}`, body);
}
