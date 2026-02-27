import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import { JSDOM } from "jsdom";

import { toType, toIdentifier, ResourceIndex } from "../index.js";
import { sanitizeDom } from "../sanitizer.js";
import { common, resource } from "@forwardimpact/libtype";

/**
 * Creates a mock storage implementation for testing
 * @returns {object} Mock storage instance
 */
function createMockStorage() {
  const data = new Map();

  return {
    async put(key, value) {
      data.set(key, value);
    },

    async get(key) {
      const value = data.get(key);
      if (!value) throw new Error(`Key not found: ${key}`);

      // Simulate automatic JSON parsing for .json files
      if (key.endsWith(".json") && typeof value === "string") {
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      }

      return value;
    },

    async getMany(keys) {
      const results = {};
      for (const key of keys) {
        try {
          const value = data.get(key);
          if (value) {
            // Simulate automatic JSON parsing for .json files
            if (key.endsWith(".json") && typeof value === "string") {
              try {
                results[key] = JSON.parse(value);
              } catch {
                results[key] = value;
              }
            } else {
              results[key] = value;
            }
          }
        } catch {
          // Skip keys that don't exist
        }
      }
      return results;
    },

    async list() {
      return Array.from(data.keys());
    },

    async findByPrefix(prefix) {
      return Array.from(data.keys()).filter((key) => key.startsWith(prefix));
    },

    async exists(key) {
      return data.has(key);
    },
  };
}

/**
 * Creates a mock policy implementation for testing
 * @returns {object} Mock policy instance
 */
function createMockPolicy() {
  return {
    async evaluate(_input) {
      // Allow all access for testing
      return true;
    },
  };
}

describe("ResourceIndex", () => {
  let resourceIndex;
  let mockStorage;
  let mockPolicy;

  beforeEach(() => {
    mockStorage = createMockStorage();
    mockPolicy = createMockPolicy();
    resourceIndex = new ResourceIndex(mockStorage, mockPolicy);
  });

  test("creates ResourceIndex with required dependencies", () => {
    assert.ok(resourceIndex instanceof ResourceIndex);
  });

  test("throws error when storage is missing", () => {
    assert.throws(() => new ResourceIndex(null, mockPolicy), {
      message: "storage is required",
    });
  });

  test("throws error when policy is missing", () => {
    assert.throws(() => new ResourceIndex(mockStorage, null), {
      message: "policy is required",
    });
  });

  test("has() returns true when resource exists", async () => {
    const message = new common.Message({
      role: "system",
      content: { text: "Test message" },
    });

    await resourceIndex.put(message);
    const exists = await resourceIndex.has(message.id);

    assert.strictEqual(exists, true);
  });

  test("has() returns false when resource does not exist", async () => {
    const exists = await resourceIndex.has("nonexistent-id");

    assert.strictEqual(exists, false);
  });

  test("puts resource content with identifier generation", async () => {
    const message = new common.Message({
      role: "system",
      content: { text: "Test message content" },
    });

    await resourceIndex.put(message);

    // Verify descriptor was generated
    assert.ok(message.id instanceof resource.Identifier);
    assert.strictEqual(message.id.type, "common.Message");
    // Should generate a UUID
    assert.strictEqual(message.id.name.length, 36);
  });

  test("gets resource contents by IDs with access control", async () => {
    // First, put a resource
    const message = new common.Message({
      role: "system",
      content: "Test message for retrieval",
    });

    await resourceIndex.put(message);
    const resourceId = message.id;

    // Then get it back
    const retrieved = await resourceIndex.get([resourceId], "test-actor");

    assert.strictEqual(retrieved.length, 1);
    assert.strictEqual(retrieved[0].role, "system");
    assert.strictEqual(
      String(retrieved[0].content),
      "Test message for retrieval",
    );
    assert.ok(retrieved[0].id instanceof resource.Identifier);
    assert.strictEqual(retrieved[0].id.type, "common.Message");
    // Hash will be different with string content
    assert.ok(retrieved[0].id.name);
  });

  test("returns empty array when passed null identifiers", async () => {
    const retrieved = await resourceIndex.get(null, "test-actor");
    assert.strictEqual(retrieved.length, 0);
    assert.ok(Array.isArray(retrieved));
  });

  test("returns empty array when passed undefined identifiers", async () => {
    const retrieved = await resourceIndex.get(undefined, "test-actor");
    assert.strictEqual(retrieved.length, 0);
    assert.ok(Array.isArray(retrieved));
  });

  test("finds all resource identifiers", async () => {
    // Put some test resources
    const message1 = new common.Message({
      role: "system",
      content: { text: "First test message" },
    });

    await resourceIndex.put(message1);

    // Find all identifiers
    const identifiers = await resourceIndex.findAll();

    assert.strictEqual(identifiers.length, 1);
    assert.ok(identifiers[0] instanceof resource.Identifier);
    assert.strictEqual(identifiers[0].type, "common.Message");
  });

  test("finds resource identifiers by prefix", async () => {
    // Put some test resources
    const message1 = new common.Message({
      role: "system",
      content: { text: "First test message" },
    });

    await resourceIndex.put(message1);

    // Use a full URI prefix that should match
    const identifiers = await resourceIndex.findByPrefix("common.Message");

    assert.ok(identifiers.length >= 1);
    assert.ok(identifiers[0] instanceof resource.Identifier);
    assert.strictEqual(identifiers[0].type, "common.Message");
  });
});

describe("toIdentifier helper function", () => {
  test("toIdentifier correctly creates Identifier from resource URI", () => {
    const uri = "common.Message.abc123";
    const identifier = toIdentifier(uri);

    assert.ok(identifier instanceof resource.Identifier);
    assert.strictEqual(identifier.type, "common.Message");
    assert.strictEqual(identifier.name, "abc123");
    assert.strictEqual(identifier.parent, "");
  });

  test("toIdentifier correctly handles URI with parent path", () => {
    const uri = "parent/child/common.Message.abc123";
    const identifier = toIdentifier(uri);

    assert.ok(identifier instanceof resource.Identifier);
    assert.strictEqual(identifier.type, "common.Message");
    assert.strictEqual(identifier.name, "abc123");
    assert.strictEqual(identifier.parent, "parent/child");
  });

  test("toIdentifier is reverse of Identifier.toString() - simple case", () => {
    const original = new resource.Identifier({
      type: "common.Message",
      name: "abc123",
      parent: "",
    });

    const uri = original.toString();
    const reconstructed = toIdentifier(uri);

    assert.strictEqual(reconstructed.type, original.type);
    assert.strictEqual(reconstructed.name, original.name);
    assert.strictEqual(reconstructed.parent, original.parent);
  });

  test("toIdentifier is reverse of Identifier.toString() - with parent", () => {
    const original = new resource.Identifier({
      type: "common.Message",
      name: "abc123",
      parent: "parent.Resource.def456",
    });

    const uri = original.toString();
    const reconstructed = toIdentifier(uri);

    assert.strictEqual(reconstructed.type, original.type);
    assert.strictEqual(reconstructed.name, original.name);
    assert.strictEqual(reconstructed.parent, original.parent);
  });
});

describe("toType helper function", () => {
  test("toType correctly creates type based on identifier", () => {
    const object = {
      id: {
        type: "common.Message",
      },
      role: "user",
      content: { text: "Hello, world!" },
    };

    const message = toType(object);
    assert.ok(message instanceof common.Message);
    assert.ok(message.id instanceof resource.Identifier);
  });

  test("toType throws an error on invalid types", () => {
    const object = {
      id: {
        type: "invalid.Type",
      },
      role: "user",
      content: { text: "Hello, world!" },
    };

    assert.throws(
      () => {
        toType(object);
      },
      {
        message: "Unknown type: invalid.Type",
      },
    );
  });
});

describe("sanitizeDom patterns", () => {
  test("encodes angle-number and stray ampersand; preserves existing &amp; entity and unknown entity", () => {
    const html = `<!DOCTYPE html><div>Value <5 and >10 plus R&D &amp; already encoded &unknown; end</div>`;
    const dom = new JSDOM(html);
    sanitizeDom(dom);
    const text = dom.window.document.querySelector("div").textContent;
    const expected =
      "Value &lt;5 and &gt;10 plus R&amp;D &amp; already encoded &unknown; end";
    assert.strictEqual(text, expected);
  });

  test("normalizes smart quotes and nbsp characters", () => {
    const html = `<!DOCTYPE html><p>“Quoted” ‘text’ and&nbsp;space</p>`;
    const dom = new JSDOM(html.replace(/&nbsp;/g, "\u00A0"));
    sanitizeDom(dom);
    const text = dom.window.document.querySelector("p").textContent;
    assert.strictEqual(text, '"Quoted" \u0027text\u0027 and space');
    // Ensure no smart quotes remain
    assert.doesNotMatch(text, /[“”‘’]/);
  });
});
