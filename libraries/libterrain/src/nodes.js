/**
 * Pipeline node table — pure stage definitions for fit-terrain.
 *
 * Each node declares dependencies and a `run(deps)` function. Nodes are
 * pure functions of their declared inputs; side-effects (writes, uploads,
 * cache flushes) live in sinks. Kept separate from pipeline.js so the
 * graph definitions don't crowd the executor and Pipeline class.
 *
 * @module libterrain/nodes
 */

import { join } from "path";
import {
  validateLinks,
  validateHTML,
  renderDataset,
  renderSql,
  renderEmbeddings,
  renderFhirMicrodataHtml,
  buildFhirCrossRef,
} from "@forwardimpact/libsyntheticrender";
import { collectProseKeys } from "@forwardimpact/libsyntheticgen";
import { loadSchemas } from "@forwardimpact/libsyntheticprose/pathway";

const FLUSH_EVERY = 25;

/**
 * Build the per-run node table. Each entry is `(deps, ctx) => output`.
 * `deps` is the materialized output of declared dependencies; `ctx`
 * carries pipeline collaborators and run-scoped state (logger, options).
 */
export function buildNodes(ctx) {
  const {
    dslParser,
    entityGenerator,
    proseGenerator,
    pathwayGenerator,
    renderer,
    validator,
    proseCacheSink,
    toolFactory,
    logger,
    options,
    runtime,
  } = ctx;

  // Resolve the async fs surface from the injected runtime.
  // `runtime` is required for the `parse` node; `Pipeline` always injects it.
  // Direct `buildNodes` callers that skip the `parse` node may omit it.
  const { readFile: readFileFn } = runtime?.fs ?? {};

  return {
    parse: {
      deps: [],
      async run() {
        if (!readFileFn) throw new Error("runtime fs required for parse node");
        logger.info("pipeline", "Parsing terrain DSL");
        const source = await readFileFn(options.storyPath, "utf-8");
        return dslParser.parse(source);
      },
    },

    entities: {
      deps: ["parse"],
      run({ parse }) {
        if (parse.people === null) {
          return { domain: parse.domain, industry: parse.industry };
        }
        logger.info("pipeline", "Generating entity graph");
        return entityGenerator.generate(parse);
      },
    },

    "prose-keys": {
      deps: ["entities"],
      run({ entities }) {
        if (!entities.people) return new Map();
        return collectProseKeys(entities, {
          promptLoader: proseGenerator.promptLoader,
        });
      },
    },

    "cache-lookup": {
      deps: ["prose-keys"],
      async run({ "prose-keys": proseKeys }) {
        const total = proseKeys.size;
        if (total === 0) return new Map();

        return resolveProse(proseKeys, proseGenerator, proseCacheSink, logger);
      },
    },

    skeleton: {
      deps: ["entities", "cache-lookup", "fhir-cross-ref"],
      run({ entities, "cache-lookup": prose, "fhir-cross-ref": fhirCrossRef }) {
        if (!entities.people) return { files: new Map(), linked: null };
        logger.info(
          "render",
          "Rendering HTML (Pass 1: deterministic skeleton)",
        );
        return renderer.renderSkeleton(entities, prose, { fhirCrossRef });
      },
    },

    enriched: {
      deps: ["skeleton", "cache-lookup", "entities"],
      async run({ skeleton, "cache-lookup": prose, entities }) {
        const out = new Map();
        if (!entities.people) return { files: out, linked: null };

        const enriched =
          skeleton.linked &&
          (await renderer.enrich(
            skeleton.files,
            skeleton.linked,
            proseGenerator,
            entities.domain,
          ));

        const source = enriched ?? skeleton.files;
        for (const [name, content] of source) {
          out.set(join("data/knowledge", name), content);
        }
        out.set(
          "data/knowledge/README.md",
          renderer.renderReadme(entities, prose),
        );
        out.set(
          "data/knowledge/ONTOLOGY.md",
          renderer.renderOntology(entities),
        );
        logger.info("render", `HTML: ${out.size} files`);
        return { files: out, linked: skeleton.linked };
      },
    },

    raw: {
      deps: ["entities", "cache-lookup"],
      run({ entities, "cache-lookup": prose }) {
        const files = new Map();
        const rawDocuments = new Map();
        if (!entities.people) return { files, rawDocuments };

        logger.info("render", "Rendering raw documents");
        const raw = renderer.renderRaw(entities, prose);
        for (const [path, content] of raw) {
          rawDocuments.set(path, content);
        }
        const activity = renderer.renderActivity(entities);
        for (const [name, content] of activity) {
          files.set(join("data/activity", name), content);
        }
        logger.info(
          "render",
          `Raw: ${raw.size} documents, ${activity.size} activity files`,
        );
        return { files, rawDocuments };
      },
    },

    markdown: {
      deps: ["entities", "cache-lookup"],
      run({ entities, "cache-lookup": prose }) {
        const files = new Map();
        if (!entities.people) return { files };
        logger.info("render", "Rendering markdown");
        const md = renderer.renderMarkdown(entities, prose);
        for (const [name, content] of md) {
          files.set(join("data/personal", name), content);
        }
        logger.info("render", `Markdown: ${md.size} files`);
        return { files };
      },
    },

    pathway: {
      deps: ["entities"],
      async run({ entities }) {
        const files = new Map();
        const hasPathwayStandard =
          entities.standard?.capabilities?.length > 0 &&
          typeof entities.standard.capabilities[0] === "object";
        if (!hasPathwayStandard || !options.schemaDir) return { files };

        logger.info("render", "Rendering pathway");
        const schemas = loadSchemas(options.schemaDir);
        const pathwayData = await pathwayGenerator.generate({
          standard: entities.standard,
          domain: entities.domain,
          industry: entities.industry,
          schemas,
        });
        const pathwayFiles = renderer.renderPathway(pathwayData);
        for (const [name, content] of pathwayFiles) {
          files.set(`data/pathway/${name}`, content);
        }
        logger.info("render", `Pathway: ${pathwayFiles.size} files`);
        return { files };
      },
    },

    datasets: {
      deps: ["parse"],
      async run({ parse }) {
        const files = new Map();
        if (!parse.datasets?.length || !toolFactory) {
          return { files, datasetsMap: new Map() };
        }

        const datasets = await generateDatasets(
          parse.datasets,
          parse.seed,
          toolFactory,
          logger,
          parse.clinical,
        );
        await renderDatasetOutputs(parse.outputs, datasets, files, logger);
        return { files, datasetsMap: datasets };
      },
    },

    "fhir-cross-ref": {
      deps: ["parse", "entities", "datasets"],
      run({ parse, entities, datasets }) {
        const wiredOutputs = (parse.outputs || []).filter(
          (o) => o.format === "fhir_microdata_html",
        );
        if (wiredOutputs.length === 0) return null;
        if (!entities.clinical) {
          logger.info(
            "pipeline",
            "fhir-cross-ref: skipped (no clinical block)",
          );
          return null;
        }
        const mergedPatients = [];
        const mergedConditions = [];
        for (const out of wiredOutputs) {
          const p = findFhirDataset(
            datasets.datasetsMap,
            out.dataset,
            "patient",
          );
          const c = findFhirDataset(
            datasets.datasetsMap,
            out.dataset,
            "condition",
          );
          if (!p || !c) {
            logger.info(
              "pipeline",
              `fhir-cross-ref: skipping output '${out.dataset}' (sibling FHIR datasets not generated)`,
            );
            continue;
          }
          mergedPatients.push(...p.records);
          mergedConditions.push(...c.records);
        }
        if (mergedPatients.length === 0) return null;
        return buildFhirCrossRef({
          patients: mergedPatients,
          conditions: mergedConditions,
          clinical: entities.clinical,
          domain: entities.domain,
        });
      },
    },

    "fhir-microdata-html": {
      deps: ["parse", "entities", "datasets", "fhir-cross-ref"],
      run({ parse, entities, datasets, "fhir-cross-ref": crossRef }) {
        const files = new Map();
        if (crossRef === null) return { files };
        const wiredOutputs = (parse.outputs || []).filter(
          (o) => o.format === "fhir_microdata_html",
        );
        for (const out of wiredOutputs) {
          // entities.domain is canonical: fhir-cross-ref mints trial IRIs from it.
          const input = unwrapFhirDatasets(
            datasets.datasetsMap,
            out,
            entities.domain,
            crossRef,
          );
          if (!input) {
            logger.info(
              "pipeline",
              `fhir-microdata-html: skipping output '${out.dataset}' (sibling FHIR datasets not generated)`,
            );
            continue;
          }
          const rendered = renderFhirMicrodataHtml(input, out.config);
          for (const [path, content] of rendered) files.set(path, content);
        }
        return { files };
      },
    },

    "clinical-output": {
      deps: ["parse", "entities", "cache-lookup"],
      run({ parse, entities, "cache-lookup": prose }) {
        const files = new Map();
        if (!entities.clinical) return { files };

        const clinicalOutputs = (parse.outputs || []).filter(
          (o) =>
            o.format === "supabase_migration" ||
            o.format === "embeddings_jsonl",
        );
        if (clinicalOutputs.length === 0) return { files };

        logger.info(
          "pipeline",
          `Rendering ${clinicalOutputs.length} clinical output(s)`,
        );

        for (const out of clinicalOutputs) {
          const rendered = renderClinicalOutput(out, entities.clinical, prose);
          for (const [path, content] of rendered) files.set(path, content);
        }

        logger.info("pipeline", `Clinical output: ${files.size} files`);
        return { files };
      },
    },

    validate: {
      deps: ["enriched", "entities"],
      run({ enriched, entities }) {
        const hasOrgBlocks = !!entities.people;
        const validation = hasOrgBlocks
          ? validator.validate(entities)
          : { checks: [], failures: 0, passed: true };

        logger.info(
          "validate",
          `${validation.checks.length} checks, ${validation.failures} failures`,
        );

        if (enriched.linked) {
          validateHtmlBlock(
            enriched.linked,
            entities,
            enriched.files,
            validation,
            logger,
          );
        }
        return validation;
      },
    },

    write: {
      deps: [
        "enriched",
        "raw",
        "markdown",
        "pathway",
        "datasets",
        "clinical-output",
        "fhir-microdata-html",
        "validate",
      ],
      run({
        enriched,
        raw,
        markdown,
        pathway,
        datasets,
        "clinical-output": clinicalOutput,
        "fhir-microdata-html": fhirMicrodataHtml,
        validate,
      }) {
        const files = mergeOutputFiles(
          options.only,
          enriched,
          raw,
          markdown,
          pathway,
          datasets,
          clinicalOutput,
          fhirMicrodataHtml,
        );
        const include = (type) => !options.only || options.only === type;
        const rawDocuments = include("raw") ? raw.rawDocuments : new Map();
        return { files, rawDocuments, validate };
      },
    },
  };
}

/** Run each dataset tool and collect results into a Map by name. */
async function generateDatasets(
  definitions,
  seed,
  toolFactory,
  logger,
  clinical,
) {
  logger.info("pipeline", `Generating ${definitions.length} dataset(s)`);
  const datasets = new Map();
  for (const ds of definitions) {
    const config = resolveDatasetConfig(ds, clinical, logger);
    const tool = toolFactory(ds.tool, { logger });
    try {
      await tool.checkAvailability();
    } catch (err) {
      logger.info(
        "pipeline",
        `Skipping dataset '${ds.id}': ${ds.tool} not available (${err.message})`,
      );
      continue;
    }
    const results = await tool.generate({
      ...config,
      seed,
      name: ds.id,
    });
    for (const dataset of results) {
      datasets.set(dataset.name, dataset);
    }
  }
  return datasets;
}

/**
 * Build the per-dataset config passed to the tool. Resolves clinical
 * `conditions` to Synthea modules and merges with any modules the DSL
 * declares explicitly. Returns a shallow copy of `ds.config` — never mutates
 * the parsed AST node, so re-runs of the datasets stage see the same input.
 */
function resolveDatasetConfig(ds, clinical, logger) {
  const config = { ...ds.config };
  if (!config.conditions?.length || !clinical?.conditions?.length)
    return config;

  const resolved = [];
  for (const condId of config.conditions) {
    const cond = clinical.conditions.find((c) => c.id === condId);
    if (cond?.synthea_module) {
      resolved.push(cond.synthea_module);
    } else {
      logger.info(
        "pipeline",
        `Dataset '${ds.id}' condition '${condId}' has no synthea_module; skipped`,
      );
    }
  }
  if (resolved.length === 0) return config;

  const existing = config.modules || [];
  const seen = new Set(existing);
  const merged = [...existing];
  for (const m of resolved) {
    if (!seen.has(m)) {
      seen.add(m);
      merged.push(m);
    }
  }
  config.modules = merged;
  return config;
}

/** Render dataset outputs and merge into the files map. */
async function renderDatasetOutputs(outputs, datasets, files, logger) {
  logger.info("pipeline", `Rendering ${outputs.length} dataset output(s)`);
  for (const out of outputs) {
    if (out.format === "fhir_microdata_html") continue;
    const dataset = datasets.get(out.dataset);
    if (!dataset) {
      logger.info(
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

/** Merge files from each content type, respecting the --only filter. */
function mergeOutputFiles(
  only,
  enriched,
  raw,
  markdown,
  pathway,
  datasets,
  clinicalOutput,
  fhirMicrodataHtml,
) {
  const files = new Map();
  const include = (type) => !only || only === type;

  const sources = [
    ["html", enriched.files],
    ["pathway", pathway.files],
    ["raw", raw.files],
    ["markdown", markdown.files],
  ];
  for (const [type, source] of sources) {
    if (include(type)) {
      for (const [k, v] of source) files.set(k, v);
    }
  }
  // datasets and clinical output are always included regardless of --only
  for (const [k, v] of datasets.files) files.set(k, v);
  for (const [k, v] of clinicalOutput.files) files.set(k, v);
  for (const [k, v] of fhirMicrodataHtml.files) files.set(k, v);

  return files;
}

/** Look up a Synthea-generated FHIR Dataset by `<output.dataset>_<type>`. */
function findFhirDataset(datasetsMap, datasetId, type) {
  return datasetsMap?.get(`${datasetId}_${type}`);
}

/**
 * Pull the four FHIR record arrays for one `fhir_microdata_html` output from
 * `datasetsMap`. Returns `null` when sibling Datasets are missing.
 */
function unwrapFhirDatasets(datasetsMap, out, domain, crossRef) {
  const patient = findFhirDataset(datasetsMap, out.dataset, "patient");
  const condition = findFhirDataset(datasetsMap, out.dataset, "condition");
  if (!patient || !condition) return null;
  return {
    patients: patient.records,
    conditions: condition.records,
    procedures:
      findFhirDataset(datasetsMap, out.dataset, "procedure")?.records ?? [],
    medRequests:
      findFhirDataset(datasetsMap, out.dataset, "medicationrequest")?.records ??
      [],
    crossRef,
    domain,
  };
}

function renderClinicalOutput(out, clinical, prose) {
  if (out.format === "supabase_migration") {
    return renderSql(clinical, out.config);
  }
  return renderEmbeddings(clinical, prose, out.config);
}

/**
 * Resolve prose keys through the generator, flushing the cache sink
 * periodically. Returns a Map of key→prose.
 */
async function resolveProse(proseKeys, proseGenerator, proseCacheSink, logger) {
  const prose = new Map();
  const total = proseKeys.size;
  const mode = proseGenerator.mode;
  const logging = mode !== "no-prose";

  if (logging) {
    logger.info("pipeline", `Resolving prose (${mode} mode, ${total} keys)`);
  }

  let i = 0;
  for (const [key, context] of proseKeys) {
    i++;
    const value = context.messages
      ? await proseGenerator.generateStructured(key, context.messages, {
          maxTokens: context.maxTokens || 4000,
        })
      : await proseGenerator.generatePlain(key, context);
    if (value) prose.set(key, value);
    if (logging) {
      logger.info("prose", `[${i}/${total}] ${key}`);
      if (i % FLUSH_EVERY === 0) proseCacheSink.flush();
    }
  }
  if (logging) proseCacheSink.flush();
  return prose;
}

/**
 * Validate HTML structure (link density, microdata) and merge results into
 * the validation block. Mutates `validation` in place.
 */
function validateHtmlBlock(htmlLinked, entities, files, validation, logger) {
  const linkValidation = validateLinks(htmlLinked, entities.domain);
  validation.checks.push({
    name: "link_density",
    passed: linkValidation.passed,
  });
  if (!linkValidation.passed) {
    validation.failures++;
    validation.passed = false;
    logger.error(
      "validate",
      `Link validation: ${linkValidation.failures} failures`,
    );
  }

  const orgFiles = new Map();
  for (const [path, content] of files) {
    if (path.startsWith("data/knowledge/") && path.endsWith(".html")) {
      orgFiles.set(path, content);
    }
  }
  const htmlValidation = validateHTML(orgFiles, entities.domain);
  for (const check of htmlValidation.checks) validation.checks.push(check);
  if (!htmlValidation.passed) {
    validation.failures += htmlValidation.failures;
    validation.passed = false;
    for (const c of htmlValidation.checks.filter((c) => !c.passed)) {
      logger.error("validate", c.message);
    }
  }
}
