import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { buildEntities } from "@forwardimpact/libsyntheticgen/engine/entities";
import { createSeededRNG } from "@forwardimpact/libsyntheticgen/rng";

/**
 * These tests check that entity IRIs from entities.js now use the
 * /id/{type}/{id} format consistently. The enricher's stripOffDomainIris
 * preserves that format.
 */

describe("enricher IRI compatibility", () => {
  const minimalAst = {
    domain: "test.example",
    orgs: [{ id: "testorg", name: "TestOrg" }],
    departments: [{ id: "eng", name: "Engineering", org: "testorg" }],
    teams: [{ id: "team1", department: "eng", repos: [] }],
    people: { count: 2, distribution: { L3: 1 }, disciplines: { se: 1 } },
    projects: [
      {
        id: "proj1",
        type: "drug",
        teams: ["team1"],
        prose_topic: "test",
        prose_tone: "formal",
      },
    ],
  };

  test("all entity IRIs contain /id/ prefix", () => {
    const rng = createSeededRNG(42);
    const entities = buildEntities(minimalAst, rng);

    for (const org of entities.orgs) {
      assert.ok(
        org.iri.includes("/id/org/"),
        `Org IRI missing /id/: ${org.iri}`,
      );
    }
    for (const dept of entities.departments) {
      assert.ok(
        dept.iri.includes("/id/department/"),
        `Dept IRI missing /id/: ${dept.iri}`,
      );
    }
    for (const team of entities.teams) {
      assert.ok(
        team.iri.includes("/id/team/"),
        `Team IRI missing /id/: ${team.iri}`,
      );
    }
    for (const person of entities.people) {
      assert.ok(
        person.iri.includes("/id/person/"),
        `Person IRI missing /id/: ${person.iri}`,
      );
    }
    for (const proj of entities.projects) {
      assert.ok(
        proj.iri.includes("/id/project/"),
        `Project IRI missing /id/: ${proj.iri}`,
      );
    }
  });
});
