import { test, describe } from "node:test";
import assert from "node:assert";
import { transformPeople } from "@forwardimpact/map/activity/transform/people";
import { createMockSupabaseClient } from "@forwardimpact/libmock";

function createFakeClient({ peopleYaml }) {
  const client = createMockSupabaseClient({
    files: { "people/latest.yaml": peopleYaml },
  });
  return {
    ...client,
    get upsertCalls() {
      return client.calls.upsert;
    },
  };
}

describe("activity/transform/people", () => {
  test("upserts manager-less people before people with managers", async () => {
    const yaml = [
      "- email: ada@example.com",
      "  name: Ada",
      "  discipline: se",
      "  level: L4",
      "  manager_email: charles@example.com",
      "- email: charles@example.com",
      "  name: Charles",
      "  discipline: em",
      "  level: L5",
    ].join("\n");

    const fake = createFakeClient({ peopleYaml: yaml });
    const result = await transformPeople(fake);

    assert.strictEqual(result.imported, 2);
    assert.strictEqual(result.errors.length, 0);
    assert.strictEqual(fake.upsertCalls.length, 2);
    assert.strictEqual(
      fake.upsertCalls[0].rows[0].email,
      "charles@example.com",
    );
    assert.strictEqual(fake.upsertCalls[1].rows[0].email, "ada@example.com");
    assert.strictEqual(fake.upsertCalls[0].onConflict, "email");
  });

  test("returns zero counts for empty storage", async () => {
    const fake = {
      storage: {
        from() {
          return {
            async list() {
              return { data: [], error: null };
            },
          };
        },
      },
    };
    const result = await transformPeople(fake);
    assert.strictEqual(result.imported, 0);
    assert.strictEqual(result.errors.length, 0);
  });

  test("handles CSV format", async () => {
    const csv =
      "email,name,discipline,level\nada@x.com,Ada,se,L4\nbob@x.com,Bob,em,L5";
    const fake = createFakeClient({ peopleYaml: csv });
    // Override the file name to end with .csv
    fake.storage.from = () => ({
      async list() {
        return {
          data: [{ name: "latest.csv", created_at: "2026-01-01T00:00:00Z" }],
          error: null,
        };
      },
      async download() {
        return { data: { text: async () => csv }, error: null };
      },
    });
    const result = await transformPeople(fake);
    assert.strictEqual(result.imported, 2);
  });
});
