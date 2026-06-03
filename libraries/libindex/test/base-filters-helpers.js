import { IndexBase } from "../src/index.js";

/** Minimal concrete IndexBase subclass used across the sibling suites. */
export class TestIndex extends IndexBase {
  constructor(storage, indexKey = "test.jsonl") {
    super(storage, indexKey);
  }

  async add(identifier, data) {
    const item = {
      id: String(identifier),
      identifier,
      data,
    };

    await super.add(item);
  }
}
