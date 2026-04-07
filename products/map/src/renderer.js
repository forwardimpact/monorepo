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

  renderSkill(skill, ctx) {
    const view = viewBuilders.buildSkillView(skill, ctx);
    const body = this.#templates.renderWithPartials(
      "skill.html",
      view,
      SKILL_PARTIALS,
    );
    return this.#page(view.name, body);
  }

  renderCapability(capability, ctx) {
    const view = viewBuilders.buildCapabilityView(capability, ctx);
    const body = this.#templates.renderWithPartials(
      "capability.html",
      view,
      SKILL_PARTIALS,
    );
    return this.#page(view.name, body);
  }

  renderLevel(level) {
    const view = viewBuilders.buildLevelView(level);
    const body = this.#templates.render("level.html", view);
    return this.#page(view.name, body);
  }

  renderBehaviour(behaviour, ctx) {
    const view = viewBuilders.buildBehaviourView(behaviour, ctx);
    const body = this.#templates.render("behaviour.html", view);
    return this.#page(view.name, body);
  }

  renderDiscipline(discipline) {
    const view = viewBuilders.buildDisciplineView(discipline);
    const body = this.#templates.render("discipline.html", view);
    return this.#page(view.name, body);
  }

  renderTrack(track) {
    const view = viewBuilders.buildTrackView(track);
    const body = this.#templates.render("track.html", view);
    return this.#page(view.name, body);
  }

  renderStage(stage, position) {
    const view = viewBuilders.buildStageView(stage, position);
    const body = this.#templates.render("stage.html", view);
    return this.#page(view.name, body);
  }

  renderDriver(driver) {
    const view = viewBuilders.buildDriverView(driver);
    const body = this.#templates.render("driver.html", view);
    return this.#page(view.name, body);
  }

  renderTool(tool) {
    const view = viewBuilders.buildToolView(tool);
    const body = this.#templates.render("tool.html", view);
    return this.#page(view.name, body);
  }
}

/**
 * Wire a Renderer with the package's bundled templates directory.
 * @returns {Renderer}
 */
export function createRenderer() {
  const templateDir = join(__dirname, "..", "templates");
  return new Renderer(new TemplateLoader(templateDir));
}
