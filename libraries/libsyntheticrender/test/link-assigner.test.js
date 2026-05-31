import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createTestRuntime } from "@forwardimpact/libmock";
import { assignLinks } from "../src/render/link-assigner.js";
import {
  generateDrugs,
  generatePlatforms,
} from "../src/render/industry-data.js";

const DOMAIN = "test.example";

function makeTestEntities() {
  const drugs = generateDrugs(DOMAIN);
  const platforms = generatePlatforms(DOMAIN);
  const teams = [
    { id: "alpha", department: "eng", manager: "mgr-a" },
    { id: "beta", department: "eng", manager: "mgr-b" },
  ];
  const departments = [{ id: "eng", name: "Engineering" }];
  const people = [
    {
      id: "alice",
      name: "Alice",
      team_id: "alpha",
      is_manager: true,
      email: "alice@test.example",
      github_username: "alice",
    },
    {
      id: "bob",
      name: "Bob",
      team_id: "beta",
      is_manager: true,
      email: "bob@test.example",
      github_username: "bob",
    },
    {
      id: "carol",
      name: "Carol",
      team_id: "alpha",
      is_manager: false,
      email: "carol@test.example",
      github_username: "carol",
    },
    {
      id: "dave",
      name: "Dave",
      team_id: "beta",
      is_manager: false,
      email: "dave@test.example",
      github_username: "dave",
    },
  ];
  const projects = [
    {
      id: "proj1",
      type: "drug",
      teams: ["alpha"],
      prose_topic: "testing",
      prose_tone: "formal",
    },
  ];

  return { drugs, platforms, teams, departments, people, projects };
}

describe("assignLinks", () => {
  test("returns all expected entity types", () => {
    const ent = makeTestEntities();
    const result = assignLinks({
      ...ent,
      domain: DOMAIN,
      courseCount: 3,
      eventCount: 2,
      blogCount: 5,
      articleTopics: ["clinical"],
      seed: 42,
      runtime: createTestRuntime(),
    });
    assert.ok(Array.isArray(result.drugs));
    assert.ok(Array.isArray(result.platforms));
    assert.ok(Array.isArray(result.projects));
    assert.ok(Array.isArray(result.courses));
    assert.ok(Array.isArray(result.events));
    assert.ok(Array.isArray(result.blogPosts));
    assert.ok(Array.isArray(result.articles));
  });

  test("blog dates are valid for counts exceeding 24", () => {
    const ent = makeTestEntities();
    const result = assignLinks({
      ...ent,
      domain: DOMAIN,
      courseCount: 0,
      eventCount: 0,
      blogCount: 45,
      seed: 42,
      runtime: createTestRuntime(),
    });
    for (const blog of result.blogPosts) {
      const parsed = new Date(blog.date);
      assert.ok(!isNaN(parsed.getTime()), `Invalid date: ${blog.date}`);
      const month = parseInt(blog.date.split("-")[1], 10);
      assert.ok(month >= 1 && month <= 12, `Month out of range: ${month}`);
    }
  });

  test("project IRIs use /id/ prefix", () => {
    const ent = makeTestEntities();
    const result = assignLinks({
      ...ent,
      domain: DOMAIN,
      courseCount: 2,
      eventCount: 1,
      blogCount: 1,
      seed: 42,
      runtime: createTestRuntime(),
    });
    for (const proj of result.projects) {
      assert.ok(
        proj.iri.includes("/id/project/"),
        `Project IRI missing /id/: ${proj.iri}`,
      );
    }
  });

  test("course orgName uses provided value instead of hardcoded", () => {
    const ent = makeTestEntities();
    const result = assignLinks({
      ...ent,
      domain: DOMAIN,
      courseCount: 3,
      eventCount: 0,
      blogCount: 0,
      seed: 42,
      orgName: "TestCorp",
      runtime: createTestRuntime(),
    });
    for (const course of result.courses) {
      assert.strictEqual(course.orgName, "TestCorp");
    }
  });

  test("dates use provided startYear/endYear", () => {
    const ent = makeTestEntities();
    const result = assignLinks({
      ...ent,
      domain: DOMAIN,
      courseCount: 2,
      eventCount: 2,
      blogCount: 3,
      seed: 42,
      startYear: 2027,
      endYear: 2028,
      runtime: createTestRuntime(),
    });
    for (const course of result.courses) {
      const year = parseInt(course.date.split("-")[0], 10);
      assert.ok(
        year >= 2027 && year <= 2028,
        `Course year out of range: ${year}`,
      );
    }
    for (const event of result.events) {
      const year = parseInt(event.date.split("-")[0], 10);
      assert.ok(
        year >= 2027 && year <= 2028,
        `Event year out of range: ${year}`,
      );
    }
  });
});
