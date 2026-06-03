import { IndexBase } from "../src/index.js";

/** Minimal concrete IndexBase subclass used across the sibling suites. */
export class TestIndex extends IndexBase {
  /**
   * @param {object} storage
   * @param {string} [indexKey]
   */
  constructor(storage, indexKey = "test.jsonl") {
    super(storage, indexKey);
  }

  /**
   * Wrap an identifier + data into an index item and store it.
   * @param {object} identifier
   * @param {unknown} data
   */
  async add(identifier, data) {
    const item = {
      id: String(identifier),
      identifier,
      data,
    };

    await super.add(item);
  }
}
