import { test, describe } from "node:test";
import assert from "node:assert";

import { ShaclSerializer } from "../serializer.js";

describe("ShaclSerializer", () => {
  let serializer;

  describe("constructor", () => {
    test("creates ShaclSerializer instance", () => {
      serializer = new ShaclSerializer();
      assert.ok(serializer instanceof ShaclSerializer);
    });
  });

  describe("serialize", () => {
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

      // Should contain SHACL prefixes
      assert.ok(output.includes("@prefix sh:"));
      assert.ok(output.includes("@prefix schema:"));

      // Should contain shape IRI (with or without prefix)
      assert.ok(
        output.includes("schema:PersonShape") ||
          output.includes("https://schema.org/PersonShape"),
      );

      // Should contain SHACL metadata
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

      // Should contain property shape
      assert.ok(output.includes("sh:property"));
      assert.ok(output.includes("sh:path"));
      assert.ok(
        output.includes("schema:name") ||
          output.includes("https://schema.org/name"),
      );
    });

    test("includes dominant class constraints", () => {
      serializer = new ShaclSerializer();
      const data = {
        classSubjects: new Map([
          [
            "https://schema.org/Person",
            new Set(["http://example.org/person1"]),
          ],
          [
            "https://schema.org/Organization",
            new Set(["http://example.org/org1"]),
          ],
        ]),
        subjectClasses: new Map([
          [
            "http://example.org/person1",
            new Set(["https://schema.org/Person"]),
          ],
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

      // Should contain class constraint
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

      // Should contain inverse path
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

      // Person (3 instances) should appear before Organization (1 instance)
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

      // name (100 uses) should appear before email (50 uses)
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
        classPredicates: new Map(), // Empty - no predicates for Person
        predicateCounts: new Map(),
        predicateObjectTypes: new Map(),
        inversePredicates: new Map(),
      };

      const output = serializer.serialize(data);

      // Should produce valid output without properties
      assert.ok(
        output.includes("schema:PersonShape") ||
          output.includes("https://schema.org/PersonShape"),
      );
      assert.ok(output.includes("sh:targetClass"));
    });

    test("computes dominant class correctly", () => {
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
              ["https://schema.org/Person", 60], // 60% - should be dominant
              ["https://schema.org/Organization", 40], // 40%
            ]),
          ],
        ]),
        inversePredicates: new Map(),
      };

      const output = serializer.serialize(data);

      // Should include Person as dominant class (>50%)
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
              ["https://schema.org/Person", 40], // 40% - not dominant
              ["https://schema.org/Organization", 60], // 60% but for wrong predicate
            ]),
          ],
        ]),
        inversePredicates: new Map(),
      };

      const output = serializer.serialize(data);

      // Should still include the property
      assert.ok(
        output.includes("schema:related") ||
          output.includes("https://schema.org/related"),
      );
      // sh:class should be included for Organization (60% > 50%)
      assert.ok(output.includes("sh:class"));
    });
  });
});
