/**
 * Pipeline orchestrator — parse → generate → prose → render → validate.
 *
 * @module libuniverse/pipeline
 */

import { readFile } from "fs/promises";
import { join } from "path";
import { createLogger } from "@forwardimpact/libtelemetry";
import { parseUniverse } from "./dsl/index.js";
import { generate } from "./engine/tier0.js";
import { collectProseKeys } from "./engine/prose-keys.js";
import { ProseEngine } from "./engine/prose.js";
import { generatePathwayData, loadSchemas } from "./engine/pathway.js";
import { renderHTML, renderREADME, renderONTOLOGY } from "./render/html.js";
import { renderRawDocuments, renderActivityFiles } from "./render/raw.js";
import { renderPathway } from "./render/pathway.js";
import { renderMarkdown } from "./render/markdown.js";
import { validateCrossContent } from "./validate.js";
import { enrichDocuments } from "./render/enricher.js";
import { validateLinks, validateHTML } from "./render/validate-links.js";
import { formatFiles } from "./format.js";

/**
 * Run the full generation pipeline.
 *
 * @param {object} options
 * @param {string} options.universePath - Path to the universe.dsl file
 * @param {string} options.dataDir - Output base directory for framework files
 * @param {string} [options.mode='no-prose'] - Prose mode: no-prose, cached, generate
 * @param {boolean} [options.strict=false] - Fail on cache miss in cached mode
 * @param {string|null} [options.only=null] - Render only a specific content type
 * @param {object|null} [options.llmApi=null] - LLM API instance for prose generation
 * @param {string} [options.cachePath] - Path to .prose-cache.json
 * @param {string|null} [options.schemaDir=null] - Path to JSON schema directory
 * @returns {Promise<{files: Map<string,string>, rawDocuments: Map<string,string>, entities: object, validation: object}>}
 */
export async function runPipeline(options) {
  const {
    universePath,
    dataDir: _dataDir,
    mode = "no-prose",
    strict = false,
    only = null,
    llmApi = null,
    cachePath,
    schemaDir = null,
  } = options;

  const log = createLogger("universe");

  // 1. Parse DSL
  log.info("pipeline", "Parsing universe DSL");
  const source = await readFile(universePath, "utf-8");
  const ast = parseUniverse(source);

  // 2. Generate entity graph (Tier 0)
  log.info("pipeline", "Generating entity graph");
  const entities = generate(ast);

  // 3. Prose generation (Tier 1/2)
  const proseKeys = collectProseKeys(entities);
  const proseEngine = new ProseEngine({ llmApi, cachePath, mode, strict });
  const prose = new Map();
  const totalKeys = proseKeys.size;
  let keyIndex = 0;
  if (mode !== "no-prose") {
    log.info("pipeline", `Generating prose (${mode} mode, ${totalKeys} keys)`);
  }
  for (const [key, context] of proseKeys) {
    keyIndex++;
    const result = await proseEngine.generateProse(key, context);
    if (result) prose.set(key, result);
    if (mode !== "no-prose") {
      log.info("prose", `[${keyIndex}/${totalKeys}] ${key}`);
    }
  }

  // 4. Render outputs
  const files = new Map();
  const rawDocuments = new Map();
  let htmlLinked = null;

  const shouldRender = (type) => !only || only === type;

  if (shouldRender("html")) {
    log.info("render", "Rendering HTML (Pass 1: deterministic skeleton)");
    const { files: htmlFiles, linked } = renderHTML(entities, prose);
    htmlLinked = linked;

    // Pass 2: LLM enrichment of prose blocks
    if (mode !== "no-prose") {
      log.info("render", "Enriching HTML (Pass 2: LLM prose enrichment)");
      const enriched = await enrichDocuments(htmlFiles, linked, proseEngine, entities.domain);
      for (const [name, content] of enriched) {
        files.set(join("examples/organizational", name), content);
      }
    } else {
      for (const [name, content] of htmlFiles) {
        files.set(join("examples/organizational", name), content);
      }
    }

    files.set(
      "examples/organizational/README.md",
      renderREADME(entities, prose),
    );
    files.set("examples/organizational/ONTOLOGY.md", renderONTOLOGY(entities));
  }

  if (shouldRender("pathway")) {
    log.info("render", "Rendering pathway");
    const hasPathwayFramework =
      entities.framework?.capabilities?.length > 0 &&
      typeof entities.framework.capabilities[0] === "object";

    if (hasPathwayFramework && schemaDir) {
      const schemas = loadSchemas(schemaDir);
      const pathwayData = await generatePathwayData({
        framework: entities.framework,
        domain: entities.domain,
        industry: entities.industry,
        schemas,
        proseEngine,
      });
      const pathwayFiles = renderPathway(pathwayData);
      for (const [name, content] of pathwayFiles) {
        files.set(`examples/pathway/${name}`, content);
      }
    }
  }

  if (shouldRender("raw")) {
    log.info("render", "Rendering raw documents");
    const raw = renderRawDocuments(entities);
    for (const [path, content] of raw) {
      rawDocuments.set(path, content);
    }

    // Roster and teams are activity data — output as files
    const activityFiles = renderActivityFiles(entities);
    for (const [name, content] of activityFiles) {
      files.set(join("examples/activity", name), content);
    }
  }

  if (shouldRender("markdown")) {
    log.info("render", "Rendering markdown");
    const md = renderMarkdown(entities, prose);
    for (const [name, content] of md) {
      files.set(join("examples/personal", name), content);
    }
  }

  // Save prose cache after all generation
  proseEngine.saveCache();

  // 5. Format outputs with Prettier
  log.info("format", "Formatting output files with Prettier");
  const formattedFiles = await formatFiles(files);
  const formattedRawDocuments = await formatFiles(rawDocuments);

  // 6. Validate
  const validation = validateCrossContent(entities);

  if (htmlLinked) {
    const linkValidation = validateLinks(htmlLinked, entities.domain);
    validation.checks.push({ name: 'link_density', passed: linkValidation.passed });
    if (!linkValidation.passed) {
      validation.failures++
      validation.passed = false
      log.error("validate", `Link validation: ${linkValidation.failures} failures`)
    }

    const orgFiles = new Map()
    for (const [path, content] of formattedFiles) {
      if (path.startsWith("examples/organizational/") && path.endsWith(".html")) {
        orgFiles.set(path, content)
      }
    }
    const htmlValidation = validateHTML(orgFiles, entities.domain);
    for (const check of htmlValidation.checks) {
      validation.checks.push(check);
    }
    if (!htmlValidation.passed) {
      validation.failures += htmlValidation.failures
      validation.passed = false
      for (const c of htmlValidation.checks.filter(c => !c.passed)) {
        log.error("validate", c.message)
      }
    }
  }

  return { files: formattedFiles, rawDocuments: formattedRawDocuments, entities, validation };
}
