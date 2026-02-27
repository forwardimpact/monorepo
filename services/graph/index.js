import { services } from "@forwardimpact/librpc";

const { GraphBase } = services;

/**
 * Graph service for querying RDF graph data
 */
export class GraphService extends GraphBase {
  #graphIndex;

  /**
   * Creates a new Graph service instance
   * @param {import("@forwardimpact/libconfig").ServiceConfig} config - Service configuration object
   * @param {import("@forwardimpact/libgraph").GraphIndex} graphIndex - Pre-initialized graph index
   */
  constructor(config, graphIndex) {
    super(config);
    if (!graphIndex) throw new Error("graphIndex is required");

    this.#graphIndex = graphIndex;
  }

  /**
   * Retrieve all subjects from the graph index
   * @param {import("@forwardimpact/libtype").graph.SubjectsQuery} req - Subjects query request
   * @returns {Promise<import("@forwardimpact/libtype").tool.ToolCallResult>} Tool call result object
   */
  async GetSubjects(req) {
    const subjects = await this.#graphIndex.getSubjects(req.type || null);

    const lines = Array.from(subjects.entries())
      .map(([subject, type]) => `${subject}\t${type}`)
      .sort();

    const content = lines.join("\n");
    return { content };
  }

  /**
   * Query graph index using pattern matching
   * @param {import("@forwardimpact/libtype").graph.PatternQuery} req - Pattern query request
   * @returns {Promise<import("@forwardimpact/libtype").tool.ToolCallResult>} Tool call result object
   */
  async QueryByPattern(req) {
    const pattern = {
      subject: req.subject || null,
      predicate: req.predicate || null,
      object: req.object || null,
    };

    const identifiers = await this.#graphIndex.queryItems(pattern, req?.filter);
    return { identifiers };
  }

  /**
   * Retrieve the ontology content from storage
   * @param {import("@forwardimpact/libtype").common.Empty} _req - Empty request
   * @returns {Promise<import("@forwardimpact/libtype").tool.ToolCallResult>} Tool call result object
   */
  async GetOntology(_req) {
    const storage = this.#graphIndex.storage();

    const content = String((await storage.get("ontology.ttl")) || "");
    return { content };
  }
}
