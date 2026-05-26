/**
 * Pipeline DAG — pull-based stage graph for fit-terrain.
 *
 * Each verb declares a terminal node; the executor walks the transitive
 * closure backwards from there, memoizing per run. Nodes are pure
 * functions of their declared dependencies; side-effects (writes,
 * uploads, cache flushes) live in sinks.
 *
 * Nodes:
 *   parse              ← storyPath
 *   entities           ← parse
 *   prose-keys         ← entities
 *   cache-lookup       ← prose-keys
 *   datasets           ← parse
 *   fhir-cross-ref     ← parse, entities, datasets
 *   skeleton           ← entities, cache-lookup, fhir-cross-ref
 *   enriched           ← skeleton, cache-lookup
 *   raw                ← entities, cache-lookup
 *   markdown           ← entities, cache-lookup
 *   pathway            ← entities
 *   clinical-output    ← parse, entities, cache-lookup
 *   fhir-microdata-html ← parse, datasets, fhir-cross-ref
 *   validate           ← enriched, entities
 *   write              ← enriched, raw, markdown, pathway, datasets,
 *                         clinical-output, fhir-microdata-html, validate
 *
 * Verb terminal-closure walks (the cost-shifting payoff of Phase D):
 *   check    → parse, entities, prose-keys, cache-lookup
 *   validate → ...above + datasets, fhir-cross-ref, skeleton, enriched,
 *              validate (datasets pulled via the skeleton → fhir-cross-ref
 *              dependency)
 *   build    → all of the above + raw, markdown, pathway,
 *              clinical-output, fhir-microdata-html, write
 *
 * Node table definitions live in nodes.js.
 *
 * @module libterrain/pipeline
 */

import { buildNodes } from "./nodes.js";
import { NullProseCacheSink } from "./sinks.js";

/** Names of the nodes the DAG knows about. Inspect verb takes one of these. */
export const STAGES = [
  "parse",
  "entities",
  "prose-keys",
  "cache-lookup",
  "skeleton",
  "enriched",
  "raw",
  "markdown",
  "pathway",
  "datasets",
  "fhir-cross-ref",
  "clinical-output",
  "fhir-microdata-html",
  "validate",
  "write",
];

/**
 * Walk the DAG backwards from `terminal`, executing each node once and
 * memoizing its output. Returns the terminal node's output, the per-run
 * cache (so callers can read intermediate nodes), and the set of nodes
 * that ran (for verb-level assertions).
 *
 * @param {object} nodes - Node table from buildNodes
 * @param {string} terminal
 * @returns {Promise<{ output: any, cache: Map<string, any>, ran: Set<string> }>}
 */
async function execute(nodes, terminal) {
  if (!nodes[terminal]) {
    throw new Error(
      `Unknown stage '${terminal}'. Known: ${Object.keys(nodes).join(", ")}`,
    );
  }
  const cache = new Map();
  const ran = new Set();

  async function visit(name) {
    if (cache.has(name)) return cache.get(name);
    const node = nodes[name];
    if (!node) throw new Error(`Unknown stage '${name}'`);
    const deps = {};
    for (const dep of node.deps) {
      deps[dep] = await visit(dep);
    }
    const out = await node.run(deps);
    cache.set(name, out);
    ran.add(name);
    return out;
  }

  const output = await visit(terminal);
  return { output, cache, ran };
}

/** Pull-based DAG executor that runs terrain generation stages up to a declared terminal node. */
export class Pipeline {
  /**
   * @param {object} deps
   * @param {import('@forwardimpact/libsyntheticgen').DslParser} deps.dslParser
   * @param {import('@forwardimpact/libsyntheticgen').EntityGenerator} deps.entityGenerator
   * @param {import('@forwardimpact/libsyntheticprose').ProseCache} deps.proseCache
   * @param {import('@forwardimpact/libsyntheticprose').ProseGenerator} deps.proseGenerator
   * @param {import('@forwardimpact/libsyntheticprose').PathwayGenerator} deps.pathwayGenerator
   * @param {import('@forwardimpact/libsyntheticrender').Renderer} deps.renderer
   * @param {import('@forwardimpact/libsyntheticrender').ContentValidator} deps.validator
   * @param {{ flush: () => void }} [deps.proseCacheSink]
   * @param {Function} [deps.toolFactory]
   * @param {object} deps.logger
   */
  constructor({
    dslParser,
    entityGenerator,
    proseCache,
    proseGenerator,
    pathwayGenerator,
    renderer,
    validator,
    proseCacheSink,
    toolFactory,
    logger,
  }) {
    if (!dslParser) throw new Error("dslParser is required");
    if (!entityGenerator) throw new Error("entityGenerator is required");
    if (!proseCache) throw new Error("proseCache is required");
    if (!proseGenerator) throw new Error("proseGenerator is required");
    if (!pathwayGenerator) throw new Error("pathwayGenerator is required");
    if (!renderer) throw new Error("renderer is required");
    if (!validator) throw new Error("validator is required");
    if (!logger) throw new Error("logger is required");

    this.dslParser = dslParser;
    this.entityGenerator = entityGenerator;
    this.proseCache = proseCache;
    this.proseGenerator = proseGenerator;
    this.pathwayGenerator = pathwayGenerator;
    this.renderer = renderer;
    this.validator = validator;
    this.proseCacheSink = proseCacheSink || new NullProseCacheSink();
    this.toolFactory = toolFactory || null;
    this.logger = logger;
  }

  /**
   * Execute the DAG up to `terminal` and shape a verb-friendly result.
   * Verbs walk only the transitive closure of their terminal node, so
   * `check` (terminal=`cache-lookup`) skips renderers, datasets, and I/O.
   *
   * @param {object} options
   * @param {string} options.storyPath - DSL source path
   * @param {string} options.terminal - Terminal stage name
   * @param {string|null} [options.only=null]
   * @param {string|null} [options.schemaDir=null]
   * @returns {Promise<{ stage: string, ran: Set<string>, output: any, files: Map<string,string>, rawDocuments: Map<string,string>, entities: object, validation: object, stats: object }>}
   */
  async run(options) {
    const { storyPath, terminal, only = null, schemaDir = null } = options;
    if (!terminal) throw new Error("terminal stage is required");

    const nodes = buildNodes({
      dslParser: this.dslParser,
      entityGenerator: this.entityGenerator,
      proseGenerator: this.proseGenerator,
      pathwayGenerator: this.pathwayGenerator,
      renderer: this.renderer,
      validator: this.validator,
      proseCacheSink: this.proseCacheSink,
      toolFactory: this.toolFactory,
      logger: this.logger,
      options: { storyPath, only, schemaDir },
    });

    const { output, cache, ran } = await execute(nodes, terminal);

    // Persist any prose generated by enrichment/pathway after the
    // cache-lookup flush. cache-lookup flushes prose-key entries, but
    // generateStructured() calls inside `enriched` and `pathway` write
    // additional entries that would otherwise be lost on exit.
    this.proseCacheSink.flush();

    const entities = cache.get("entities") ?? {};
    const writeNode = cache.get("write");
    const files = writeNode?.files ?? new Map();
    const rawDocuments = writeNode?.rawDocuments ?? new Map();
    const validation = cache.get("validate") ?? {
      checks: [],
      failures: 0,
      passed: true,
    };

    return {
      stage: terminal,
      ran,
      output,
      files,
      rawDocuments,
      entities,
      validation,
      stats: {
        prose: {
          ...this.proseCache.stats,
          generated: this.proseGenerator.stats.generated,
        },
        files: files.size,
        rawDocuments: rawDocuments.size,
      },
    };
  }
}
