/**
 * Landing page
 */

import { render, div, h1, h2, p, a, span } from "../lib/render.js";
import { getState } from "../lib/state.js";
import { createStatCard } from "../components/card.js";
import {
  groupSkillsByCapability,
  getConceptEmoji,
} from "@forwardimpact/libskill/levels";
import { aggregateTools } from "../formatters/tool/shared.js";
import { createCommandPrompt } from "../components/command-prompt.js";
import { createFirstVisitBanner } from "../components/first-visit-banner.js";
import { isDismissed, markDismissed } from "../lib/first-visit-dismissal.js";

/**
 * Render the landing page
 */
export function renderLanding() {
  const { data } = getState();
  const { standard } = data;

  // Calculate stats using centralized capability ordering
  const skillsByCapability = groupSkillsByCapability(
    data.skills,
    data.capabilities,
  );
  const capabilityCount = Object.keys(skillsByCapability).length;
  const tools = aggregateTools(data.skills);

  let banner = null;
  if (!isDismissed()) {
    banner = createFirstVisitBanner({
      onDismiss: () => {
        markDismissed();
        banner.remove();
      },
    });
  }

  const page = div(
    { className: "landing-page" },
    banner,
    // Hero section
    div(
      { className: "landing-hero" },
      div(
        { className: "hero-title-wrapper" },
        h1({}, `${standard.emojiIcon} ${standard.title}`),
        span({ className: "brand-tag brand-tag-hero" }, standard.tag),
      ),
      p({}, standard.description.trim()),
      // Install command prompt (only if distribution URL is configured)
      standard.distribution?.siteUrl
        ? createCommandPrompt(
            `curl -fsSL ${standard.distribution.siteUrl}/install.sh | bash`,
          )
        : null,
      // Job builder CTA
      div(
        { className: "page-actions", style: "justify-content: center" },
        a(
          { href: "#/job-builder", className: "btn btn-primary btn-lg" },
          "Build a Job",
        ),
        a(
          { href: "#/agent-builder", className: "btn btn-primary btn-lg" },
          "Build an Agent Team",
        ),
        a(
          { href: "#/interview-prep", className: "btn btn-secondary btn-lg" },
          "Interview Prep",
        ),
        a(
          { href: "#/career-progress", className: "btn btn-secondary btn-lg" },
          "Career Progress",
        ),
        a(
          { href: "#/self-assessment", className: "btn btn-secondary btn-lg" },
          "Self-Assessment",
        ),
      ),
    ),

    // Stats grid
    div(
      { className: "grid grid-4" },
      createStatCard({
        value: data.disciplines.length,
        label: "Disciplines",
        href: "/discipline",
      }),
      createStatCard({
        value: data.levels.length,
        label: "Levels",
        href: "/level",
      }),
      createStatCard({
        value: data.tracks.length,
        label: "Tracks",
        href: "/track",
      }),
      createStatCard({
        value: data.behaviours.length,
        label: "Behaviours",
        href: "/behaviour",
      }),
      createStatCard({
        value: data.skills.length,
        label: "Skills",
        href: "/skill",
      }),
      createStatCard({
        value: data.drivers.length,
        label: "Drivers",
        href: "/driver",
      }),
      createStatCard({
        value: tools.length,
        label: "Tools",
        href: "/tool",
      }),
    ),

    // Quick links section
    div(
      { className: "section section-detail" },
      h2(
        { className: "section-title" },
        "Explore the Agent-Aligned Engineering Standard",
      ),
      div(
        { className: "grid grid-4" },
        createQuickLinkCard(
          `${getConceptEmoji(standard, "discipline")} ${standard.entityDefinitions.discipline.title}`,
          `${data.disciplines.length} ${standard.entityDefinitions.discipline.title.toLowerCase()} — ${standard.entityDefinitions.discipline.description.trim().split("\n")[0]}`,
          "/discipline",
        ),
        createQuickLinkCard(
          `${getConceptEmoji(standard, "level")} ${standard.entityDefinitions.level.title}`,
          `${data.levels.length} ${standard.entityDefinitions.level.title.toLowerCase()} — ${standard.entityDefinitions.level.description.trim().split("\n")[0]}`,
          "/level",
        ),
        createQuickLinkCard(
          `${getConceptEmoji(standard, "track")} ${standard.entityDefinitions.track.title}`,
          `${data.tracks.length} ${standard.entityDefinitions.track.title.toLowerCase()} — ${standard.entityDefinitions.track.description.trim().split("\n")[0]}`,
          "/track",
        ),
        createQuickLinkCard(
          `${getConceptEmoji(standard, "behaviour")} ${standard.entityDefinitions.behaviour.title}`,
          `${data.behaviours.length} ${standard.entityDefinitions.behaviour.title.toLowerCase()} — ${standard.entityDefinitions.behaviour.description.trim().split("\n")[0]}`,
          "/behaviour",
        ),
        createQuickLinkCard(
          `${getConceptEmoji(standard, "skill")} ${standard.entityDefinitions.skill.title}`,
          `${data.skills.length} ${standard.entityDefinitions.skill.title.toLowerCase()} across ${capabilityCount} capabilities — ${standard.entityDefinitions.skill.description.trim().split("\n")[0]}`,
          "/skill",
        ),
        createQuickLinkCard(
          `${getConceptEmoji(standard, "driver")} ${standard.entityDefinitions.driver.title}`,
          `${data.drivers.length} ${standard.entityDefinitions.driver.title.toLowerCase()} — ${standard.entityDefinitions.driver.description.trim().split("\n")[0]}`,
          "/driver",
        ),
        createQuickLinkCard(
          `${getConceptEmoji(standard, "tool")} ${standard.entityDefinitions.tool.title}`,
          `${tools.length} ${standard.entityDefinitions.tool.title.toLowerCase()} — ${standard.entityDefinitions.tool.description.trim().split("\n")[0]}`,
          "/tool",
        ),
      ),
    ),

    // Build Your Team section
    div(
      { className: "section section-detail" },
      h2({ className: "section-title" }, "Build Your Team"),

      // CTA cards grid
      div(
        { className: "grid grid-2" },
        // Job builder CTA
        div(
          { className: "card", style: "text-align: center" },
          h2({}, "🔨 Build a Job Definition"),
          p(
            {},
            "Combine a discipline, track, and level to generate a complete job definition " +
              "with skill matrices and behaviour profiles.",
          ),
          div(
            { className: "page-actions", style: "justify-content: center" },
            a(
              { href: "#/job-builder", className: "btn btn-primary btn-lg" },
              "Start Building →",
            ),
          ),
        ),

        // Interview prep CTA
        div(
          { className: "card", style: "text-align: center" },
          h2({}, "🎤 Prep for an Interview"),
          p(
            {},
            "Generate tailored interview questions based on role requirements " +
              "to ensure comprehensive candidate assessment.",
          ),
          div(
            { className: "page-actions", style: "justify-content: center" },
            a(
              { href: "#/interview-prep", className: "btn btn-primary btn-lg" },
              "Interview Prep →",
            ),
          ),
        ),

        // Career progress CTA
        div(
          { className: "card", style: "text-align: center" },
          h2({}, "📈 Plan Your Career"),
          p(
            {},
            "Visualize your progression to the next level and compare expectations " +
              "across different tracks to plan your career development.",
          ),
          div(
            { className: "page-actions", style: "justify-content: center" },
            a(
              {
                href: "#/career-progress",
                className: "btn btn-primary btn-lg",
              },
              "Career Progress →",
            ),
          ),
        ),

        // Self-assessment CTA
        div(
          { className: "card", style: "text-align: center" },
          h2({}, `${getConceptEmoji(standard, "driver")} Assess Your Skills`),
          p(
            {},
            "Assess your current skills and behaviours to discover matching roles " +
              "and identify development opportunities.",
          ),
          div(
            { className: "page-actions", style: "justify-content: center" },
            a(
              {
                href: "#/self-assessment",
                className: "btn btn-primary btn-lg",
              },
              "Start Assessment →",
            ),
          ),
        ),

        // Agent builder CTA
        div(
          { className: "card", style: "text-align: center" },
          h2({}, "🤖 Build an Agent Team"),
          p(
            {},
            "Generate coding agent team configurations from discipline × track combinations " +
              "for Claude Code agents.",
          ),
          div(
            { className: "page-actions", style: "justify-content: center" },
            a(
              { href: "#/agent-builder", className: "btn btn-primary btn-lg" },
              "Build Agent Team →",
            ),
          ),
        ),
      ),
    ),
  );

  render(page);
}

/**
 * Create a quick link card
 * @param {string} title
 * @param {string} description
 * @param {string} href
 * @returns {HTMLElement}
 */
function createQuickLinkCard(title, description, href) {
  const card = div(
    { className: "card card-clickable" },
    h2({ className: "card-title", style: "font-size: 1.25rem" }, title),
    p({ className: "card-description" }, description),
  );

  card.addEventListener("click", () => {
    window.location.hash = href;
  });

  return card;
}
