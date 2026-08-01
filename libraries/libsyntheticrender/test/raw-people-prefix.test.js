import { describe, test } from "node:test";
import assert from "node:assert";
import { renderRawDocuments } from "@forwardimpact/libsyntheticrender/render/raw";

/**
 * Regression: renderPeopleYAML wrote individual person profiles under the
 * `people/` storage prefix. That collided with the roster uploads that
 * `transformPeople` reads from the same prefix. The collision made
 * `activity seed` pick a profile instead of the roster and import zero people.
 *
 * Fix: person profiles now use the `profiles/` prefix. The `people/` prefix
 * now serves only the roster uploads that the transform pipeline consumes.
 */

const MINIMAL_ENTITIES = {
  people: [
    {
      id: "person_1",
      name: "A",
      email: "a@x",
      github: "a",
      iri: "urn:a",
      discipline: "se",
      level: "J040",
      team_id: "team_1",
      department: "dept_1",
      hire_date: "2025-01-01",
      is_manager: false,
    },
  ],
  teams: [{ id: "team_1", name: "Alpha", department: "dept_1" }],
  departments: [{ id: "dept_1", name: "Eng" }],
  activity: {},
};

describe("people prefix in the raw renderer", () => {
  test("person profiles use the profiles/ prefix instead of people/", () => {
    const files = renderRawDocuments(MINIMAL_ENTITIES);
    const peoplePaths = [...files.keys()].filter((k) =>
      k.startsWith("people/"),
    );
    const profilePaths = [...files.keys()].filter((k) =>
      k.startsWith("profiles/"),
    );

    assert.strictEqual(
      peoplePaths.length,
      0,
      `expected no files under people/ but found: ${peoplePaths.join(", ")}`,
    );
    assert.ok(
      profilePaths.length > 0,
      "expected at least one file under profiles/",
    );
    assert.ok(
      profilePaths.some((p) => p === "profiles/person_1.yaml"),
      "expected profiles/person_1.yaml",
    );
    assert.ok(
      profilePaths.some((p) => p === "profiles/index.json"),
      "expected profiles/index.json",
    );
  });
});
