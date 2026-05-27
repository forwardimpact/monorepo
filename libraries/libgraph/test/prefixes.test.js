import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import { Store, DataFactory } from "n3";

import { GraphIndex } from "../src/index/graph.js";
import { RDF_PREFIXES } from "../src/index.js";
import { resource } from "@forwardimpact/libtype";
import { createMockStorage } from "@forwardimpact/libmock";

const { namedNode } = DataFactory;

describe("RDF_PREFIXES", () => {
  test("registers the fit: vocabulary prefix", () => {
    assert.strictEqual(
      RDF_PREFIXES.fit,
      "https://www.forwardimpact.team/schema/rdf/",
    );
  });

  test("preserves the existing schema, rdf, rdfs, foaf, and ex prefixes", () => {
    assert.strictEqual(RDF_PREFIXES.schema, "https://schema.org/");
    assert.strictEqual(
      RDF_PREFIXES.rdf,
      "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    );
    assert.strictEqual(
      RDF_PREFIXES.rdfs,
      "http://www.w3.org/2000/01/rdf-schema#",
    );
    assert.strictEqual(RDF_PREFIXES.foaf, "http://xmlns.com/foaf/0.1/");
    assert.strictEqual(RDF_PREFIXES.ex, "https://example.invalid/");
  });
});

describe("GraphIndex prefix resolution", () => {
  let graphIndex;
  let mockStorage;
  let n3Store;

  beforeEach(() => {
    // The default mock storage rejects on missing keys; #getTypesWithSynonyms
    // calls storage.get("ontology.ttl") and any rejection bubbles up.  We
    // don't need ontology synonyms here, so return an empty string instead.
    mockStorage = createMockStorage({
      get: (key) => {
        if (key === "ontology.ttl") return Promise.resolve("");
        return Promise.reject(new Error("Not found"));
      },
    });
    n3Store = new Store();
    graphIndex = new GraphIndex(
      mockStorage,
      n3Store,
      RDF_PREFIXES,
      "test.jsonl",
    );
  });

  test("getSubjects('fit:Skill') resolves the fit: prefix to a named node", async () => {
    const subjectIri = "https://www.forwardimpact.team/schema/rdf/skill/test";
    const skillType = "https://www.forwardimpact.team/schema/rdf/Skill";

    const quads = [
      {
        subject: namedNode(subjectIri),
        predicate: namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"),
        object: namedNode(skillType),
      },
    ];

    await graphIndex.add(
      resource.Identifier.fromObject({
        type: "fit.Skill",
        name: "test",
      }),
      quads,
    );

    const subjects = await graphIndex.getSubjects("fit:Skill");

    assert.strictEqual(subjects.size, 1);
    assert.strictEqual(subjects.get(subjectIri), skillType);
  });

  test("getSubjects('schema:Person') still resolves correctly (no regression)", async () => {
    const subjectIri = "https://example.org/person/alice";
    const personType = "https://schema.org/Person";

    const quads = [
      {
        subject: namedNode(subjectIri),
        predicate: namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"),
        object: namedNode(personType),
      },
    ];

    await graphIndex.add(
      resource.Identifier.fromObject({
        type: "schema.Person",
        name: "alice",
      }),
      quads,
    );

    const subjects = await graphIndex.getSubjects("schema:Person");

    assert.strictEqual(subjects.size, 1);
    assert.strictEqual(subjects.get(subjectIri), personType);
  });
});
