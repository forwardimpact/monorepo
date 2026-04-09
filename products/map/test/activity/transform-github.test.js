import { test, describe } from "node:test";
import assert from "node:assert";
import { transformGitHubWebhook } from "@forwardimpact/map/activity/transform/github";

function createFakeClient(storedDocument) {
  const upsertCalls = [];
  return {
    upsertCalls,
    from(table) {
      if (table === "organization_people") {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          async single() {
            return { data: { email: "ada@example.com" } };
          },
        };
      }
      return {
        async upsert(row, opts) {
          upsertCalls.push({ table, row, onConflict: opts.onConflict });
          return { error: null };
        },
      };
    },
    storage: {
      from() {
        return {
          async download() {
            return {
              data: { text: async () => storedDocument },
              error: null,
            };
          },
        };
      },
    },
  };
}

describe("activity/transform/github", () => {
  test("extracts pull_request artifact", async () => {
    const raw = JSON.stringify({
      delivery_id: "1",
      event_type: "pull_request",
      received_at: "2026-01-01T00:00:00Z",
      payload: {
        action: "opened",
        repository: { full_name: "org/repo" },
        sender: { login: "adalovelace" },
        pull_request: {
          number: 7,
          title: "Thing",
          user: { login: "adalovelace" },
          created_at: "2026-01-01T00:00:00Z",
          state: "open",
          additions: 10,
          deletions: 2,
          changed_files: 1,
          merged: false,
          base: { ref: "main" },
          head: { ref: "feat" },
        },
      },
    });
    const fake = createFakeClient(raw);
    const result = await transformGitHubWebhook(fake, "github/1.json");
    assert.strictEqual(result.event, true);
    assert.strictEqual(result.artifacts, 1);
    const prCall = fake.upsertCalls.find((c) => c.table === "github_artifacts");
    assert.strictEqual(prCall.row.artifact_type, "pull_request");
    assert.strictEqual(prCall.row.external_id, "pr:org/repo#7");
    assert.strictEqual(prCall.row.email, "ada@example.com");
  });

  test("extracts review artifact", async () => {
    const raw = JSON.stringify({
      delivery_id: "2",
      event_type: "pull_request_review",
      received_at: "2026-01-01T00:00:00Z",
      payload: {
        action: "submitted",
        repository: { full_name: "org/repo" },
        sender: { login: "adalovelace" },
        pull_request: { number: 7 },
        review: {
          id: 42,
          user: { login: "adalovelace" },
          submitted_at: "2026-01-01T01:00:00Z",
          state: "approved",
          body: "LGTM",
        },
      },
    });
    const fake = createFakeClient(raw);
    const result = await transformGitHubWebhook(fake, "github/2.json");
    assert.strictEqual(result.event, true);
    assert.strictEqual(result.artifacts, 1);
    const reviewCall = fake.upsertCalls.find(
      (c) => c.table === "github_artifacts",
    );
    assert.strictEqual(reviewCall.row.artifact_type, "review");
    assert.strictEqual(reviewCall.row.external_id, "review:org/repo#7:42");
  });

  test("extracts commit artifacts from push", async () => {
    const raw = JSON.stringify({
      delivery_id: "3",
      event_type: "push",
      received_at: "2026-01-01T00:00:00Z",
      payload: {
        repository: { full_name: "org/repo" },
        sender: { login: "adalovelace" },
        commits: [
          {
            id: "abc123",
            timestamp: "2026-01-01T00:00:00Z",
            message: "fix: thing",
            added: ["a.js"],
            removed: [],
            modified: ["b.js"],
          },
          {
            id: "def456",
            timestamp: "2026-01-01T00:01:00Z",
            message: "feat: other",
            added: [],
            removed: ["c.js"],
            modified: [],
          },
        ],
      },
    });
    const fake = createFakeClient(raw);
    const result = await transformGitHubWebhook(fake, "github/3.json");
    assert.strictEqual(result.event, true);
    assert.strictEqual(result.artifacts, 2);
    const commitCalls = fake.upsertCalls.filter(
      (c) => c.table === "github_artifacts",
    );
    assert.strictEqual(commitCalls[0].row.artifact_type, "commit");
    assert.strictEqual(
      commitCalls[0].row.external_id,
      "commit:org/repo:abc123",
    );
    assert.strictEqual(
      commitCalls[1].row.external_id,
      "commit:org/repo:def456",
    );
  });
});
