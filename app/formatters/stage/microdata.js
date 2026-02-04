/**
 * Stage formatting for microdata HTML output
 *
 * Generates clean, class-less HTML with microdata aligned with stages.schema.json
 * RDF vocab: https://schema.forwardimpact.team/rdf/
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
import { prepareStagesList, prepareStageDetail } from "./shared.js";

/**
 * Format stage list as microdata HTML
 * @param {Array} stages - Raw stage entities
 * @returns {string} HTML with microdata
 */
export function stageListToMicrodata(stages) {
  const { items } = prepareStagesList(stages);

  const content = items
    .map((stage) => {
      const handoffText =
        stage.handoffs.length > 0
          ? `→ ${stage.handoffs.map((h) => h.target).join(", ")}`
          : "";
      return `${openTag("article", { itemtype: "Stage", itemid: `#${stage.id}` })}
${prop("h2", "name", `${stage.emojiIcon} ${stage.name}`)}
${prop("p", "description", stage.truncatedDescription)}
${handoffText ? `<p>Handoffs: ${handoffText}</p>` : ""}
</article>`;
    })
    .join("\n");

  return htmlDocument(
    "Stages",
    `<main>
<h1>Stages</h1>
${content}
</main>`,
  );
}

/**
 * Format stage detail as microdata HTML
 * @param {Object} stage - Raw stage entity
 * @returns {string} HTML with microdata
 */
export function stageToMicrodata(stage) {
  const view = prepareStageDetail(stage);

  if (!view) return "";

  const sections = [];

  // Entry criteria
  if (view.entryCriteria.length > 0) {
    const criteriaItems = view.entryCriteria.map((c) => escapeHtml(c));
    sections.push(
      section("Entry Criteria", ul(criteriaItems, "entryCriteria"), 2),
    );
  }

  // Constraints
  if (view.constraints.length > 0) {
    const constraintItems = view.constraints.map((c) => escapeHtml(c));
    sections.push(
      section("Constraints", ul(constraintItems, "constraints"), 2),
    );
  }

  // Exit criteria
  if (view.exitCriteria.length > 0) {
    const exitItems = view.exitCriteria.map((c) => escapeHtml(c));
    sections.push(section("Exit Criteria", ul(exitItems, "exitCriteria"), 2));
  }

  // Handoffs - using Handoff itemtype
  if (view.handoffs.length > 0) {
    const handoffItems = view.handoffs.map(
      (
        h,
      ) => `${openTag("article", { itemtype: "Handoff", itemprop: "handoffs" })}
${linkTag("targetStage", `#${h.target}`)}
<p><strong>${prop("span", "label", h.label)}</strong> → ${escapeHtml(h.target)}</p>
${prop("p", "prompt", h.prompt)}
</article>`,
    );
    sections.push(section("Handoffs", handoffItems.join("\n"), 2));
  }

  const body = `<main>
${openTag("article", { itemtype: "Stage", itemid: `#${view.id}` })}
${prop("h1", "name", view.name)}
${metaTag("id", view.id)}
${stage.emojiIcon ? metaTag("emojiIcon", stage.emojiIcon) : ""}
${prop("p", "description", view.description)}
${sections.join("\n")}
</article>
</main>`;

  return htmlDocument(view.name, body);
}
