import { minify } from "html-minifier-terser";
import { MicrodataRdfParser } from "microdata-rdf-streaming-parser";
import { Writer, Parser as N3Parser } from "n3";

/** Parser for converting HTML with microdata to structured RDF items */
export class Parser {
  #skolemizer;
  #logger;

  /**
   * Creates a new Parser instance
   * @param {object} skolemizer - Blank node skolemizer
   * @param {object} logger - Logger instance
   */
  constructor(skolemizer, logger) {
    if (!skolemizer) throw new Error("skolemizer is required");
    this.#skolemizer = skolemizer;
    this.#logger = logger || { debug: () => {} };
  }

  /**
   * Parses HTML DOM and extracts structured items
   * @param {object} dom - JSDOM instance
   * @param {string} baseIri - Base IRI for parsing
   * @returns {Promise<Array>} Array of extracted items with RDF quads
   */
  async parseHTML(dom, baseIri) {
    const minifiedHtml = await this.#minifyHTML(dom.serialize());
    const allQuads = await this.#extractQuads(minifiedHtml, baseIri);

    if (!allQuads || allQuads.length === 0) {
      this.#logger.debug("Parser", "No RDF data found in HTML content");
      return [];
    }

    const itemGroups = this.#groupQuadsByItem(allQuads);
    const items = [];

    for (const [itemIri, itemQuads] of itemGroups) {
      // Deduplicate quads for this item (same entity may appear multiple times in HTML)
      const deduplicatedQuads = this.#deduplicateQuads(itemQuads);

      if (this.isMainItem(itemIri, deduplicatedQuads)) {
        items.push({
          iri: itemIri,
          quads: deduplicatedQuads,
        });
      }
    }
    return items;
  }

  /**
   * Validates that an item is a main item with a schema.org type
   * @param {string} itemIri - The IRI of the item to validate
   * @param {Array} itemQuads - Array of RDF quads for the item
   * @returns {boolean} True if the item has an rdf:type with a schema.org value
   */
  isMainItem(itemIri, itemQuads) {
    return itemQuads.some(
      (quad) =>
        quad.subject.value === itemIri &&
        quad.predicate.value ===
          "http://www.w3.org/1999/02/22-rdf-syntax-ns#type" &&
        quad.object.value.startsWith("https://schema.org/"),
    );
  }

  /**
   * Converts RDF quads to an RDF serialization format
   * @param {Array} quads - Array of RDF quads
   * @returns {Promise<string>} RDF serialization
   */
  async quadsToRdf(quads) {
    const typeUri = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
    const sortedQuads = quads.slice().sort((a, b) => {
      const aIsType = a.predicate.value === typeUri;
      const bIsType = b.predicate.value === typeUri;
      return aIsType === bIsType ? 0 : aIsType ? -1 : 1;
    });

    return new Promise((resolve, reject) => {
      const writer = new Writer({ format: "Turtle" });
      writer.addQuads(sortedQuads);
      writer.end((error, result) => {
        if (error)
          reject(new Error(`RDF serialization failed: ${error.message}`));
        else resolve(result);
      });
    });
  }

  /**
   * Parses RDF string back into quad objects
   * @param {string} rdf - RDF serialization string
   * @returns {Promise<Array>} Array of RDF quads
   */
  async rdfToQuads(rdf) {
    return new Promise((resolve, reject) => {
      const parser = new N3Parser({ format: "Turtle" });
      const quads = [];

      parser.parse(rdf, (error, quad) => {
        if (error) {
          reject(new Error(`RDF parsing failed: ${error.message}`));
        } else if (quad) {
          quads.push(quad);
        } else {
          resolve(quads);
        }
      });
    });
  }

  /**
   * Unions two arrays of quads using RDF semantics (deduplicates identical triples)
   * @param {Array} existingQuads - Array of existing RDF quads
   * @param {Array} newQuads - Array of new RDF quads to merge
   * @returns {Array} Merged array of unique quads
   */
  unionQuads(existingQuads, newQuads) {
    return this.#deduplicateQuads([...existingQuads, ...newQuads]);
  }

  /**
   * Minifies HTML content
   * @param {string} html - HTML content to minify
   * @returns {Promise<string>} Minified HTML
   */
  async #minifyHTML(html) {
    return await minify(html, {
      collapseWhitespace: true,
      removeComments: true,
      removeRedundantAttributes: true,
      minifyCSS: true,
      minifyJS: true,
    });
  }

  /**
   * Extracts RDF quads from HTML using microdata parser
   * @param {string} html - HTML content
   * @param {string} baseIri - Base IRI for parsing
   * @returns {Promise<Array>} Array of RDF quads
   */
  async #extractQuads(html, baseIri) {
    const quads = [];
    const parser = new MicrodataRdfParser({
      baseIRI: baseIri,
      contentType: "text/html",
    });

    parser.write(html);
    parser.end();

    try {
      for await (const quad of parser) {
        quads.push(quad);
      }
    } catch (error) {
      throw new Error(`Microdata parsing failed: ${error.message}`);
    }

    return this.#skolemizer.skolemize(quads);
  }

  /**
   * Groups RDF quads by their schema.org typed items
   * @param {Array} allQuads - Complete set of RDF quads from HTML
   * @returns {Map} Map of item IRIs to their related quads
   */
  #groupQuadsByItem(allQuads) {
    const typedItems = new Set(
      allQuads
        .filter(
          (q) =>
            q.predicate.value ===
              "http://www.w3.org/1999/02/22-rdf-syntax-ns#type" &&
            q.object.value.startsWith("https://schema.org/"),
        )
        .map((q) => q.subject.value),
    );

    const itemGroups = new Map();
    for (const itemIri of typedItems) {
      const relevantQuads = allQuads.filter(
        (quad) => quad.subject.value === itemIri,
      );

      if (relevantQuads.length > 0) {
        itemGroups.set(itemIri, relevantQuads);
      }
    }
    return itemGroups;
  }

  /**
   * Builds a unique key for a quad based on its components
   * @param {object} quad - RDF quad object
   * @returns {string} Unique key identifying the quad
   */
  #buildQuadKey(quad) {
    let objectKey = quad.object.value;
    if (quad.object.termType === "Literal") {
      objectKey += `|${quad.object.datatype?.value || ""}|${quad.object.language || ""}`;
    }
    return `${quad.subject.value}|${quad.predicate.value}|${objectKey}|${quad.object.termType}`;
  }

  /**
   * Deduplicates an array of quads using the same logic as unionQuads
   * @param {Array} quads - Array of quads that may contain duplicates
   * @returns {Array} Array of unique quads
   */
  #deduplicateQuads(quads) {
    const quadMap = new Map();

    quads.forEach((quad) => {
      const key = this.#buildQuadKey(quad);
      quadMap.set(key, quad);
    });

    return Array.from(quadMap.values());
  }
}
