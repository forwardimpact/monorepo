import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { Window } from "happy-dom";

import { createJsonLdScript } from "../src/json-ld-script.js";
import { freezeInvocationContext } from "../src/invocation-context.js";

let win;
const savedDocument = globalThis.document;

beforeEach(() => {
  win = new Window({ url: "http://localhost/" });
  globalThis.document = win.document;
});

afterEach(() => {
  globalThis.document = savedDocument;
});

describe("createJsonLdScript", () => {
  test("returns null when graphFormatter is absent", () => {
    const ctx = freezeInvocationContext({
      data: {},
      args: { id: "testing" },
      options: {},
    });
    const result = createJsonLdScript(
      undefined,
      ctx,
      {},
      {
        vocabularyBase: "https://example.invalid/schema/rdf/",
      },
    );
    assert.strictEqual(result, null);
  });

  test("returns a script element with correct type and content", () => {
    const ctx = freezeInvocationContext({
      data: {},
      args: { id: "testing" },
      options: {},
    });
    const graphFormatter = (c, base) => `${base}Skill/${c.args.id}`;
    const body = { "@type": "Skill", name: "Testing" };

    const script = createJsonLdScript(graphFormatter, ctx, body, {
      vocabularyBase: "https://example.invalid/schema/rdf/",
    });

    assert.strictEqual(script.type, "application/ld+json");

    const parsed = JSON.parse(script.textContent);
    assert.strictEqual(
      parsed["@id"],
      "https://example.invalid/schema/rdf/Skill/testing",
    );
    assert.strictEqual(
      parsed["@context"],
      "https://example.invalid/schema/rdf/",
    );
    assert.strictEqual(parsed["@type"], "Skill");
    assert.strictEqual(parsed.name, "Testing");
  });

  test("body fields are merged into the payload", () => {
    const ctx = freezeInvocationContext({
      data: {},
      args: { id: "clarity" },
      options: {},
    });
    const graphFormatter = (c, base) => `${base}Behaviour/${c.args.id}`;
    const body = {
      "@type": "Behaviour",
      name: "Clarity of thought",
      description: "Thinks clearly",
    };

    const script = createJsonLdScript(graphFormatter, ctx, body, {
      vocabularyBase: "https://example.invalid/schema/rdf/",
    });

    const parsed = JSON.parse(script.textContent);
    assert.strictEqual(parsed.name, "Clarity of thought");
    assert.strictEqual(parsed.description, "Thinks clearly");
  });
});
