import { DataFactory } from "n3";

import { generateHash } from "@forwardimpact/libsecret";

/**
 * Skolemizer for converting blank nodes to URIs using content-based hashing
 */
export class Skolemizer {
  #baseUri;

  /**
   * Creates a new Skolemizer instance
   * @param {string} [baseUri] - Base URI for skolem identifiers (default: "urn:skolem:")
   */
  constructor(baseUri = "urn:skolem:") {
    this.#baseUri = baseUri;
  }

  /**
   * Skolemize blank nodes using content-based hashing for cross-document deduplication
   * @param {Array} quads - Array of quad objects to skolemize
   * @returns {Array} Array of quads with blank nodes replaced by skolem URIs
   */
  skolemize(quads) {
    const blankNodeMap = new Map();
    const { namedNode } = DataFactory;

    // Create deterministic skolem IRI based on blank node content
    const getSkolemIri = (blankNodeId) => {
      if (!blankNodeMap.has(blankNodeId)) {
        // Collect all quads where this blank node appears as subject
        const nodeQuads = quads
          .filter((q) => q.subject.value === blankNodeId)
          .map((q) => {
            // Create canonical representation of each triple
            const obj =
              q.object.termType === "BlankNode"
                ? `_:${q.object.value}`
                : q.object.value;
            return `${q.predicate.value} ${obj}`;
          })
          .sort()
          .join("\n");

        // Hash the content for deterministic URI
        const hash = generateHash(nodeQuads);

        // Use global skolem namespace (same base for ALL documents)
        const skolemIri = `${this.#baseUri}${hash}`;

        blankNodeMap.set(blankNodeId, skolemIri);
      }
      return blankNodeMap.get(blankNodeId);
    };

    // First pass: create skolem IRIs for all blank nodes
    const blankNodes = new Set();
    for (const quad of quads) {
      if (quad.subject.termType === "BlankNode") {
        blankNodes.add(quad.subject.value);
      }
      if (quad.object.termType === "BlankNode") {
        blankNodes.add(quad.object.value);
      }
    }

    for (const blankNodeId of blankNodes) {
      getSkolemIri(blankNodeId);
    }

    // Second pass: replace all blank nodes with skolem URIs
    return quads.map((quad) => {
      const subject =
        quad.subject.termType === "BlankNode"
          ? namedNode(getSkolemIri(quad.subject.value))
          : quad.subject;

      const object =
        quad.object.termType === "BlankNode"
          ? namedNode(getSkolemIri(quad.object.value))
          : quad.object;

      return {
        subject,
        predicate: quad.predicate,
        object,
        graph: quad.graph,
      };
    });
  }
}
