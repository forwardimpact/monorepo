import { Store, DataFactory } from "n3";
import { resource } from "@forwardimpact/libtype";
import { IndexBase } from "@forwardimpact/libindex";
import { isWildcard } from "../index.js";

const { namedNode, literal } = DataFactory;

/**
 * GraphIndex class for managing RDF graph data with lazy loading
 * @implements {import("@forwardimpact/libindex").IndexInterface}
 */
export class GraphIndex extends IndexBase {
  #graph;
  #prefixes;

  /**
   * Creates a new GraphIndex instance
   * @param {import("@forwardimpact/libstorage").StorageInterface} storage - Storage interface for data operations
   * @param {Store} store - N3 Store instance for graph operations
   * @param {{[key: string]: string}} [prefixes] - Optional RDF prefix map
   * @param {string} [indexKey] - The index file name to use for storage (default: "index.jsonl")
   */
  constructor(storage, store, prefixes = {}, indexKey = "index.jsonl") {
    if (!storage) throw new Error("storage is required");
    if (!store || !(store instanceof Store))
      throw new Error("store must be an N3 Store instance");

    super(storage, indexKey);

    this.#graph = store;
    this.#prefixes = prefixes;
  }

  /**
   * Adds quads to the index with identifier mapping
   * @param {resource.Identifier} identifier - Resource identifier
   * @param {object[]} quads - Array of quad objects with subject, predicate, object
   * @returns {Promise<void>}
   */
  async add(identifier, quads) {
    if (!this.loaded) await this.loadData();

    for (const quad of quads) {
      this.#graph.addQuad(quad.subject, quad.predicate, quad.object);
    }

    const item = {
      id: String(identifier),
      identifier,
      quads,
    };

    await super.add(item);
  }

  /**
   * Loads graph data from disk
   * @returns {Promise<void>}
   */
  async loadData() {
    this.#graph.removeMatches();
    await super.loadData();

    for (const item of this.index.values()) {
      if (item.quads && Array.isArray(item.quads)) {
        for (const quad of item.quads) {
          this.#graph.addQuad(quad.subject, quad.predicate, quad.object);
        }
      }
    }
  }

  /**
   * Normalizes a query pattern by converting wildcards to null
   * @param {object} pattern - Raw query pattern
   * @returns {object} Normalized pattern with wildcards converted to null
   * @private
   */
  #normalizePattern(pattern) {
    return {
      subject: isWildcard(pattern.subject) ? null : pattern.subject,
      predicate: isWildcard(pattern.predicate) ? null : pattern.predicate,
      object: isWildcard(pattern.object) ? null : pattern.object,
    };
  }

  /**
   * Finds resource identifiers that match the given subjects
   * @param {Set<string>} subjects - Set of subject URIs that matched the query
   * @returns {resource.Identifier[]} Array of resource identifiers
   * @private
   */
  #findMatchingIdentifiers(subjects) {
    const identifiers = [];
    for (const item of this.index.values()) {
      if (item.quads && Array.isArray(item.quads)) {
        const hasMatch = item.quads.some((quad) => {
          return subjects.has(quad.subject.value);
        });
        if (hasMatch) {
          identifiers.push(resource.Identifier.fromObject(item.identifier));
        }
      }
    }
    return identifiers;
  }

  /**
   * Extracts local name from a URI
   * @param {string} uri - Full URI (e.g., "https://schema.org/Person")
   * @returns {string} Local name (e.g., "Person")
   * @private
   */
  #extractLocalName(uri) {
    const parts = uri.split(/[#/]/);
    return parts[parts.length - 1] || uri;
  }

  /**
   * Gets type URIs including synonyms defined in ontology via skos:altLabel
   * @param {string} type - The requested type (e.g., "schema:Person" or "https://schema.org/Person")
   * @returns {Promise<string[]>} Array of type URIs to query
   * @private
   */
  async #getTypesWithSynonyms(type) {
    // Resolve the type to a full URI first
    const resolvedType = this.#patternTermToN3Term(type);
    const typeUri = resolvedType?.value || type;
    const types = [typeUri];

    // Load ontology.ttl to find synonyms
    const storage = this.storage();
    const ontologyContent = String((await storage.get("ontology.ttl")) || "");
    if (!ontologyContent) return types;

    // Parse ontology to find skos:altLabel for this type
    // Look for pattern: schema:TypeShape ... skos:altLabel "SynonymName"
    const typeName = this.#extractLocalName(typeUri);
    const altLabelPattern = new RegExp(
      `schema:${typeName}Shape[^.]*skos:altLabel\\s+"([^"]+)"`,
      "g",
    );

    let match;
    while ((match = altLabelPattern.exec(ontologyContent)) !== null) {
      const synonymName = match[1];
      // Construct full URI for synonym (e.g., "Individual" -> "https://schema.org/Individual")
      const synonymUri = `https://schema.org/${synonymName}`;
      types.push(synonymUri);
    }

    return types;
  }

  /**
   * Converts a pattern term to the appropriate N3 term type
   * @param {string|null} term - The term to convert
   * @returns {import("n3").Term|null} N3 term or null for wildcards
   * @private
   */
  #patternTermToN3Term(term) {
    if (!term) return null;

    if (term.startsWith('"') && term.endsWith('"')) {
      return literal(term.slice(1, -1));
    }

    if (term.includes(":")) {
      const [prefix, localName] = term.split(":", 2);

      if (this.#prefixes[prefix]) {
        return namedNode(this.#prefixes[prefix] + localName);
      }
    }

    if (term.startsWith("http://") || term.startsWith("https://")) {
      return namedNode(term);
    }

    return literal(term);
  }

  /**
   * Retrieves all subjects and their types from the graph
   * @param {string|null} [type] - Optional type URI to filter subjects by (wildcards: *, ?, _, null, NULL, or empty)
   * @returns {Promise<Map<string, string>>} Map of subject URIs to their type URIs
   */
  async getSubjects(type = null) {
    if (!this.loaded) await this.loadData();

    const typeTerm = namedNode(
      "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
    );
    const subjects = new Map();

    // Use isWildcard to normalize wildcard values to null
    const normalizedType = isWildcard(type) ? null : type;

    if (normalizedType) {
      // Get all types to query (including synonyms from ontology via skos:altLabel)
      const typesToQuery = await this.#getTypesWithSynonyms(normalizedType);

      // Query for each type (canonical + synonyms)
      for (const typeUri of typesToQuery) {
        const objectTerm = namedNode(typeUri);
        const quads = this.#graph.getQuads(null, typeTerm, objectTerm);

        for (const quad of quads) {
          subjects.set(quad.subject.value, quad.object.value);
        }
      }
    } else {
      // No type filter - return all subjects with types
      const quads = this.#graph.getQuads(null, typeTerm, null);
      for (const quad of quads) {
        subjects.set(quad.subject.value, quad.object.value);
      }
    }

    return subjects;
  }

  /**
   * Queries items from this graph index using SPARQL-like patterns
   * @param {object} pattern - Query pattern with subject, predicate, object (wildcards converted to null)
   * @param {import("@forwardimpact/libtype").tool.QueryFilter} filter - Filter object for query constraints
   * @returns {Promise<resource.Identifier[]>} Array of resource identifiers
   */
  async queryItems(pattern, filter = {}) {
    if (!this.loaded) await this.loadData();

    // 1. Normalize query pattern
    const normalized = this.#normalizePattern(pattern);

    // 2. Convert pattern terms to N3 terms, letting N3 handle prefix expansion
    const subjectTerm = normalized.subject
      ? this.#patternTermToN3Term(normalized.subject)
      : null;
    const predicateTerm = normalized.predicate
      ? this.#patternTermToN3Term(normalized.predicate)
      : null;
    const objectTerm = normalized.object
      ? this.#patternTermToN3Term(normalized.object)
      : null;

    // 3. Query the N3 store for matching triples
    const quads = this.#graph.getQuads(subjectTerm, predicateTerm, objectTerm);

    if (quads.length === 0) {
      return [];
    }

    // 3. Collect matching subjects and find identifiers
    const matchingSubjects = new Set();
    for (const quad of quads) {
      matchingSubjects.add(quad.subject.value);
    }

    let identifiers = this.#findMatchingIdentifiers(matchingSubjects);

    // Apply shared filters
    const { prefix, limit, max_tokens } = filter;

    if (prefix) {
      identifiers = identifiers.filter((identifier) =>
        this._applyPrefixFilter(String(identifier), prefix),
      );
    }

    let results = this._applyLimitFilter(identifiers, limit);
    results = this._applyTokensFilter(results, max_tokens);

    return results;
  }
}
