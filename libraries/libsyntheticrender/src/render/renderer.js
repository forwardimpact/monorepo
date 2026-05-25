/**
 * Renderer — wraps all render functions behind a single class with DI.
 *
 * @module libterrain/render/renderer
 */

import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { TemplateLoader } from "@forwardimpact/libtemplate/loader";
import { renderHTML, renderREADME, renderONTOLOGY } from "./html.js";
import { renderRawDocuments, renderActivityFiles } from "./raw.js";
import { renderPathway } from "./pathway.js";
import { renderMarkdown } from "./markdown.js";
import { enrichDocuments } from "./enricher.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Renderer class that delegates to individual render modules.
 */
export class Renderer {
  /**
   * @param {import('@forwardimpact/libtemplate/loader').TemplateLoader} templateLoader - Template loader
   * @param {object} logger - Logger instance
   */
  constructor(templateLoader, logger) {
    if (!templateLoader) throw new Error("templateLoader is required");
    if (!logger) throw new Error("logger is required");
    this.templateLoader = templateLoader;
    this.logger = logger;
  }

  /**
   * Render the deterministic HTML skeleton from entities and the cached
   * prose map. No LLM calls. The returned `linked` graph feeds `enrich`.
   *
   * @param {object} entities
   * @param {Map<string,string>} prose
   * @param {object} [options]
   * @param {object} [options.fhirCrossRef] - Cross-ref index from
   *   `buildFhirCrossRef`; when supplied, spec 1140 clinical pages emit
   *   reverse links to matched patients.
   * @returns {{ files: Map<string,string>, linked: object }}
   */
  renderSkeleton(entities, prose, options = {}) {
    return renderHTML(entities, prose, this.templateLoader, options);
  }

  /**
   * Render organization README.
   * @param {object} entities
   * @param {Map<string,string>} prose
   * @returns {string}
   */
  renderReadme(entities, prose) {
    return renderREADME(entities, prose, this.templateLoader);
  }

  /**
   * Render ONTOLOGY.md with entity IRIs.
   * @param {object} entities
   * @returns {string}
   */
  renderOntology(entities) {
    return renderONTOLOGY(entities, this.templateLoader);
  }

  /**
   * Render Markdown files for Outpost personas.
   * @param {object} entities
   * @param {Map<string,string>} prose
   * @returns {Map<string,string>}
   */
  renderMarkdown(entities, prose) {
    return renderMarkdown(entities, prose, this.templateLoader);
  }

  /**
   * Render raw documents from entities.
   * @param {object} entities
   * @param {Map<string,string>} [proseMap] - Optional prose map for comment text
   * @returns {Map<string,string>}
   */
  renderRaw(entities, proseMap) {
    return renderRawDocuments(entities, proseMap);
  }

  /**
   * Render activity files (roster + teams) from entities.
   * @param {object} entities
   * @returns {Map<string,string>}
   */
  renderActivity(entities) {
    return renderActivityFiles(entities);
  }

  /**
   * Render pathway YAML files from generated entity data.
   * @param {object} pathwayData
   * @returns {Map<string,string>}
   */
  renderPathway(pathwayData) {
    return renderPathway(pathwayData);
  }

  /**
   * Enrich the deterministic HTML skeleton with LLM-generated prose by
   * substituting `data-enrich` blocks. Pass 2 of the renderer pipeline.
   *
   * @param {Map<string,string>} skeleton
   * @param {object} linked - LinkedEntities from renderSkeleton
   * @param {import('@forwardimpact/libsyntheticprose').ProseGenerator} proseGenerator
   * @param {string} domain
   * @returns {Promise<Map<string,string>>}
   */
  async enrich(skeleton, linked, proseGenerator, domain) {
    return enrichDocuments(
      skeleton,
      linked,
      proseGenerator,
      domain,
      this.logger,
    );
  }
}

/**
 * Creates a Renderer with real dependencies wired.
 * @param {object} logger - Logger instance
 * @returns {Renderer}
 */
export function createRenderer(logger) {
  const templateDir = join(__dirname, "..", "..", "templates");
  const templateLoader = new TemplateLoader(templateDir);
  return new Renderer(templateLoader, logger);
}
