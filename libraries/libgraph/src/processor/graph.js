import { Parser } from "n3";
import { ProcessorBase } from "@forwardimpact/libutil";

import { OntologyProcessor } from "./ontology.js";
import { ShaclSerializer } from "../serializer.js";

/**
 * The GraphProcessor class processes resources with N-Quads into the graph
 * index
 * @augments {ProcessorBase}
 */
export class GraphProcessor extends ProcessorBase {
  #resourceIndex;
  #targetIndex;
  #ontologyProcessor;
  #serializer;

  /**
   * Creates a new GraphProcessor instance
   * @param {import("@forwardimpact/libgraph").GraphIndex} graphIndex - The graph index to store RDF quads
   * @param {import("@forwardimpact/libresource").ResourceIndex} resourceIndex - ResourceIndex instance to process resources from
   * @param {import("@forwardimpact/libutil").Logger} logger - Logger instance for debug output
   */
  constructor(graphIndex, resourceIndex, logger) {
    super(logger);
    if (!graphIndex) throw new Error("graphIndex is required");
    if (!resourceIndex) throw new Error("resourceIndex is required");

    this.#resourceIndex = resourceIndex;
    this.#targetIndex = graphIndex;
    this.#ontologyProcessor = new OntologyProcessor();
    this.#serializer = new ShaclSerializer();
  }

  /** @inheritdoc */
  async processItem(item) {
    const id = String(item.identifier);

    // Skip if no content
    if (!item.resource.content) {
      this.logger.debug("Processor", "Skipping resource without N-Quads", {
        id,
      });
      return;
    }

    // Try to parse the RDF content. Skip the item if the parse fails
    let quads;
    try {
      quads = this.#rdfToQuads(item.resource.content);
    } catch (error) {
      this.logger.debug("Processor", "Skipping non-RDF content", {
        id,
        error: error.message,
      });
      return;
    }

    if (quads.length === 0) {
      this.logger.debug("Processor", "No RDF found in content", { id });
      return;
    }

    // CRITICAL: Sort the quads to make sure rdf:type assertions come before
    // property triples. OntologyProcessor detects inverse relationships. It
    // needs the type information when it processes object properties. This
    // step is defensive. ResourceProcessor should already provide a
    // canonical order. We enforce the order here to stay robust against
    // other quad sources.
    // See: SCRATCHPAD.md "RDF Quad Ordering for Reliable Processing"
    quads.sort((a, b) => {
      const aIsType = this.#isTypePredicate(a.predicate.value);
      const bIsType = this.#isTypePredicate(b.predicate.value);
      if (aIsType && !bIsType) return -1;
      if (!aIsType && bIsType) return 1;
      return 0;
    });

    // Add quads to the graph index
    // The token count is already on the identifier from withIdentifier()
    if (!item.identifier.tokens) {
      throw new Error(`Resource missing tokens: ${String(item.identifier)}`);
    }

    await this.#targetIndex.add(item.identifier, quads);
  }

  /**
   * Check if a predicate is rdf:type
   * @param {string} predicate - Predicate IRI
   * @returns {boolean} True if the predicate is rdf:type
   * @private
   */
  #isTypePredicate(predicate) {
    return predicate === "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
  }

  /**
   * Parse an RDF string into RDF quads
   * @param {string} rdf - RDF string
   * @returns {Array} Array of RDF quads
   * @private
   */
  #rdfToQuads(rdf) {
    const parser = new Parser({ format: "Turtle" });
    return parser.parse(rdf);
  }

  /**
   * Saves the ontology to storage so agents can consume it
   * @returns {Promise<void>}
   */
  async saveOntology() {
    const storage = this.#targetIndex.storage();
    const data = this.#ontologyProcessor.getData();
    const ttl = this.#serializer.serialize(data);
    await storage.put("ontology.ttl", ttl);
  }

  /**
   * Process resources from the resource index with N-Quads content
   * @param {string} actor - Actor identifier for access control
   * @returns {Promise<void>}
   */
  async process(actor) {
    // 1. Get all resource identifiers
    const identifiers = await this.#resourceIndex.findAll();

    // 2. Filter out resources that don't contain RDF content
    // Only common.Message resources (from HTML knowledge sources) contain RDF
    const filteredIdentifiers = identifiers.filter((identifier) => {
      const id = String(identifier);
      return (
        !id.startsWith("common.Conversation") &&
        !id.startsWith("common.Assistant") &&
        !id.startsWith("tool.ToolFunction")
      );
    });

    // 3. Load the full resources with the identifiers
    const resources = await this.#resourceIndex.get(filteredIdentifiers, actor);

    // 4. Pre-filter the resource contents that already exist in the target
    //    graph index
    const existing = new Set();
    const checks = await Promise.all(
      resources.map(async (resource) => ({
        id: String(resource.id),
        exists: await this.#targetIndex.has(String(resource.id)),
      })),
    );
    checks
      .filter((check) => check.exists)
      .forEach((check) => existing.add(check.id));

    // Keep only the resources that the processor must handle
    const resourcesToProcess = [];
    for (const resource of resources) {
      // Only process resources with content
      if (!resource.content) {
        continue; // Skip resources without content
      }

      // Skip if already exists
      if (existing.has(String(resource.id))) {
        continue; // Skip resources that already exist
      }

      resourcesToProcess.push({
        resource: resource,
        identifier: resource.id,
      });
    }

    // 5. Use ProcessorBase to process the batch
    await super.process(resourcesToProcess);

    // 6. Rebuild the ontology from ALL quads in the graph index. Do not use
    //    only the quads this run processed. Without this step, the dedup
    //    filter makes re-runs skip resources that already exist. The
    //    ontology processor then stays empty and overwrites ontology.ttl
    //    with an empty file.
    this.#ontologyProcessor = new OntologyProcessor();
    const allQuads = await this.#targetIndex.getAllQuads();
    allQuads.sort((a, b) => {
      const aIsType = this.#isTypePredicate(a.predicate.value);
      const bIsType = this.#isTypePredicate(b.predicate.value);
      if (aIsType && !bIsType) return -1;
      if (!aIsType && bIsType) return 1;
      return 0;
    });
    for (const quad of allQuads) {
      this.#ontologyProcessor.process(quad);
    }

    // 7. Save the ontology after the processor handles all items
    await this.saveOntology();
  }
}
