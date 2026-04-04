/**
 * Pipeline orchestrator — parse → generate → prose → render → validate.
 *
 * @module libuniverse/pipeline
 */

import { readFile } from "fs/promises";
import { join } from "path";
import {
  validateLinks,
  validateHTML,
  renderDataset,
} from "@forwardimpact/libsyntheticrender";
import { collectProseKeys } from "@forwardimpact/libsyntheticgen";
import { loadSchemas } from "@forwardimpact/libsyntheticprose/pathway";

/**
 * Pipeline class that orchestrates the full generation pipeline.
 * All collaborators are injected via constructor.
 */
export class Pipeline {
  /**
   * @param {object} deps
   * @param {import('@forwardimpact/libsyntheticgen').DslParser} deps.dslParser - DSL parser
   * @param {import('@forwardimpact/libsyntheticgen').EntityGenerator} deps.entityGenerator - Entity generator
   * @param {import('@forwardimpact/libsyntheticprose').ProseEngine} deps.proseEngine - Prose engine
   * @param {import('@forwardimpact/libsyntheticprose').PathwayGenerator} deps.pathwayGenerator - Pathway generator
   * @param {import('@forwardimpact/libsyntheticrender').Renderer} deps.renderer - Renderer
   * @param {import('@forwardimpact/libsyntheticrender').ContentValidator} deps.validator - Content validator
   * @param {import('@forwardimpact/libsyntheticrender').ContentFormatter} deps.formatter - Content formatter
   * @param {Function} [deps.toolFactory] - (toolName, deps) => tool instance
   * @param {object} deps.logger - Logger instance
   */
  constructor({
    dslParser,
    entityGenerator,
    proseEngine,
    pathwayGenerator,
    renderer,
    validator,
    formatter,
    toolFactory,
    logger,
  }) {
    if (!dslParser) throw new Error("dslParser is required");
    if (!entityGenerator) throw new Error("entityGenerator is required");
    if (!proseEngine) throw new Error("proseEngine is required");
    if (!pathwayGenerator) throw new Error("pathwayGenerator is required");
    if (!renderer) throw new Error("renderer is required");
    if (!validator) throw new Error("validator is required");
    if (!formatter) throw new Error("formatter is required");
    if (!logger) throw new Error("logger is required");

    this.dslParser = dslParser;
    this.entityGenerator = entityGenerator;
    this.proseEngine = proseEngine;
    this.pathwayGenerator = pathwayGenerator;
    this.renderer = renderer;
    this.validator = validator;
    this.formatter = formatter;
    this.toolFactory = toolFactory || null;
    this.logger = logger;
  }

  /**
   * Generate prose for all entity keys.
   * @param {object} entities
   * @returns {Promise<Map<string, string>>}
   */
  async #generateProse(entities) {
    const prose = new Map();
    const proseKeys = collectProseKeys(entities);
    const totalKeys = proseKeys.size;
    let keyIndex = 0;
    if (this.proseEngine.mode !== "no-prose") {
      this.logger.info(
        "pipeline",
        `Generating prose (${this.proseEngine.mode} mode, ${totalKeys} keys)`,
      );
    }
    for (const [key, context] of proseKeys) {
      keyIndex++;
      const result = await this.proseEngine.generateProse(key, context);
      if (result) prose.set(key, result);
      if (this.proseEngine.mode !== "no-prose") {
        this.logger.info("prose", `[${keyIndex}/${totalKeys}] ${key}`);
        if (keyIndex % 25 === 0) {
          this.proseEngine.saveCache();
        }
      }
    }
    return prose;
  }

  /**
   * Render HTML content (two-pass: skeleton then enrichment).
   * @param {object} entities
   * @param {Map<string, string>} prose
   * @param {Map<string, string>} files - Accumulates output files
   * @returns {{ linked: object|null }}
   */
  async #renderHtml(entities, prose, files) {
    this.logger.info(
      "render",
      "Rendering HTML (Pass 1: deterministic skeleton)",
    );
    const { files: htmlFiles, linked } = this.renderer.renderHtml(
      entities,
      prose,
    );

    if (this.proseEngine.mode !== "no-prose") {
      this.logger.info(
        "render",
        "Enriching HTML (Pass 2: LLM prose enrichment)",
      );
      const enriched = await this.renderer.enrichHtml(
        htmlFiles,
        linked,
        this.proseEngine,
        entities.domain,
      );
      for (const [name, content] of enriched) {
        files.set(join("data/knowledge", name), content);
      }
    } else {
      for (const [name, content] of htmlFiles) {
        files.set(join("data/knowledge", name), content);
      }
    }

    files.set(
      "data/knowledge/README.md",
      this.renderer.renderReadme(entities, prose),
    );
    files.set(
      "data/knowledge/ONTOLOGY.md",
      this.renderer.renderOntology(entities),
    );

    const htmlCount = [...files.keys()].filter((p) =>
      p.startsWith("data/knowledge/"),
    ).length;
    this.logger.info("render", `HTML: ${htmlCount} files`);

    return { linked };
  }

  /**
   * Render pathway YAML files.
   * @param {object} entities
   * @param {string|null} schemaDir
   * @param {Map<string, string>} files
   */
  async #renderPathway(entities, schemaDir, files) {
    this.logger.info("render", "Rendering pathway");
    const hasPathwayFramework =
      entities.framework?.capabilities?.length > 0 &&
      typeof entities.framework.capabilities[0] === "object";

    if (hasPathwayFramework && schemaDir) {
      const schemas = loadSchemas(schemaDir);
      const pathwayData = await this.pathwayGenerator.generate({
        framework: entities.framework,
        domain: entities.domain,
        industry: entities.industry,
        schemas,
      });
      const pathwayFiles = this.renderer.renderPathway(pathwayData);
      for (const [name, content] of pathwayFiles) {
        files.set(`data/pathway/${name}`, content);
      }
      this.logger.info("render", `Pathway: ${pathwayFiles.size} files`);
    }
  }

  /**
   * Render raw documents and activity files.
   * @param {object} entities
   * @param {Map<string, string>} prose
   * @param {Map<string, string>} files
   * @param {Map<string, string>} rawDocuments
   */
  #renderRaw(entities, prose, files, rawDocuments) {
    this.logger.info("render", "Rendering raw documents");
    const raw = this.renderer.renderRaw(entities, prose);
    for (const [path, content] of raw) {
      rawDocuments.set(path, content);
    }

    const activityFiles = this.renderer.renderActivity(entities);
    for (const [name, content] of activityFiles) {
      files.set(join("data/activity", name), content);
    }
    this.logger.info(
      "render",
      `Raw: ${raw.size} documents, ${activityFiles.size} activity files`,
    );
  }

  /**
   * Render markdown content files.
   * @param {object} entities
   * @param {Map<string, string>} prose
   * @param {Map<string, string>} files
   */
  #renderMarkdown(entities, prose, files) {
    this.logger.info("render", "Rendering markdown");
    const md = this.renderer.renderMarkdown(entities, prose);
    for (const [name, content] of md) {
      files.set(join("data/personal", name), content);
    }
    this.logger.info("render", `Markdown: ${md.size} files`);
  }

  /**
   * Execute dataset tools and render their outputs.
   * @param {object} ast
   * @param {Map<string, string>} files
   */
  async #processDatasets(ast, files) {
    this.logger.info(
      "pipeline",
      `Generating ${ast.datasets.length} dataset(s)`,
    );
    const datasets = new Map();
    for (const ds of ast.datasets) {
      const tool = this.toolFactory(ds.tool, { logger: this.logger });
      try {
        await tool.checkAvailability();
      } catch (err) {
        this.logger.info(
          "pipeline",
          `Skipping dataset '${ds.id}': ${ds.tool} not available (${err.message})`,
        );
        continue;
      }
      const results = await tool.generate({
        ...ds.config,
        seed: ast.seed,
        name: ds.id,
      });
      for (const dataset of results) {
        datasets.set(dataset.name, dataset);
      }
    }

    this.logger.info(
      "pipeline",
      `Rendering ${ast.outputs.length} dataset output(s)`,
    );
    for (const out of ast.outputs) {
      const dataset = datasets.get(out.dataset);
      if (!dataset) {
        this.logger.info(
          "pipeline",
          `Skipping output '${out.dataset}': dataset not generated`,
        );
        continue;
      }
      const rendered = await renderDataset(dataset, out.format, out.config);
      for (const [path, content] of rendered) {
        files.set(path, content);
      }
    }
  }

  /**
   * Run validation checks on rendered output.
   * @param {object} entities
   * @param {boolean} hasOrgBlocks
   * @param {object|null} htmlLinked
   * @param {Map<string, string>} formattedFiles
   * @returns {object}
   */
  #validate(entities, hasOrgBlocks, htmlLinked, formattedFiles) {
    const validation = hasOrgBlocks
      ? this.validator.validate(entities)
      : { checks: [], failures: 0, passed: true };

    this.logger.info(
      "validate",
      `${validation.checks.length} checks, ${validation.failures} failures`,
    );

    if (htmlLinked) {
      this.#validateHtml(htmlLinked, entities, formattedFiles, validation);
    }

    return validation;
  }

  /**
   * Run HTML-specific validation (link density + structure).
   * @param {object} htmlLinked
   * @param {object} entities
   * @param {Map<string, string>} formattedFiles
   * @param {object} validation - Mutated in place
   */
  #validateHtml(htmlLinked, entities, formattedFiles, validation) {
    const linkValidation = validateLinks(htmlLinked, entities.domain);
    validation.checks.push({
      name: "link_density",
      passed: linkValidation.passed,
    });
    if (!linkValidation.passed) {
      validation.failures++;
      validation.passed = false;
      this.logger.error(
        "validate",
        `Link validation: ${linkValidation.failures} failures`,
      );
    }

    const orgFiles = new Map();
    for (const [path, content] of formattedFiles) {
      if (path.startsWith("data/knowledge/") && path.endsWith(".html")) {
        orgFiles.set(path, content);
      }
    }
    const htmlValidation = validateHTML(orgFiles, entities.domain);
    for (const check of htmlValidation.checks) {
      validation.checks.push(check);
    }
    if (!htmlValidation.passed) {
      validation.failures += htmlValidation.failures;
      validation.passed = false;
      for (const c of htmlValidation.checks.filter((c) => !c.passed)) {
        this.logger.error("validate", c.message);
      }
    }
  }

  /**
   * Run the full generation pipeline.
   *
   * @param {object} options
   * @param {string} options.universePath - Path to the story DSL file
   * @param {string} [options.only=null] - Render only a specific content type
   * @param {string|null} [options.schemaDir=null] - Path to JSON schema directory
   * @returns {Promise<{files: Map<string,string>, rawDocuments: Map<string,string>, entities: object, validation: object, stats: {prose: {hits: number, misses: number, generated: number}, files: number, rawDocuments: number}}>}
   */
  async run(options) {
    const { universePath, only = null, schemaDir = null } = options;

    // 1. Parse DSL
    this.logger.info("pipeline", "Parsing universe DSL");
    const source = await readFile(universePath, "utf-8");
    const ast = this.dslParser.parse(source);

    // 2-4. Org-and-pathway generation (only when org blocks are present)
    const hasOrgBlocks = ast.people !== null;
    let entities = { domain: ast.domain, industry: ast.industry };
    let prose = new Map();

    if (hasOrgBlocks) {
      this.logger.info("pipeline", "Generating entity graph");
      entities = this.entityGenerator.generate(ast);
      prose = await this.#generateProse(entities);
    }

    // 4. Render outputs
    const files = new Map();
    const rawDocuments = new Map();
    let htmlLinked = null;

    const shouldRender = (type) => hasOrgBlocks && (!only || only === type);

    if (shouldRender("html")) {
      const result = await this.#renderHtml(entities, prose, files);
      htmlLinked = result.linked;
    }

    if (shouldRender("pathway")) {
      await this.#renderPathway(entities, schemaDir, files);
    }

    if (shouldRender("raw")) {
      this.#renderRaw(entities, prose, files, rawDocuments);
    }

    if (shouldRender("markdown")) {
      this.#renderMarkdown(entities, prose, files);
    }

    if (ast.datasets.length > 0 && this.toolFactory) {
      await this.#processDatasets(ast, files);
    }

    if (hasOrgBlocks) {
      this.proseEngine.saveCache();
    }

    // 5. Format outputs with Prettier
    this.logger.info("format", "Formatting output files with Prettier");
    const formattedFiles = await this.formatter.format(files);
    const formattedRawDocuments = await this.formatter.format(rawDocuments);
    this.logger.info(
      "format",
      `Formatted ${formattedFiles.size} files, ${formattedRawDocuments.size} raw documents`,
    );

    // 6. Validate
    const validation = this.#validate(
      entities,
      hasOrgBlocks,
      htmlLinked,
      formattedFiles,
    );

    return {
      files: formattedFiles,
      rawDocuments: formattedRawDocuments,
      entities,
      validation,
      stats: {
        prose: this.proseEngine.stats,
        files: formattedFiles.size,
        rawDocuments: formattedRawDocuments.size,
      },
    };
  }
}
