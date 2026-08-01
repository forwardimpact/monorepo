import { IndexBase } from "../src/index.js";

/** The sibling suites share this minimal concrete IndexBase subclass. */
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
