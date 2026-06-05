import { parseHTML } from "linkedom";
import { sanitizeDom } from "../sanitizer.js";

import { generateHash } from "@forwardimpact/libsecret";
import { common } from "@forwardimpact/libtype";
import { ProcessorBase } from "@forwardimpact/libutil";

/**
 * Batch processes HTML knowledge files into structured Message resources.
 * Implements RDF union semantics to merge entity references across files.
 * See docs/reference.md for detailed processing pipeline and architecture.
 */
export class ResourceProcessor extends ProcessorBase {
  #resourceIndex;
  #knowledgeStorage;
  #parser;
  #logger;
  #baseIri;

  /**
   * Creates a new ResourceProcessor instance
   * @param {string} baseIri - Base IRI for resource identification (fallback if HTML lacks <base>)
   * @param {object} resourceIndex - Index for storing/retrieving Message resources
   * @param {object} knowledgeStorage - Storage backend for HTML knowledge files
   * @param {object} parser - Parser instance for HTML→RDF conversions
   * @param {object} logger - Logger instance
   * @throws {Error} If parser is null or undefined
   */
  constructor(baseIri, resourceIndex, knowledgeStorage, parser, logger) {
    super(logger, 5);

    if (!parser) throw new Error("parser is required");

    this.#baseIri = baseIri;
    this.#parser = parser;
    this.#resourceIndex = resourceIndex;
    this.#knowledgeStorage = knowledgeStorage;
    this.#logger = logger || { debug: () => {} };
  }

  /**
   * Processes HTML files from knowledge storage into Message resources
   * @param {string} extension - File extension to filter by (default: ".html")
   * @returns {Promise<void>}
   */
  async process(extension = ".html") {
    const keys = await this.#knowledgeStorage.findByExtension(extension);

    for (const key of keys) {
      const htmlContent = await this.#knowledgeStorage.get(key);
      const html = Buffer.isBuffer(htmlContent)
        ? htmlContent.toString("utf8")
        : String(htmlContent);

      const { document } = parseHTML(html);
      sanitizeDom(document);

      const baseIri = this.#extractBaseIri(document, key);
      const items = await this.#parseHTML(document, baseIri);

      await super.process(items, key);
    }
  }

  /**
   * Extracts base IRI from the document's base element or uses fallback
   * @param {object} document - Parsed document with HTML (linkedom)
   * @param {string} key - Storage key (filename) for fallback IRI generation
   * @returns {string} Base IRI to use for this document
   */
  #extractBaseIri(document, key) {
    const baseElement = document.querySelector("base[href]");
    return (
      baseElement?.getAttribute("href") ||
      this.#baseIri ||
      `https://example.invalid/${key}`
    );
  }

  /**
   * Merge a parsed item with an existing resource from the persistent index.
   * Returns the merged item if new quads were added, or null to skip.
   */
  async #mergeWithExisting(parsedItem, name, id) {
    const [existing] = await this.#resourceIndex.get([id]);
    const existingQuads = await this.#parser.rdfToQuads(existing.content);
    const mergedQuads = this.#parser.unionQuads(
      existingQuads,
      parsedItem.quads,
    );

    if (mergedQuads.length <= existingQuads.length) {
      this.#logger.debug("Processor", "Skipping duplicate resource", { id });
      return null;
    }

    this.#logger.debug("Processor", "Merging resource", { id });
    if (!this.#parser.isMainItem(parsedItem.iri, mergedQuads)) return null;

    return { name, subjects: [parsedItem.iri], quads: mergedQuads };
  }

  /**
   * Parses HTML DOM and extracts structured items with RDF union merging.
   * Implements entity merging across files using stable IRI-based identifiers.
   * @param {object} document - Parsed and sanitized document (linkedom)
   * @param {string} baseIri - Base IRI for resolving relative references
   * @returns {Promise<Array>} Array of item objects ready for processItem()
   */
  async #parseHTML(document, baseIri) {
    const parsedItems = await this.#parser.parseHTML(document, baseIri);
    if (!parsedItems || parsedItems.length === 0) return [];

    const items = [];
    const seenInCurrentFile = new Map();

    for (const parsedItem of parsedItems) {
      const name = generateHash(parsedItem.iri);
      const id = `common.Message.${name}`;

      if (seenInCurrentFile.has(id)) {
        const currentItem = seenInCurrentFile.get(id);
        currentItem.quads = this.#parser.unionQuads(
          currentItem.quads,
          parsedItem.quads,
        );
        this.#logger.debug("Processor", "Deduplicating within file", { id });
        continue;
      }

      if (await this.#resourceIndex.has(id)) {
        const merged = await this.#mergeWithExisting(parsedItem, name, id);
        if (merged) {
          items.push(merged);
          seenInCurrentFile.set(id, merged);
        }
        continue;
      }

      const item = {
        name,
        subjects: [parsedItem.iri],
        quads: parsedItem.quads,
      };
      items.push(item);
      seenInCurrentFile.set(id, item);
    }

    return items;
  }

  /**
   * Processes an extracted item into a complete Message resource
   * @param {object} item - Item object with name, subjects, and quads properties
   * @returns {Promise<object>} Typed Message resource stored in ResourceIndex
   */
  async processItem(item) {
    const { name, subjects, quads } = item;

    const message = {
      id: { name, subjects },
      role: "system",
      content: await this.#parser.quadsToRdf(quads),
    };

    const resource = common.Message.fromObject(message);
    await this.#resourceIndex.put(resource);

    return resource;
  }
}
