import { ProcessorBase } from "@forwardimpact/libutil";

/**
 * VectorProcessor class for processing resources into vector embeddings
 * @augments {ProcessorBase}
 */
export class VectorProcessor extends ProcessorBase {
  #vectorIndex;
  #resourceIndex;
  #llm;

  /**
   * Creates a new VectorProcessor instance
   * @param {import("@forwardimpact/libvector").VectorIndex} vectorIndex - The vector index to store content embeddings
   * @param {import("@forwardimpact/libresource").ResourceIndex} resourceIndex - ResourceIndex instance to process resources from
   * @param {import("@forwardimpact/libllm").LlmApi} llm - LLM client instance for embedding generation
   * @param {import("@forwardimpact/libutil").Logger} logger - Logger instance for debug output
   */
  constructor(vectorIndex, resourceIndex, llm, logger) {
    super(logger);
    if (!vectorIndex) throw new Error("vectorIndex is required");
    if (!resourceIndex) throw new Error("resourceIndex is required");
    if (!llm) throw new Error("llm is required");

    this.#vectorIndex = vectorIndex;
    this.#resourceIndex = resourceIndex;
    this.#llm = llm;
  }

  /**
   * Process resources from the resource index for vector embeddings
   * @param {string} actor - Actor identifier for access control
   * @returns {Promise<void>}
   */
  async process(actor) {
    // 1. Get all resource identifiers
    const identifiers = await this.#resourceIndex.findAll();

    // 2. Filter out conversations, their child resources, tool functions, and agents
    const filteredIdentifiers = identifiers.filter(
      (id) =>
        !String(id).startsWith("common.Conversation") &&
        !String(id).startsWith("tool.ToolFunction") &&
        !String(id).startsWith("common.Agent"),
    );

    // 3. Load the full resources using the identifiers
    const resources = await this.#resourceIndex.get(filteredIdentifiers, actor);

    // 4. Pre-filter resource contents that already exist in the content vector index
    const existing = new Set();
    const checks = await Promise.all(
      resources.map(async (resource) => ({
        id: String(resource.id),
        exists: await this.#vectorIndex.has(String(resource.id)),
      })),
    );
    checks
      .filter((check) => check.exists)
      .forEach((check) => existing.add(check.id));

    // Filter resources to only those that need processing
    const resourcesToProcess = [];
    for (const resource of resources) {
      const text = resource.content;

      if (text === null || text === "null" || text.trim() === "") {
        continue; // Skip resources with no text
      }

      // Skip if already exists
      if (existing.has(String(resource.id))) {
        continue; // Skip existing resources
      }

      resourcesToProcess.push({
        text: text,
        identifier: resource.id,
      });
    }

    // 5. Use ProcessorBase to handle the batch processing
    await super.process(resourcesToProcess, "content");
  }

  /**
   * Process a batch of items with a single embedding request
   * @param {Array<{text: string, identifier: any}>} batch - Batch of items to process
   * @param {number} processed - Number of items already processed
   * @param {number} total - Total number of items
   * @param {string} context - Processing context label
   * @returns {Promise<void>}
   */
  async processBatch(batch, processed, total, context) {
    const batchSize = batch.length;
    this.logger.debug("Processor", "Processing batch", {
      items:
        batchSize > 1
          ? `${processed + 1}-${processed + batchSize}/${total}`
          : `${processed + 1}/${total}`,
      context,
    });

    try {
      // Collect all texts and make a single embedding request
      const texts = batch.map((item) => item.text);
      const embeddings = await this.#llm.createEmbeddings(texts);

      // Store each embedding with its corresponding identifier
      await Promise.all(
        batch.map(async (item, index) => {
          const vector = embeddings.data[index].embedding;
          await this.#vectorIndex.add(item.identifier, vector);
        }),
      );
    } catch (error) {
      this.logger.debug("Processor", "Failed to process batch", {
        items: `${processed + 1}-${processed + batchSize}/${total}`,
        context,
        error: error.message,
      });
    }
  }

  /** @inheritdoc */
  async processItem(item) {
    const embeddings = await this.#llm.createEmbeddings([item.text]);
    const vector = embeddings.data[0].embedding;

    await this.#vectorIndex.add(item.identifier, vector);
    return vector;
  }
}
