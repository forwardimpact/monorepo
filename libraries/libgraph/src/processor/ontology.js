/**
 * OntologyProcessor builds a lightweight SHACL shapes graph from observed
 * RDF quads. It observes rdf:type assertions, predicate usage per class,
 * global predicate frequency, object types, and inverse relationship
 * patterns. Then it generates SHACL NodeShapes with sh:targetClass,
 * sh:property, sh:class constraints, and sh:inversePath constraints.
 */
export class OntologyProcessor {
  #classSubjects; // Map<classIRI, Set<subjectIRI>>
  #subjectClasses; // Map<subjectIRI, Set<classIRI>>
  #classPredicates; // Map<classIRI, Map<predicateIRI, Set<subjectIRI>>>
  #predicateCounts; // Map<predicateIRI, count>
  #predicateObjectTypes; // Map<predicateIRI, Map<classIRI, count>>
  #predicateDirections; // Map<"subj|pred|obj", count>
  #inversePredicates; // Map<"fromClass|predicate|toClass", inversePredicate>

  /**
   * The minimum ratio threshold to infer inverse relationships.
   * The processor treats predicates as inverses only when both the forward
   * ratio and the reverse ratio are >= this value.
   * Lower values are more permissive. They also risk false pairs.
   * @type {number}
   */
  #minInverseRatio = 0.8;

  /**
   * The maximum ratio threshold to infer inverse relationships.
   * The processor treats predicates as inverses only when both the forward
   * ratio and the reverse ratio are <= this value.
   * Higher values are more permissive. They also risk pairs of
   * relationships with very different cardinalities.
   * @type {number}
   */
  #maxInverseRatio = 1.25;

  /**
   * Predicates that are typically one-way references. They should NOT get
   * inverse paths. They represent semantic relationships that are
   * inherently directional (citations, mentions, references).
   * @type {Set<string>}
   */
  #oneWayPredicates = new Set([
    "https://schema.org/citation",
    "https://schema.org/mentions",
    "https://schema.org/about",
    "https://schema.org/isRelatedTo",
    "https://schema.org/references",
    "https://schema.org/sameAs",
    "https://schema.org/url",
  ]);

  /** Creates a new OntologyProcessor instance */
  constructor() {
    this.#classSubjects = new Map();
    this.#subjectClasses = new Map();
    this.#classPredicates = new Map();
    this.#predicateCounts = new Map();
    this.#predicateObjectTypes = new Map();
    this.#predicateDirections = new Map();
    this.#inversePredicates = new Map();
  }

  /**
   * Process a single RDF/JS quad
   * @param {import('rdf-js').Quad|any} quad - Quad that implements RDF/JS terms
   */
  process(quad) {
    if (!quad) return;
    const subject = quad.subject?.value;
    const predicate = quad.predicate?.value;
    if (!predicate || !subject) return;

    this.#incrementPredicate(predicate);

    const object = quad.object?.value;
    if (this.#isTypePredicate(predicate)) {
      if (object) this.#recordTypeAssertion(subject, object);
      return;
    }

    this.#recordPredicateForSubjectClasses(subject, predicate);
    this.#processObjectIfNamedNode(quad.object, predicate, subject);
  }

  /**
   * Processes the object node if it is a named node
   * @param {object} objectNode - RDF object node
   * @param {string} predicate - Predicate IRI
   * @param {string} subject - Subject IRI
   */
  #processObjectIfNamedNode(objectNode, predicate, subject) {
    if (objectNode?.termType !== "NamedNode" || !objectNode.value) return;
    this.#recordPredicateObjectType(predicate, objectNode.value);
    this.#recordInversePair(subject, predicate, objectNode.value);
  }

  /**
   * Increments the count for a predicate
   * @param {string} predicate - Predicate IRI
   */
  #incrementPredicate(predicate) {
    this.#predicateCounts.set(
      predicate,
      (this.#predicateCounts.get(predicate) || 0) + 1,
    );
  }

  /**
   * Determine if the predicate is rdf:type
   * @param {string} predicate - Predicate IRI
   * @returns {boolean} true if rdf:type
   * @private
   */
  #isTypePredicate(predicate) {
    return predicate === "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
  }

  /**
   * Records a type assertion for the subject and the object
   * @param {string} subject - Subject IRI
   * @param {string} object - Object IRI (class)
   */
  #recordTypeAssertion(subject, object) {
    if (!this.#classSubjects.has(object))
      this.#classSubjects.set(object, new Set());
    this.#classSubjects.get(object).add(subject);
    if (!this.#subjectClasses.has(subject))
      this.#subjectClasses.set(subject, new Set());
    this.#subjectClasses.get(subject).add(object);
  }

  /**
   * Records predicate usage for all classes of the subject
   * @param {string} subject - Subject IRI
   * @param {string} predicate - Predicate IRI
   */
  #recordPredicateForSubjectClasses(subject, predicate) {
    const classes = this.#subjectClasses.get(subject);
    if (!classes) return;
    for (const cls of classes) {
      if (!this.#classPredicates.has(cls))
        this.#classPredicates.set(cls, new Map());
      const predMap = this.#classPredicates.get(cls);
      if (!predMap.has(predicate)) {
        predMap.set(predicate, new Set());
      }
      predMap.get(predicate).add(subject);
    }
  }

  /**
   * Records object type information for a predicate
   * @param {string} predicate - Predicate IRI
   * @param {string} object - Object IRI
   */
  #recordPredicateObjectType(predicate, object) {
    const objectClasses = this.#subjectClasses.get(object);
    if (!objectClasses || objectClasses.size === 0) return;

    if (!this.#predicateObjectTypes.has(predicate)) {
      this.#predicateObjectTypes.set(predicate, new Map());
    }
    const typeMap = this.#predicateObjectTypes.get(predicate);
    for (const cls of objectClasses) {
      typeMap.set(cls, (typeMap.get(cls) || 0) + 1);
    }
  }

  /**
   * Records inverse relationship patterns between subjects and objects
   * @param {string} subject - Subject IRI
   * @param {string} predicate - Predicate IRI
   * @param {string} object - Object IRI
   */
  #recordInversePair(subject, predicate, object) {
    const subjectClasses = this.#subjectClasses.get(subject);
    const objectClasses = this.#subjectClasses.get(object);
    if (!subjectClasses || !objectClasses) return;
    for (const subjClass of subjectClasses) {
      for (const objClass of objectClasses) {
        const key = `${subjClass}|${predicate}|${objClass}`;
        this.#predicateDirections.set(
          key,
          (this.#predicateDirections.get(key) || 0) + 1,
        );
      }
    }
  }

  /**
   * Compute inverse predicates for all class-predicate-class relationships.
   * Call this after process() handles all quads.
   * Uses conservative heuristics to avoid false inverse pairs:
   * - Requires a high count match to infer a bidirectional relationship
   *   (see #minInverseRatio and #maxInverseRatio)
   * - Excludes known one-way reference predicates (citation, mentions,
   *   about, etc.)
   * - Detects and prevents circular contradictions (A↔B when A↔C already
   *   exists)
   * @private
   */
  #computeInversePredicates() {
    const assignedInverses = new Map(); // Track predicate → inverse to detect conflicts

    for (const [
      forwardKey,
      forwardCount,
    ] of this.#predicateDirections.entries()) {
      const [fromClass, predicate, toClass] = forwardKey.split("|");
      if (forwardCount === 0) continue;

      // Skip one-way reference predicates
      if (this.#oneWayPredicates.has(predicate)) continue;

      const bestInverse = this.#findBestInverse(
        forwardCount,
        toClass,
        fromClass,
        predicate,
      );

      if (bestInverse) {
        this.#assignInverseIfValid(
          forwardKey,
          predicate,
          bestInverse,
          assignedInverses,
        );
      }
    }
  }

  /**
   * Find the best inverse predicate for a forward relationship
   * @param {number} forwardCount - Count of forward relationships
   * @param {string} toClass - Target class IRI
   * @param {string} fromClass - Source class IRI
   * @param {string} predicate - Forward predicate IRI
   * @returns {string|null} Best inverse predicate or null
   * @private
   */
  #findBestInverse(forwardCount, toClass, fromClass, predicate) {
    let bestInverse = null;
    let bestScore = 0;

    for (const [key, count] of this.#predicateDirections.entries()) {
      const [subjClass, pred, objClass] = key.split("|");
      if (
        subjClass === toClass &&
        objClass === fromClass &&
        pred !== predicate
      ) {
        const matchRatio = count / forwardCount;
        if (
          count > bestScore &&
          matchRatio >= this.#minInverseRatio &&
          matchRatio <= this.#maxInverseRatio
        ) {
          // Also check the reverse ratio to make sure the pair is symmetric
          const reverseKey = `${subjClass}|${pred}|${objClass}`;
          const reverseCount = this.#predicateDirections.get(reverseKey) || 0;
          const reverseRatio = forwardCount / reverseCount;

          if (
            reverseRatio >= this.#minInverseRatio &&
            reverseRatio <= this.#maxInverseRatio
          ) {
            bestScore = count;
            bestInverse = pred;
          }
        }
      }
    }

    return bestInverse;
  }

  /**
   * Assign the inverse predicate if it does not create conflicts
   * @param {string} forwardKey - Forward relationship key
   * @param {string} predicate - Forward predicate IRI
   * @param {string} inverse - Inverse predicate IRI
   * @param {Map<string, string>} assignedInverses - Map of assigned inverses
   * @private
   */
  #assignInverseIfValid(forwardKey, predicate, inverse, assignedInverses) {
    const existingInverse = assignedInverses.get(predicate);
    const reverseExistingInverse = assignedInverses.get(inverse);

    if (!existingInverse && !reverseExistingInverse) {
      // Safe to assign because there are no conflicts
      this.#inversePredicates.set(forwardKey, inverse);
      assignedInverses.set(predicate, inverse);
      assignedInverses.set(inverse, predicate);
    } else if (
      existingInverse === inverse &&
      reverseExistingInverse === predicate
    ) {
      // Already paired correctly in both directions. Safe to assign.
      this.#inversePredicates.set(forwardKey, inverse);
    }
    // else: a conflict exists. Skip this pair to avoid contradictions.
  }

  /**
   * Returns a read-only view of the collected ontology statistics.
   * You MUST call this after the processor handles all quads.
   * WARNING: Do not mutate the returned Maps or Sets. The processor shares
   * these internal data structures for performance. Only the serializer in
   * the same package should use this method.
   * @returns {import('./serializer.js').OntologyData} Ontology data snapshot
   * with class subjects, predicates, and inverse relationships
   */
  getData() {
    // Compute the inverse predicates once before this method returns the data
    this.#computeInversePredicates();

    return {
      classSubjects: this.#classSubjects,
      subjectClasses: this.#subjectClasses,
      classPredicates: this.#classPredicates,
      predicateCounts: this.#predicateCounts,
      predicateObjectTypes: this.#predicateObjectTypes,
      inversePredicates: this.#inversePredicates,
    };
  }
}
