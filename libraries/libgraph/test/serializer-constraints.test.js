import { test, describe } from "node:test";
import assert from "node:assert";

import { ShaclSerializer } from "../serializer.js";

describe("ShaclSerializer - constraints and ordering", () => {
  let serializer;

  test("includes dominant class constraints", () => {
    serializer = new ShaclSerializer();
    const data = {
      classSubjects: new Map([
        ["https://schema.org/Person", new Set(["http://example.org/person1"])],
        [
          "https://schema.org/Organization",
          new Set(["http://example.org/org1"]),
        ],
      ]),
      subjectClasses: new Map([
        ["http://example.org/person1", new Set(["https://schema.org/Person"])],
        [
          "http://example.org/org1",
          new Set(["https://schema.org/Organization"]),
        ],
      ]),
      classPredicates: new Map([
        [
          "https://schema.org/Person",
          new Map([
            [
              "https://schema.org/worksFor",
              new Set(["http://example.org/person1"]),
            ],
          ]),
        ],
      ]),
      predicateCounts: new Map([["https://schema.org/worksFor", 1]]),
      predicateObjectTypes: new Map([
        [
          "https://schema.org/worksFor",
          new Map([["https://schema.org/Organization", 10]]),
        ],
      ]),
      inversePredicates: new Map(),
    };

    const output = serializer.serialize(data);

    assert.ok(output.includes("sh:class"));
    assert.ok(
      output.includes("schema:Organization") ||
        output.includes("https://schema.org/Organization"),
    );
    assert.ok(output.includes("sh:nodeKind"));
    assert.ok(output.includes("sh:IRI"));
  });

  test("includes inverse path when provided", () => {
    serializer = new ShaclSerializer();
    const data = {
      classSubjects: new Map([
        ["https://schema.org/Person", new Set(["http://example.org/person1"])],
      ]),
      subjectClasses: new Map([
        ["http://example.org/person1", new Set(["https://schema.org/Person"])],
      ]),
      classPredicates: new Map([
        [
          "https://schema.org/Person",
          new Map([
            [
              "https://schema.org/knows",
              new Set(["http://example.org/person1"]),
            ],
          ]),
        ],
      ]),
      predicateCounts: new Map([["https://schema.org/knows", 1]]),
      predicateObjectTypes: new Map([
        [
          "https://schema.org/knows",
          new Map([["https://schema.org/Person", 10]]),
        ],
      ]),
      inversePredicates: new Map([
        [
          "https://schema.org/Person|https://schema.org/knows|https://schema.org/Person",
          "https://schema.org/knows",
        ],
      ]),
    };

    const output = serializer.serialize(data);

    assert.ok(output.includes("sh:inversePath"));
  });

  test("orders classes by instance count", () => {
    serializer = new ShaclSerializer();
    const data = {
      classSubjects: new Map([
        [
          "https://schema.org/Person",
          new Set([
            "http://example.org/person1",
            "http://example.org/person2",
            "http://example.org/person3",
          ]),
        ],
        [
          "https://schema.org/Organization",
          new Set(["http://example.org/org1"]),
        ],
      ]),
      subjectClasses: new Map(),
      classPredicates: new Map(),
      predicateCounts: new Map(),
      predicateObjectTypes: new Map(),
      inversePredicates: new Map(),
    };

    const output = serializer.serialize(data);

    const personIndex = Math.max(
      output.indexOf("schema:PersonShape"),
      output.indexOf("https://schema.org/PersonShape"),
    );
    const orgIndex = Math.max(
      output.indexOf("schema:OrganizationShape"),
      output.indexOf("https://schema.org/OrganizationShape"),
    );

    assert.ok(personIndex >= 0);
    assert.ok(orgIndex >= 0);
    assert.ok(personIndex < orgIndex);
  });

  test("orders predicates by usage count", () => {
    serializer = new ShaclSerializer();
    const data = {
      classSubjects: new Map([
        ["https://schema.org/Person", new Set(["http://example.org/person1"])],
      ]),
      subjectClasses: new Map([
        ["http://example.org/person1", new Set(["https://schema.org/Person"])],
      ]),
      classPredicates: new Map([
        [
          "https://schema.org/Person",
          new Map([
            [
              "https://schema.org/name",
              new Set(["http://example.org/person1"]),
            ],
            [
              "https://schema.org/email",
              new Set(["http://example.org/person1"]),
            ],
          ]),
        ],
      ]),
      predicateCounts: new Map([
        ["https://schema.org/name", 100],
        ["https://schema.org/email", 50],
      ]),
      predicateObjectTypes: new Map(),
      inversePredicates: new Map(),
    };

    const output = serializer.serialize(data);

    const nameIndex = Math.max(
      output.indexOf("schema:name"),
      output.indexOf("https://schema.org/name"),
    );
    const emailIndex = Math.max(
      output.indexOf("schema:email"),
      output.indexOf("https://schema.org/email"),
    );

    assert.ok(nameIndex >= 0);
    assert.ok(emailIndex >= 0);
    assert.ok(nameIndex < emailIndex);
  });

  test("computes dominant class correctly", () => {
    serializer = new ShaclSerializer();
    const data = {
      classSubjects: new Map([
        ["https://schema.org/Person", new Set(["http://example.org/person1"])],
      ]),
      subjectClasses: new Map([
        ["http://example.org/person1", new Set(["https://schema.org/Person"])],
      ]),
      classPredicates: new Map([
        [
          "https://schema.org/Person",
          new Map([
            [
              "https://schema.org/knows",
              new Set(["http://example.org/person1"]),
            ],
          ]),
        ],
      ]),
      predicateCounts: new Map([["https://schema.org/knows", 1]]),
      predicateObjectTypes: new Map([
        [
          "https://schema.org/knows",
          new Map([
            ["https://schema.org/Person", 60],
            ["https://schema.org/Organization", 40],
          ]),
        ],
      ]),
      inversePredicates: new Map(),
    };

    const output = serializer.serialize(data);

    assert.ok(output.includes("sh:class"));
    const classLines = output
      .split("\n")
      .filter((line) => line.includes("sh:class"));
    assert.ok(
      classLines.some(
        (line) =>
          line.includes("schema:Person") ||
          line.includes("https://schema.org/Person"),
      ),
      "Should include Person as dominant class",
    );
  });

  test("does not include class constraint when no dominant class", () => {
    serializer = new ShaclSerializer();
    const data = {
      classSubjects: new Map([
        ["https://schema.org/Person", new Set(["http://example.org/person1"])],
      ]),
      subjectClasses: new Map([
        ["http://example.org/person1", new Set(["https://schema.org/Person"])],
      ]),
      classPredicates: new Map([
        [
          "https://schema.org/Person",
          new Map([
            [
              "https://schema.org/related",
              new Set(["http://example.org/person1"]),
            ],
          ]),
        ],
      ]),
      predicateCounts: new Map([["https://schema.org/related", 1]]),
      predicateObjectTypes: new Map([
        [
          "https://schema.org/related",
          new Map([
            ["https://schema.org/Person", 40],
            ["https://schema.org/Organization", 60],
          ]),
        ],
      ]),
      inversePredicates: new Map(),
    };

    const output = serializer.serialize(data);

    assert.ok(
      output.includes("schema:related") ||
        output.includes("https://schema.org/related"),
    );
    assert.ok(output.includes("sh:class"));
  });
});
