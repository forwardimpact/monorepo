import { resource } from "@forwardimpact/libtype";
import { IndexBase } from "@forwardimpact/libindex";

/**
 * VectorIndex class for managing vector data with lazy loading
 * @implements {import("@forwardimpact/libindex").IndexInterface}
 */
export class VectorIndex extends IndexBase {
  /**
   * Adds a vector item to the index
   * @param {resource.Identifier} identifier - Resource identifier
   * @param {number[]} vector - The vector
   * @returns {Promise<void>}
   */
  async add(identifier, vector) {
    const item = {
      id: String(identifier),
      identifier,
      vector,
    };

    await super.add(item);
  }

  /**
   * Queries items from this vector index using cosine similarity
   * @param {number[][]} vectors - Query vectors
   * @param {import("@forwardimpact/libtype").tool.QueryFilter} filter - Filter object for query constraints
   * @returns {Promise<resource.Identifier[]>} Array of resource identifiers sorted by score
   */
  async queryItems(vectors, filter = {}) {
    if (!this.loaded) await this.loadData();

    const { threshold = 0, limit = 0, prefix, max_tokens } = filter;
    const scores = new Map();

    for (const item of this.index.values()) {
      if (!this._applyPrefixFilter(item.id, prefix)) continue;
      for (const vector of vectors) {
        const score = calculateDotProduct(vector, item.vector, vector.length);
        if (score < threshold) continue;
        const existing = scores.get(item.id);
        if (existing === undefined || score > existing) {
          scores.set(item.id, score);
        }
      }
    }

    const identifiers = [];
    for (const [id, score] of scores) {
      const item = this.index.get(id);
      item.identifier.score = score;
      identifiers.push(resource.Identifier.fromObject(item.identifier));
    }

    identifiers.sort((a, b) => b.score - a.score);

    let results = this._applyLimitFilter(identifiers, limit);
    results = this._applyTokensFilter(results, max_tokens);

    return results;
  }
}

/**
 * Dot product calculation with loop unrolling (cosine similarity for normalized vectors)
 * @param {number[]} a - First vector
 * @param {number[]} b - Second vector
 * @param {number} [length] - Length of vectors (defaults to a.length)
 * @returns {number} The dot product of the two vectors
 */
export function calculateDotProduct(a, b, length = a.length) {
  let dotProduct = 0;
  let i = 0;

  for (; i < length - 7; i += 8) {
    dotProduct +=
      a[i] * b[i] +
      a[i + 1] * b[i + 1] +
      a[i + 2] * b[i + 2] +
      a[i + 3] * b[i + 3] +
      a[i + 4] * b[i + 4] +
      a[i + 5] * b[i + 5] +
      a[i + 6] * b[i + 6] +
      a[i + 7] * b[i + 7];
  }

  for (; i < length; i++) {
    dotProduct += a[i] * b[i];
  }

  return dotProduct;
}
