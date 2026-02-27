/**
 * Base class for batch processor implementations with common batch management logic
 */
export class ProcessorBase {
  #logger;
  #batchSize;

  /**
   * Creates a new processor instance
   * @param {object} logger - Logger instance for debug output
   * @param {number} batchSize - Size of batches for processing (default: 4)
   */
  constructor(logger, batchSize = 4) {
    if (!logger) throw new Error("logger is required");
    if (typeof batchSize !== "number" || batchSize < 1) {
      throw new Error("batchSize must be a positive number");
    }

    this.#logger = logger;
    this.#batchSize = batchSize;
  }

  /**
   * Gets the logger instance for use in subclasses
   * @returns {object} Logger instance
   * @protected
   */
  get logger() {
    return this.#logger;
  }

  /**
   * Processes items in batches
   * @param {any[]} items - Items to process
   * @param {string} context - Processing context label
   * @returns {Promise<any[]>} Processed results
   */
  async process(items, context = "items") {
    if (!Array.isArray(items)) {
      throw new Error("items must be an array");
    }

    if (items.length === 0) {
      this.#logger.debug("Processor", "No items to process", { context });
      return;
    }

    this.#logger.debug("Processor", "Starting batch", {
      total: items.length,
      context,
    });

    let currentBatch = [];
    let processedCount = 0;

    for (let i = 0; i < items.length; i++) {
      currentBatch.push(items[i]);

      if (currentBatch.length >= this.#batchSize) {
        await this.processBatch(
          currentBatch,
          processedCount,
          items.length,
          context,
        );
        processedCount += currentBatch.length;
        currentBatch = [];
      }
    }

    if (currentBatch.length > 0) {
      await this.processBatch(
        currentBatch,
        processedCount,
        items.length,
        context,
      );
    }
  }

  /**
   * Processes a batch of items
   * @param {any[]} batch - Batch to process
   * @param {number} processed - Number already processed
   * @param {number} total - Total number of items
   * @param {object} context - Processing context
   * @returns {Promise<any[]>} Batch results
   */
  async processBatch(batch, processed, total, context) {
    const batchSize = batch.length;

    this.#logger.debug("Processor", "Processing batch", {
      items:
        batchSize > 1
          ? `${processed + 1}-${processed + batchSize}/${total}`
          : `${processed + 1}/${total}`,
      context,
    });

    const promises = batch.map(async (item, itemIndex) => {
      const globalIndex = processed + itemIndex;
      try {
        return await this.processItem(item);
      } catch (error) {
        this.#logger.debug("Processor", "Skipping, failed to process item", {
          item: `${globalIndex + 1}/${total}`,
          context,
          error: error.message,
        });
        return null;
      }
    });

    await Promise.all(promises);
  }

  /**
   * Processes a single item (must be implemented by subclass)
   * @param {any} _item - Item to process
   * @returns {Promise<any>} Processed result
   */
  async processItem(_item) {
    throw new Error("processItem must be implemented by subclass");
  }
}
