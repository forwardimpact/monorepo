/**
 * Landing page
 */

import { render, div, h1, h2, p, a, span } from "../lib/render.js";
import { getState } from "../lib/state.js";
import { createStatCard } from "../components/card.js";
import { groupSkillsByCapability, getConceptEmoji } from "../model/levels.js";
import { getStageEmoji } from "../formatters/stage/shared.js";
import { aggregateTools } from "../formatters/tool/shared.js";

/**
 * Create lifecycle flow visualization for landing page
 * @param {Array} stages - Array of stage objects
 * @returns {HTMLElement}
 */
function createLifecycleFlow(stages) {
  const flowItems = stages.map((stage, index) => {
    const emoji = getStageEmoji(stages, stage.id);
    const isLast = index === stages.length - 1;

    return div(
      { className: "lifecycle-flow-item" },
      a(
        { href: `#/stage/${stage.id}`, className: "lifecycle-stage" },
        span({ className: "lifecycle-emoji" }, emoji),
        span({ className: "lifecycle-name" }, stage.name),
      ),
      !isLast ? span({ className: "lifecycle-arrow" }, "→") : null,
    );
  });

  return div({ className: "lifecycle-flow" }, ...flowItems);
}

/**
 * Render the landing page
 */
export function renderLanding() {
  const { data } = getState();
  const { framework } = data;
  const stages = data.stages || [];

  // Calculate stats using centralized capability ordering
  const skillsByCapability = groupSkillsByCapability(data.skills);
  const capabilityCount = Object.keys(skillsByCapability).length;
  const tools = aggregateTools(data.skills);

  const page = div(
    { className: "landing-page" },
    // Hero section
    div(
      { className: "landing-hero" },
      div(
        { className: "hero-title-wrapper" },
        h1({}, `${framework.emoji} ${framework.title}`),
        span({ className: "brand-tag brand-tag-hero" }, framework.tag),
      ),
      p({}, framework.description.trim()),
      // Job builder CTA
      div(
        { className: "page-actions", style: "justify-content: center" },
        a(
          { href: "#/job-builder", className: "btn btn-primary btn-lg" },
          "Build a Job",
        ),
        a(
          { href: "#/agent-builder", className: "btn btn-primary btn-lg" },
          "Build an Agent",
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
        value: data.grades.length,
        label: "Grades",
        href: "/grade",
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
        value: stages.length,
        label: "Stages",
        href: "/stage",
      }),
      createStatCard({
        value: tools.length,
        label: "Tools",
        href: "/tool",
      }),
    ),

    // Lifecycle flow visualization
    stages.length > 0
      ? div(
          { className: "section section-detail" },
          h2(
            { className: "section-title" },
            `${getConceptEmoji(framework, "stage")} Engineering Lifecycle`,
          ),
          p(
            { className: "text-muted", style: "margin-bottom: 1rem" },
            "The three stages of engineering work, from planning through review.",
          ),
          createLifecycleFlow(stages),
        )
      : null,

    // Quick links section
    div(
      { className: "section section-detail" },
      h2({ className: "section-title" }, "Explore the Framework"),
      div(
        { className: "grid grid-4" },
        createQuickLinkCard(
          `${getConceptEmoji(framework, "discipline")} ${framework.entityDefinitions.discipline.title}`,
          `${data.disciplines.length} ${framework.entityDefinitions.discipline.title.toLowerCase()} — ${framework.entityDefinitions.discipline.description.trim().split("\n")[0]}`,
          "/discipline",
        ),
        createQuickLinkCard(
          `${getConceptEmoji(framework, "grade")} ${framework.entityDefinitions.grade.title}`,
          `${data.grades.length} ${framework.entityDefinitions.grade.title.toLowerCase()} — ${framework.entityDefinitions.grade.description.trim().split("\n")[0]}`,
          "/grade",
        ),
        createQuickLinkCard(
          `${getConceptEmoji(framework, "track")} ${framework.entityDefinitions.track.title}`,
          `${data.tracks.length} ${framework.entityDefinitions.track.title.toLowerCase()} — ${framework.entityDefinitions.track.description.trim().split("\n")[0]}`,
          "/track",
        ),
        createQuickLinkCard(
          `${getConceptEmoji(framework, "behaviour")} ${framework.entityDefinitions.behaviour.title}`,
          `${data.behaviours.length} ${framework.entityDefinitions.behaviour.title.toLowerCase()} — ${framework.entityDefinitions.behaviour.description.trim().split("\n")[0]}`,
          "/behaviour",
        ),
        createQuickLinkCard(
          `${getConceptEmoji(framework, "skill")} ${framework.entityDefinitions.skill.title}`,
          `${data.skills.length} ${framework.entityDefinitions.skill.title.toLowerCase()} across ${capabilityCount} capabilities — ${framework.entityDefinitions.skill.description.trim().split("\n")[0]}`,
          "/skill",
        ),
        createQuickLinkCard(
          `${getConceptEmoji(framework, "driver")} ${framework.entityDefinitions.driver.title}`,
          `${data.drivers.length} ${framework.entityDefinitions.driver.title.toLowerCase()} — ${framework.entityDefinitions.driver.description.trim().split("\n")[0]}`,
          "/driver",
        ),
        createQuickLinkCard(
          `${getConceptEmoji(framework, "stage")} ${framework.entityDefinitions.stage.title}`,
          `${stages.length} ${framework.entityDefinitions.stage.title.toLowerCase()} — ${framework.entityDefinitions.stage.description.trim().split("\n")[0]}`,
          "/stage",
        ),
        createQuickLinkCard(
          `${getConceptEmoji(framework, "tool")} ${framework.entityDefinitions.tool.title}`,
          `${tools.length} ${framework.entityDefinitions.tool.title.toLowerCase()} — ${framework.entityDefinitions.tool.description.trim().split("\n")[0]}`,
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
            "Combine a discipline, track, and grade to generate a complete job definition " +
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
            "Visualize your progression to the next grade and compare expectations " +
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
          h2({}, `${getConceptEmoji(framework, "driver")} Assess Your Skills`),
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
          h2({}, "🤖 Build an AI Agent"),
          p(
            {},
            "Generate AI coding agent configurations from discipline × track combinations " +
              "for GitHub Copilot custom agents.",
          ),
          div(
            { className: "page-actions", style: "justify-content: center" },
            a(
              { href: "#/agent-builder", className: "btn btn-primary btn-lg" },
              "Build Agent →",
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
