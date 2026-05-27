import { test, describe } from "node:test";
import assert from "node:assert";
import { transformEvidence } from "@forwardimpact/map/activity/transform/evidence";
import { createMockSupabaseClient } from "@forwardimpact/libmock";
import { makeEvidenceRow, makeArtifact } from "../fixtures.js";

/**
 * transform/evidence.js chains `.delete().eq()` and `.select().not()`, neither
 * covered by `createMockSupabaseClient`. The storage download IS covered, so
 * we delegate that to the shared mock and hand-roll the table chains here.
 */
function createFakeClient({
  evidenceJson = null,
  artifacts = [],
  throwOnDownload = false,
  insertError = null,
} = {}) {
  const deleteCalls = [];
  const insertCalls = [];

  const files = throwOnDownload
    ? {}
    : { "getdx/evidence.json": JSON.stringify(evidenceJson) };
  const storageMock = createMockSupabaseClient({ files });

  return {
    deleteCalls,
    insertCalls,
    from(table) {
      if (table === "evidence") {
        return {
          delete() {
            return {
              async eq(col, val) {
                deleteCalls.push({ table, col, val });
                return { error: null };
              },
            };
          },
          async insert(rows) {
            insertCalls.push({ table, rows });
            return { error: insertError };
          },
        };
      }
      if (table === "github_artifacts") {
        return {
          select() {
            return {
              not() {
                return { data: artifacts, error: null };
              },
            };
          },
        };
      }
      return {};
    },
    storage: storageMock.storage,
  };
}

describe("activity/transform/evidence", () => {
  test("happy path: inserts evidence with round-robin artifact distribution", async () => {
    const fake = createFakeClient({
      evidenceJson: {
        evidence: [
          makeEvidenceRow(),
          makeEvidenceRow({
            skill_id: "code-review",
            proficiency: "practitioner",
            observed_at: "2026-01-02T00:00:00Z",
          }),
          makeEvidenceRow({
            person_email: "bob@example.com",
            proficiency: "foundational",
            observed_at: "2026-01-03T00:00:00Z",
          }),
          makeEvidenceRow({
            person_email: "unknown@example.com",
            proficiency: "awareness",
            observed_at: "2026-01-04T00:00:00Z",
          }),
        ],
      },
      artifacts: [
        makeArtifact({ metadata: { title: "Fix auth" } }),
        makeArtifact({
          artifact_id: "a2",
          artifact_type: "commit",
          metadata: { message: "feat: add tests" },
        }),
        makeArtifact({
          artifact_id: "b1",
          email: "bob@example.com",
          artifact_type: "review",
          metadata: {},
        }),
      ],
    });

    const result = await transformEvidence(fake);

    assert.strictEqual(result.inserted, 3);
    assert.strictEqual(result.skipped, 1);
    assert.strictEqual(result.errors.length, 0);

    assert.strictEqual(fake.deleteCalls.length, 1);
    assert.strictEqual(fake.deleteCalls[0].val, "synthetic");

    const rows = fake.insertCalls[0].rows;
    assert.strictEqual(rows.length, 3);

    assert.strictEqual(rows[0].artifact_id, "a1");
    assert.strictEqual(rows[0].marker_text, "Fix auth");
    assert.strictEqual(rows[0].level_id, "working");

    assert.strictEqual(rows[1].artifact_id, "a2");
    assert.strictEqual(rows[1].marker_text, "feat: add tests");

    assert.strictEqual(rows[2].artifact_id, "b1");
    assert.strictEqual(rows[2].marker_text, "testing evidence");

    for (const row of rows) {
      assert.strictEqual(row.matched, true);
      assert.strictEqual(row.rationale, "synthetic");
    }
  });

  test("idempotency: delete runs before insert on each call", async () => {
    const fake = createFakeClient({
      evidenceJson: { evidence: [makeEvidenceRow()] },
      artifacts: [makeArtifact()],
    });

    await transformEvidence(fake);
    await transformEvidence(fake);

    assert.strictEqual(fake.deleteCalls.length, 2);
    assert.strictEqual(fake.insertCalls.length, 2);

    const firstRows = fake.insertCalls[0].rows;
    const secondRows = fake.insertCalls[1].rows;
    assert.deepStrictEqual(secondRows, firstRows);
  });

  test("missing evidence file returns zeros gracefully", async () => {
    const fake = createFakeClient({ throwOnDownload: true });

    const result = await transformEvidence(fake);

    assert.strictEqual(result.inserted, 0);
    assert.strictEqual(result.skipped, 0);
    assert.strictEqual(result.errors.length, 0);
    assert.strictEqual(fake.deleteCalls.length, 0);
    assert.strictEqual(fake.insertCalls.length, 0);
  });

  test("marker_text fallback chain: title > message > skill_id evidence", async () => {
    const fake = createFakeClient({
      evidenceJson: {
        evidence: [
          makeEvidenceRow({ person_email: "a@x.com", skill_id: "s1" }),
          makeEvidenceRow({ person_email: "b@x.com", skill_id: "s2" }),
          makeEvidenceRow({ person_email: "c@x.com", skill_id: "s3" }),
        ],
      },
      artifacts: [
        makeArtifact({
          email: "a@x.com",
          metadata: { title: "Has title", message: "Has message" },
        }),
        makeArtifact({
          artifact_id: "b1",
          email: "b@x.com",
          artifact_type: "commit",
          metadata: { message: "Only message" },
        }),
        makeArtifact({
          artifact_id: "c1",
          email: "c@x.com",
          artifact_type: "review",
          metadata: {},
        }),
      ],
    });

    await transformEvidence(fake);
    const rows = fake.insertCalls[0].rows;

    assert.strictEqual(rows[0].marker_text, "Has title");
    assert.strictEqual(rows[1].marker_text, "Only message");
    assert.strictEqual(rows[2].marker_text, "s3 evidence");
  });

  test("insert error returns zero inserted and reports the error", async () => {
    const fake = createFakeClient({
      evidenceJson: { evidence: [makeEvidenceRow()] },
      artifacts: [makeArtifact()],
      insertError: { message: "permission denied" },
    });

    const result = await transformEvidence(fake);

    assert.strictEqual(result.inserted, 0);
    assert.strictEqual(result.skipped, 0);
    assert.strictEqual(result.errors.length, 1);
    assert.strictEqual(result.errors[0], "permission denied");
  });

  test("empty evidence array: deletes and returns zeros", async () => {
    const fake = createFakeClient({
      evidenceJson: { evidence: [] },
      artifacts: [makeArtifact()],
    });

    const result = await transformEvidence(fake);

    assert.strictEqual(result.inserted, 0);
    assert.strictEqual(result.skipped, 0);
    assert.strictEqual(result.errors.length, 0);
    assert.strictEqual(fake.deleteCalls.length, 1);
    assert.strictEqual(fake.insertCalls.length, 0);
  });
});
