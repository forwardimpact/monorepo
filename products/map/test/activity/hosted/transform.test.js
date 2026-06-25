import { test, describe } from "node:test";
import assert from "node:assert";
import { transformAll } from "@forwardimpact/map/activity/transform";
import { handleTransform } from "../../../supabase/functions/transform/handler.js";
import { createHostedRuntime } from "../../../supabase/functions/_shared/runtime.ts";
import { createFakeSupabase } from "./fake-supabase.js";

const PERSON = { discipline: "data-engineering", level: "J080", track: null };

/** Minimal standard: one core skill at working proficiency with markers. */
function makeMapData(markers) {
  return {
    disciplines: [{ id: "data-engineering", coreSkills: ["task-completion"] }],
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
        id: "task-completion",
        name: "Task Completion",
        capability: "delivery",
        markers: { working: markers },
      },
    ],
  };
}

function makeJoined(artifact_id, title) {
  return {
    artifact_id,
    email: "daedalus@bionova.example",
    repository: "mes-connector",
    artifact_type: "pull_request",
    metadata: { title, body: "" },
    occurred_at: "2026-01-01T00:00:00Z",
    organization_people: PERSON,
  };
}

const MAP_DATA = makeMapData({
  human: ["Delivered schema cutover for line monitors"],
});
const JOINED = [
  makeJoined("a1", "feat: schema cutover v2"),
  makeJoined("a3", "fix monitors after schema change"),
];

describe("hosted transform handler", () => {
  test("criterion 1: producer runs and writes artifact_interpreted rows", async () => {
    const fake = createFakeSupabase({ joinedArtifacts: JOINED });
    const body = await handleTransform(
      fake,
      createHostedRuntime(),
      async () => ({ mapData: MAP_DATA }),
    );

    assert.strictEqual(body.evidenceArtifact.producerRan, true);
    assert.ok(body.evidenceArtifact.inserted > 0, "non-zero inserts");

    const evidenceUpserts = fake.upsertCalls.filter(
      (c) => c.table === "evidence",
    );
    const rows = evidenceUpserts.flatMap((c) => c.rows);
    assert.ok(rows.length > 0);
    for (const row of rows) {
      assert.strictEqual(row.provenance, "artifact_interpreted");
    }
  });

  test("criterion 2: hosted handler yields the same rows as transformAll", async () => {
    const hostedFake = createFakeSupabase({ joinedArtifacts: JOINED });
    await handleTransform(hostedFake, createHostedRuntime(), async () => ({
      mapData: MAP_DATA,
    }));

    const cliFake = createFakeSupabase({ joinedArtifacts: JOINED });
    await transformAll(cliFake, createHostedRuntime(), { mapData: MAP_DATA });

    const pick = (fake) =>
      fake.upsertCalls
        .filter((c) => c.table === "evidence")
        .flatMap((c) => c.rows)
        .map((r) => ({
          artifact_id: r.artifact_id,
          marker_text: r.marker_text,
          provenance: r.provenance,
        }))
        .sort((a, b) => a.artifact_id.localeCompare(b.artifact_id));

    assert.deepStrictEqual(pick(hostedFake), pick(cliFake));
  });

  test("criterion 4: missing standard data is reported as skipped, with why", async () => {
    const fake = createFakeSupabase({ joinedArtifacts: JOINED });
    const body = await handleTransform(
      fake,
      createHostedRuntime(),
      async () => ({ skipped: true, reason: "bundle_absent" }),
    );

    assert.strictEqual(body.evidenceArtifact.producerRan, false);
    assert.strictEqual(body.evidenceArtifact.missingCollaborator, "mapData");
    assert.strictEqual(body.evidenceArtifact.skipReason, "bundle_absent");
  });
});
