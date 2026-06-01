/**
 * Renderer — turns base-entity view models into complete HTML microdata
 * documents using the Mustache templates under `products/map/templates/`.
 *
 * Mirrors the shape of `libraries/libsyntheticrender/render/renderer.js`,
 * but without the LLM/enricher dependencies — Map's render path is fully
 * synchronous.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TemplateLoader } from "@forwardimpact/libtemplate/loader";
import * as viewBuilders from "./view-builders/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SKILL_PARTIALS = ["skill-inline.html"];

/** Renders base-entity view models into complete HTML microdata documents using Mustache templates. */
export class Renderer {
  #templates;

  /**
   * @param {TemplateLoader} templateLoader
   */
  constructor(templateLoader) {
    if (!templateLoader) throw new Error("templateLoader is required");
    this.#templates = templateLoader;
  }

  #page(title, body) {
    return this.#templates.render("page.html", { title, body });
  }

  /** Render a skill entity and its inline partials into a full HTML page. */
  renderSkill(skill, ctx) {
    const view = viewBuilders.buildSkillView(skill, ctx);
    const body = this.#templates.renderWithPartials(
      "skill.html",
      view,
      SKILL_PARTIALS,
    );
    return this.#page(view.name, body);
  }

  /** Render a capability entity with its nested skills into a full HTML page. */
  renderCapability(capability, ctx) {
    const view = viewBuilders.buildCapabilityView(capability, ctx);
    const body = this.#templates.renderWithPartials(
      "capability.html",
      view,
      SKILL_PARTIALS,
    );
    return this.#page(view.name, body);
  }

  /** Render a level entity into a full HTML page. */
  renderLevel(level) {
    const view = viewBuilders.buildLevelView(level);
    const body = this.#templates.render("level.html", view);
    return this.#page(view.name, body);
  }

  /** Render a behaviour entity into a full HTML page. */
  renderBehaviour(behaviour, ctx) {
    const view = viewBuilders.buildBehaviourView(behaviour, ctx);
    const body = this.#templates.render("behaviour.html", view);
    return this.#page(view.name, body);
  }

  /** Render a discipline entity into a full HTML page. */
  renderDiscipline(discipline) {
    const view = viewBuilders.buildDisciplineView(discipline);
    const body = this.#templates.render("discipline.html", view);
    return this.#page(view.name, body);
  }

  /** Render a track entity into a full HTML page. */
  renderTrack(track) {
    const view = viewBuilders.buildTrackView(track);
    const body = this.#templates.render("track.html", view);
    return this.#page(view.name, body);
  }

  /** Render a driver entity into a full HTML page. */
  renderDriver(driver) {
    const view = viewBuilders.buildDriverView(driver);
    const body = this.#templates.render("driver.html", view);
    return this.#page(view.name, body);
  }

  /** Render a tool reference entity into a full HTML page. */
  renderTool(tool) {
    const view = viewBuilders.buildToolView(tool);
    const body = this.#templates.render("tool.html", view);
    return this.#page(view.name, body);
  }
}

/**
 * Wire a Renderer with the package's bundled templates directory.
 * @param {import("@forwardimpact/libutil/runtime").Runtime} runtime - Injected runtime bag
 * @returns {Renderer}
 */
export function createRenderer(runtime) {
  const templateDir = join(__dirname, "..", "templates");
  return new Renderer(new TemplateLoader(templateDir, runtime));
}
