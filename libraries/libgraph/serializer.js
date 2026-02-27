import { DataFactory, Writer } from "n3";
const { namedNode, literal } = DataFactory;

/**
 * @typedef {object} OntologyData
 * @property {Map<string, Set<string>>} classSubjects - Map of class IRIs to sets of subject IRIs
 * @property {Map<string, Set<string>>} subjectClasses - Map of subject IRIs to sets of class IRIs
 * @property {Map<string, Map<string, Set<string>>>} classPredicates - Map of class IRIs to predicate maps
 * @property {Map<string, number>} predicateCounts - Map of predicate IRIs to usage counts
 * @property {Map<string, Map<string, number>>} predicateObjectTypes - Map of predicates to object type counts
 * @property {Map<string, string>} inversePredicates - Map of "fromClass|predicate|toClass" to inverse predicate IRI
 */

/**
 * @typedef {object} OntologySerializerInterface
 * @property {function(OntologyData): string} serialize - Serializes ontology data to a string format
 */

/**
 * SHACL Turtle serializer for ontology data.
 * @implements {OntologySerializerInterface}
 */
export class ShaclSerializer {
  /**
   *
   */
  serialize(ontologyData) {
    if (!ontologyData) throw new Error("ontologyData is required");
    const writer = new Writer({ prefixes: this.#getPrefixes() });
    const classEntries = Array.from(ontologyData.classSubjects.entries()).sort(
      (a, b) => b[1].size - a[1].size,
    );
    for (const [cls, subjects] of classEntries) {
      const shapeIri = `${cls}Shape`;
      this.#addShapeMetadata(writer, shapeIri, cls, subjects.size);
      const predicateMap = ontologyData.classPredicates.get(cls) || new Map();
      const predicateEntries = Array.from(predicateMap.entries()).sort(
        (a, b) =>
          b[1].size - a[1].size ||
          (ontologyData.predicateCounts.get(b[0]) || 0) -
            (ontologyData.predicateCounts.get(a[0]) || 0),
      );
      for (const [predicate, subjectSet] of predicateEntries) {
        const dominantClass = this.#getDominantObjectClass(
          predicate,
          ontologyData.predicateObjectTypes,
        );
        const inversePred = dominantClass
          ? ontologyData.inversePredicates.get(
              `${cls}|${predicate}|${dominantClass}`,
            )
          : null;
        const propertyPredicates = this.#buildPropertyPredicates(
          predicate,
          subjectSet.size,
          dominantClass,
          inversePred,
        );
        const bnodeId = writer.blank(propertyPredicates);
        writer.addQuad(
          namedNode(shapeIri),
          namedNode("http://www.w3.org/ns/shacl#property"),
          bnodeId,
        );
      }
    }
    let ttl = "";
    writer.end((err, result) => {
      if (err) throw err;
      ttl = result;
    });
    return ttl;
  }

  /**
   *
   */
  #getPrefixes() {
    return {
      rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
      rdfs: "http://www.w3.org/2000/01/rdf-schema#",
      sh: "http://www.w3.org/ns/shacl#",
      dct: "http://purl.org/dc/terms/",
      schema: "https://schema.org/",
      foaf: "http://xmlns.com/foaf/0.1/",
    };
  }

  /**
   *
   */
  #getLocalName(iri) {
    if (!iri) return "";
    const idx = Math.max(iri.lastIndexOf("#"), iri.lastIndexOf("/"));
    return idx >= 0 ? iri.slice(idx + 1) : iri;
  }

  /**
   *
   */
  #addShapeMetadata(writer, shapeIri, classIri, instanceCount) {
    const shapeNode = namedNode(shapeIri);
    const rdfType = namedNode(
      "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
    );
    writer.addQuad(
      shapeNode,
      rdfType,
      namedNode("http://www.w3.org/ns/shacl#NodeShape"),
    );
    writer.addQuad(
      shapeNode,
      namedNode("http://www.w3.org/ns/shacl#targetClass"),
      namedNode(classIri),
    );
    writer.addQuad(
      shapeNode,
      namedNode("http://purl.org/dc/terms/source"),
      namedNode(classIri),
    );
    writer.addQuad(
      shapeNode,
      namedNode("http://purl.org/dc/terms/description"),
      literal(`Shape for ${this.#getLocalName(classIri)} instances`),
    );
    writer.addQuad(
      shapeNode,
      namedNode("http://www.w3.org/ns/shacl#name"),
      literal(this.#getLocalName(classIri)),
    );
    writer.addQuad(
      shapeNode,
      namedNode("http://www.w3.org/ns/shacl#comment"),
      literal(`Instances: ${instanceCount}`),
    );
  }

  /**
   *
   */
  #buildPropertyPredicates(
    predicateIri,
    instanceCount,
    dominantClass,
    inversePred,
  ) {
    const rdfType = namedNode(
      "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
    );
    const predicates = [
      {
        predicate: rdfType,
        object: namedNode("http://www.w3.org/ns/shacl#PropertyShape"),
      },
      {
        predicate: namedNode("http://www.w3.org/ns/shacl#path"),
        object: namedNode(predicateIri),
      },
      {
        predicate: namedNode("http://www.w3.org/ns/shacl#name"),
        object: literal(this.#getLocalName(predicateIri)),
      },
      {
        predicate: namedNode("http://www.w3.org/ns/shacl#comment"),
        object: literal(`Instances: ${instanceCount}`),
      },
    ];
    if (dominantClass) {
      predicates.push(
        {
          predicate: namedNode("http://www.w3.org/ns/shacl#class"),
          object: namedNode(dominantClass),
        },
        {
          predicate: namedNode("http://www.w3.org/ns/shacl#nodeKind"),
          object: namedNode("http://www.w3.org/ns/shacl#IRI"),
        },
      );
      if (inversePred) {
        predicates.push({
          predicate: namedNode("http://www.w3.org/ns/shacl#inversePath"),
          object: namedNode(inversePred),
        });
      }
    }
    return predicates;
  }

  /**
   *
   */
  #getDominantObjectClass(predicate, predicateObjectTypes) {
    const typeMap = predicateObjectTypes.get(predicate);
    if (!typeMap || typeMap.size === 0) return null;
    let max = 0;
    let dom = null;
    for (const [cls, count] of typeMap.entries()) {
      if (count > max) {
        max = count;
        dom = cls;
      }
    }
    const total = Array.from(typeMap.values()).reduce((s, c) => s + c, 0);
    return max / total > 0.5 ? dom : null;
  }
}
