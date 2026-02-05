/**
 * Track formatting for microdata HTML output
 *
 * Generates clean, class-less HTML with microdata aligned with track.schema.json
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
import { prepareTracksList, prepareTrackDetail } from "./shared.js";

/**
 * Format track list as microdata HTML
 * @param {Array} tracks - Raw track entities
 * @returns {string} HTML with microdata
 */
export function trackListToMicrodata(tracks) {
  const { items } = prepareTracksList(tracks);

  const content = items
    .map((track) => {
      return `${openTag("article", { itemtype: "Track", itemid: `#${track.id}` })}
${prop("h2", "name", track.name)}
</article>`;
    })
    .join("\n");

  return htmlDocument(
    "Tracks",
    `<main>
<h1>Tracks</h1>
${content}
</main>`,
  );
}

/**
 * Format track detail as microdata HTML
 * @param {Object} track - Raw track entity
 * @param {Object} context - Additional context
 * @param {Array} context.skills - All skills
 * @param {Array} context.behaviours - All behaviours
 * @param {Array} context.disciplines - All disciplines
 * @returns {string} HTML with microdata
 */
export function trackToMicrodata(track, { skills, behaviours, disciplines }) {
  const view = prepareTrackDetail(track, { skills, behaviours, disciplines });

  if (!view) return "";

  const sections = [];

  // Skill modifiers - using SkillModifier itemtype with targetCapability
  if (view.skillModifiers.length > 0) {
    const modifierItems = view.skillModifiers.map((m) => {
      const modifierStr = m.modifier > 0 ? `+${m.modifier}` : `${m.modifier}`;

      if (m.isCapability && m.skills && m.skills.length > 0) {
        // Capability with expanded skills
        const skillLinks = m.skills
          .map(
            (s) => `<a href="#${escapeHtml(s.id)}">${escapeHtml(s.name)}</a>`,
          )
          .join(", ");
        return `${openTag("div", { itemtype: "SkillModifier", itemprop: "skillModifiers" })}
${linkTag("targetCapability", `#${m.id}`)}
<strong>${escapeHtml(m.name)} Capability</strong> (${openTag("span", { itemprop: "modifierValue" })}${modifierStr}</span>)
<p>${skillLinks}</p>
</div>`;
      } else {
        // Individual skill or capability without skills
        return `${openTag("span", { itemtype: "SkillModifier", itemprop: "skillModifiers" })}
${linkTag("targetCapability", `#${m.id}`)}
<strong>${escapeHtml(m.name)}</strong>: ${openTag("span", { itemprop: "modifierValue" })}${modifierStr}</span>
</span>`;
      }
    });
    sections.push(section("Skill Modifiers", modifierItems.join("\n"), 2));
  }

  // Behaviour modifiers - using BehaviourModifier itemtype
  if (view.behaviourModifiers.length > 0) {
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
${openTag("article", { itemtype: "Track", itemid: `#${view.id}` })}
${prop("h1", "name", view.name)}
${metaTag("id", view.id)}
${prop("p", "description", view.description)}
${sections.join("\n")}
</article>
</main>`;

  return htmlDocument(view.name, body);
}
