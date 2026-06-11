import { test, describe } from "node:test";
import assert from "node:assert";
import {
  transformEvidenceArtifact,
  tokeniseMarker,
} from "@forwardimpact/map/activity/transform/evidence-artifact";

/**
 * Hand-rolled fake client — the producer's join select
 * (`organization_people(...)` nested syntax) and `.delete().eq()` /
 * `.upsert(rows, options)` chains are not covered by
 * `createMockSupabaseClient`.
 */
function createFakeClient({ joinedArtifacts = [] } = {}) {
  const deleteCalls = [];
  const upsertCalls = [];

  return {
    deleteCalls,
    upsertCalls,
    from(table) {
      if (table === "github_artifacts") {
        return {
          select() {
            return {
              not() {
                return { data: joinedArtifacts, error: null };
              },
            };
          },
        };
      }
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
          async upsert(rows, options) {
            upsertCalls.push({ table, rows, options });
            return { error: null };
          },
        };
      }
      return {};
    },
  };
}

const PERSON = { discipline: "data_engineering", level: "J080", track: null };

/** Minimal standard: one core skill at working proficiency with markers. */
function makeMapData({ markers }) {
  return {
    disciplines: [{ id: "data_engineering", coreSkills: ["task_completion"] }],
    levels: [
      {
        id: "J080",
        baseSkillProficiencies: {
          core: "working",
          supporting: "foundational",
          broad: "awareness",
        },
      },
    ],
    tracks: [],
    capabilities: [{ id: "delivery", ordinalRank: 1 }],
    skills: [
      {
        id: "task_completion",
        name: "Task Completion",
        capability: "delivery",
        markers: { working: markers },
      },
    ],
  };
}

function makeJoined({
  artifact_id,
  repository = "mes-connector",
  artifact_type = "pull_request",
  metadata = {},
  occurred_at = "2026-01-01T00:00:00Z",
}) {
  return {
    artifact_id,
    email: "daedalus@bionova.example",
    repository,
    artifact_type,
    metadata,
    occurred_at,
    organization_people: PERSON,
  };
}

describe("activity/transform/evidence-artifact", () => {
  test("rule 1: ≥2 keyword overlap selects matching artifacts only", async () => {
    const mapData = makeMapData({
      markers: { human: ["Delivered schema cutover for line monitors"] },
    });
    const fake = createFakeClient({
      joinedArtifacts: [
        makeJoined({
          artifact_id: "a1",
          metadata: { title: "feat: schema cutover v2", body: "" },
        }),
        makeJoined({
          artifact_id: "a2",
          metadata: { title: "chore: bump deps", body: "" },
        }),
        makeJoined({
          artifact_id: "a3",
          metadata: { title: "fix monitors after schema change", body: "" },
        }),
      ],
    });

    const result = await transformEvidenceArtifact(fake, { mapData });

    const rows = fake.upsertCalls[0].rows;
    const ids = rows.map((r) => r.artifact_id).sort();
    assert.deepStrictEqual(ids, ["a1", "a3"]);
    assert.strictEqual(result.inserted, 2);
    for (const row of rows) {
      assert.strictEqual(row.provenance, "artifact_interpreted");
      assert.match(row.rationale, /^Token-overlap score/);
    }
  });

  test("rule 2: one row per (artifact, skill); best score wins with lexicographic tie-break", async () => {
    const mapData = makeMapData({
      markers: {
        human: [
          "Delivered feature quality gates",
          "Delivered feature rework cycle",
          "Delivered feature monitors cutover schema",
        ],
      },
    });
    const fake = createFakeClient({
      joinedArtifacts: [
        makeJoined({
          artifact_id: "a1",
          metadata: {
            title: "Delivered feature with quality rework",
            body: "",
          },
        }),
      ],
    });

    await transformEvidenceArtifact(fake, { mapData });

    const rows = fake.upsertCalls[0].rows;
    assert.strictEqual(rows.length, 1);
    // Both "quality gates" and "rework cycle" markers score 3
    // (delivered, feature, quality|rework); lexicographic tie-break picks
    // "Delivered feature quality gates".
    assert.strictEqual(rows[0].marker_text, "Delivered feature quality gates");
  });

  test("rule 3: per-(repo, skill) floor fires on zero overlap", async () => {
    const mapData = makeMapData({
      markers: {
        human: ["Zebra xylophone quartz", "Aardvark xylophone quartz"],
      },
    });
    const fake = createFakeClient({
      joinedArtifacts: [
        makeJoined({
          artifact_id: "late",
          metadata: { title: "bump deps", body: "" },
          occurred_at: "2026-02-01T00:00:00Z",
        }),
        makeJoined({
          artifact_id: "early",
          metadata: { title: "fix tests", body: "" },
          occurred_at: "2026-01-01T00:00:00Z",
        }),
      ],
    });

    const result = await transformEvidenceArtifact(fake, { mapData });

    const rows = fake.upsertCalls[0].rows;
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(result.inserted, 1);
    assert.strictEqual(rows[0].artifact_id, "early");
    assert.strictEqual(rows[0].marker_text, "Aardvark xylophone quartz");
    assert.match(rows[0].rationale, /^Structural floor/);
    assert.strictEqual(rows[0].provenance, "artifact_interpreted");
  });

  test("per-class delete narrows to artifact_interpreted on every run", async () => {
    const mapData = makeMapData({
      markers: { human: ["Delivered schema cutover"] },
    });
    const fake = createFakeClient({
      joinedArtifacts: [
        makeJoined({
          artifact_id: "a1",
          metadata: { title: "schema cutover", body: "" },
        }),
      ],
    });

    await transformEvidenceArtifact(fake, { mapData });
    await transformEvidenceArtifact(fake, { mapData });

    assert.strictEqual(fake.deleteCalls.length, 2);
    for (const call of fake.deleteCalls) {
      assert.strictEqual(call.col, "provenance");
      assert.strictEqual(call.val, "artifact_interpreted");
    }
  });

  test("tokenisation drops stop-words and tokens shorter than 4", () => {
    const tokens = tokeniseMarker(
      "Delivered a small feature end-to-end with minimal rework",
    );
    assert.deepStrictEqual([...tokens].sort(), [
      "delivered",
      "end-to-end",
      "feature",
      "minimal",
      "rework",
      "small",
    ]);
  });

  test("determinism: rerun against same inputs produces the same projected set", async () => {
    const mapData = makeMapData({
      markers: {
        human: [
          "Delivered schema cutover for line monitors",
          "Zebra xylophone quartz",
        ],
      },
    });
    const joinedArtifacts = [
      makeJoined({
        artifact_id: "a1",
        metadata: { title: "feat: schema cutover", body: "" },
      }),
      makeJoined({
        artifact_id: "b1",
        repository: "scada-bridge",
        artifact_type: "commit",
        metadata: { message: "ops: rotate certs" },
      }),
    ];
    const fake = createFakeClient({ joinedArtifacts });

    await transformEvidenceArtifact(fake, { mapData });
    await transformEvidenceArtifact(fake, { mapData });

    const project = (rows) =>
      rows.map(
        (r) =>
          `${r.artifact_id}|${r.skill_id}|${r.level_id}|${r.marker_text}|${r.matched}|${r.provenance}`,
      );
    assert.deepStrictEqual(
      project(fake.upsertCalls[0].rows),
      project(fake.upsertCalls[1].rows),
    );
    assert.strictEqual(
      fake.upsertCalls[0].options?.onConflict,
      "artifact_id,skill_id,level_id,marker_text",
    );
    assert.strictEqual(fake.upsertCalls[0].options?.ignoreDuplicates, true);
  });

  test("artifacts without an organization_people row are skipped", async () => {
    const mapData = makeMapData({
      markers: { human: ["Delivered schema cutover"] },
    });
    const fake = createFakeClient({
      joinedArtifacts: [
        {
          artifact_id: "orphan",
          email: "ghost@example.com",
          repository: "mes-connector",
          artifact_type: "pull_request",
          metadata: { title: "schema cutover", body: "" },
          occurred_at: "2026-01-01T00:00:00Z",
          organization_people: null,
        },
      ],
    });

    const result = await transformEvidenceArtifact(fake, { mapData });

    assert.strictEqual(result.inserted, 0);
    assert.strictEqual(result.skipped, 1);
    assert.strictEqual(fake.upsertCalls.length, 0);
  });
});
