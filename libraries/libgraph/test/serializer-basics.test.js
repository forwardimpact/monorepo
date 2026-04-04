import { test, describe } from "node:test";
import assert from "node:assert";

import { ShaclSerializer } from "../serializer.js";

describe("ShaclSerializer - basics", () => {
  let serializer;

  describe("constructor", () => {
    test("creates ShaclSerializer instance", () => {
      serializer = new ShaclSerializer();
      assert.ok(serializer instanceof ShaclSerializer);
    });
  });

  describe("serialize - validation and empty data", () => {
    test("throws error for null ontologyData", () => {
      serializer = new ShaclSerializer();
      assert.throws(() => {
        serializer.serialize(null);
      }, /ontologyData is required/);
    });

    test("throws error for undefined ontologyData", () => {
      serializer = new ShaclSerializer();
      assert.throws(() => {
        serializer.serialize(undefined);
      }, /ontologyData is required/);
    });

    test("produces empty Turtle for empty data", () => {
      serializer = new ShaclSerializer();
      const emptyData = {
        classSubjects: new Map(),
        subjectClasses: new Map(),
        classPredicates: new Map(),
        predicateCounts: new Map(),
        predicateObjectTypes: new Map(),
        inversePredicates: new Map(),
      };

      const output = serializer.serialize(emptyData);
      assert.ok(typeof output === "string");
      assert.ok(output.includes("@prefix"));
    });

    test("produces valid SHACL Turtle with single class", () => {
      serializer = new ShaclSerializer();
      const data = {
        classSubjects: new Map([
          [
            "https://schema.org/Person",
            new Set(["http://example.org/person1"]),
          ],
        ]),
        subjectClasses: new Map([
          [
            "http://example.org/person1",
            new Set(["https://schema.org/Person"]),
          ],
        ]),
        classPredicates: new Map(),
        predicateCounts: new Map(),
        predicateObjectTypes: new Map(),
        inversePredicates: new Map(),
      };

      const output = serializer.serialize(data);

      assert.ok(output.includes("@prefix sh:"));
      assert.ok(output.includes("@prefix schema:"));
      assert.ok(
        output.includes("schema:PersonShape") ||
          output.includes("https://schema.org/PersonShape"),
      );
      assert.ok(output.includes("sh:NodeShape"));
      assert.ok(output.includes("sh:targetClass"));
      assert.ok(
        output.includes("schema:Person") ||
          output.includes("https://schema.org/Person"),
      );
    });

    test("includes property shapes for predicates", () => {
      serializer = new ShaclSerializer();
      const data = {
        classSubjects: new Map([
          [
            "https://schema.org/Person",
            new Set(["http://example.org/person1"]),
          ],
        ]),
        subjectClasses: new Map([
          [
            "http://example.org/person1",
            new Set(["https://schema.org/Person"]),
          ],
        ]),
        classPredicates: new Map([
          [
            "https://schema.org/Person",
            new Map([
              [
                "https://schema.org/name",
                new Set(["http://example.org/person1"]),
              ],
            ]),
          ],
        ]),
        predicateCounts: new Map([["https://schema.org/name", 1]]),
        predicateObjectTypes: new Map(),
        inversePredicates: new Map(),
      };

      const output = serializer.serialize(data);

      assert.ok(output.includes("sh:property"));
      assert.ok(output.includes("sh:path"));
      assert.ok(
        output.includes("schema:name") ||
          output.includes("https://schema.org/name"),
      );
    });

    test("handles missing predicate map gracefully", () => {
      serializer = new ShaclSerializer();
      const data = {
        classSubjects: new Map([
          [
            "https://schema.org/Person",
            new Set(["http://example.org/person1"]),
          ],
        ]),
        subjectClasses: new Map(),
        classPredicates: new Map(),
        predicateCounts: new Map(),
        predicateObjectTypes: new Map(),
        inversePredicates: new Map(),
      };

      const output = serializer.serialize(data);

      assert.ok(
        output.includes("schema:PersonShape") ||
          output.includes("https://schema.org/PersonShape"),
      );
      assert.ok(output.includes("sh:targetClass"));
    });
  });
});
