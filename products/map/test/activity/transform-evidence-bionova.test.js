import { test, describe, before } from "node:test";
import assert from "node:assert";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { createDataLoader } from "@forwardimpact/map/loader";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { createMockSupabaseClient } from "@forwardimpact/libmock";
import { transformEvidenceArtifact } from "@forwardimpact/map/activity/transform/evidence-artifact";
import { transformEvidence } from "@forwardimpact/map/activity/transform/evidence";
import { COVERAGE_CONFIDENCE_FLOOR } from "@forwardimpact/landmark/lib/confidence-floor";

const starterDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../starter",
);

const EMAIL = "daedalus@bionova.example";

/**
 * BioNova manufacturing IT persona whose flagship work must surface as
 * evidence. Mirrors `data/synthetic/story.dsl` § manufacturing_it: repos
 * mes-connector + scada-bridge, flagship work = mes-connector v2 schema
 * cutover + scada-bridge operational record. The starter standard has no
 * J080 level (J040/J060 only), so the fixture pins the senior starter
 * level J060 — the contract anchors on the team's repo names, not the
 * literal level id.
 */
const PERSON = { discipline: "data_engineering", level: "J060", track: null };

function art(id, repository, artifact_type, metadata, occurred_at) {
  return {
    artifact_id: id,
    email: EMAIL,
    repository,
    artifact_type,
    metadata,
    occurred_at,
    organization_people: PERSON,
  };
}

const FIXTURE_ARTIFACTS = [
  art(
    "mes-01",
    "mes-connector",
    "pull_request",
    {
      title: "feat(mes-connector): v2 schema cutover for line monitors",
      body: "Designed and delivered the cutover pipeline integrating two source systems with documented contracts and recovery behaviour.",
    },
    "2026-01-05T00:00:00Z",
  ),
  art(
    "mes-02",
    "mes-connector",
    "pull_request",
    {
      title: "fix(mes-connector): survive upstream schema change",
      body: "Recovered cleanly from an upstream schema change without losing data or blocking downstream consumers.",
    },
    "2026-01-12T00:00:00Z",
  ),
  art(
    "mes-03",
    "mes-connector",
    "pull_request",
    {
      title: "feat(mes-connector): batch genealogy data model",
      body: "Designed a data model for the genealogy surface, weighing normalization choices and documenting the relationships.",
    },
    "2026-01-19T00:00:00Z",
  ),
  art(
    "mes-04",
    "mes-connector",
    "commit",
    {
      message:
        "perf(mes-connector): met the measurable performance target for the ingestion service area this quarter",
    },
    "2026-01-26T00:00:00Z",
  ),
  art(
    "mes-05",
    "mes-connector",
    "review",
    {
      body: "Component design covers interfaces, data flow, and key trade-offs for the service — approving.",
    },
    "2026-02-02T00:00:00Z",
  ),
  art(
    "mes-06",
    "mes-connector",
    "commit",
    { message: "chore: bump deps" },
    "2026-02-09T00:00:00Z",
  ),
  art(
    "mes-07",
    "mes-connector",
    "commit",
    { message: "ops: rotate certs" },
    "2026-02-16T00:00:00Z",
  ),
  art(
    "mes-08",
    "mes-connector",
    "commit",
    { message: "ci: retry flaky job" },
    "2026-02-23T00:00:00Z",
  ),
  art(
    "scada-01",
    "scada-bridge",
    "pull_request",
    {
      title: "feat(scada-bridge): operational record pipeline",
      body: "Designed and delivered a pipeline integrating the SCADA historian and MES source systems with documented contracts.",
    },
    "2026-01-07T00:00:00Z",
  ),
  art(
    "scada-02",
    "scada-bridge",
    "pull_request",
    {
      title: "feat(scada-bridge): provision telemetry service",
      body: "Provisioned the service end-to-end with infrastructure as code, including monitoring and access controls.",
    },
    "2026-01-14T00:00:00Z",
  ),
  art(
    "scada-03",
    "scada-bridge",
    "review",
    {
      body: "Status note names progress, blockers, and next steps in stakeholder-readable language — good cadence.",
    },
    "2026-01-21T00:00:00Z",
  ),
  art(
    "scada-04",
    "scada-bridge",
    "commit",
    {
      message:
        "docs(scada-bridge): generate the audit-ready artifact required by the documented control, in the agreed format",
    },
    "2026-01-28T00:00:00Z",
  ),
  art(
    "scada-05",
    "scada-bridge",
    "commit",
    { message: "chore: gitignore tmp" },
    "2026-02-04T00:00:00Z",
  ),
  art(
    "scada-06",
    "scada-bridge",
    "commit",
    { message: "ops: bump retention" },
    "2026-02-11T00:00:00Z",
  ),
  art(
    "scada-07",
    "scada-bridge",
    "commit",
    { message: "ci: cache warmup" },
    "2026-02-18T00:00:00Z",
  ),
];

const GETDX_EVIDENCE = {
  evidence: [
    {
      person_email: EMAIL,
      skill_id: "team_collaboration",
      proficiency: "foundational",
      observed_at: "2026-01-10T00:00:00Z",
    },
    {
      person_email: EMAIL,
      skill_id: "cloud_platforms",
      proficiency: "working",
      observed_at: "2026-01-17T00:00:00Z",
    },
    {
      person_email: EMAIL,
      skill_id: "data_integration",
      proficiency: "working",
      observed_at: "2026-01-24T00:00:00Z",
    },
  ],
};

function createFakeClient() {
  const deleteCalls = [];
  const upsertCalls = [];
  const storageMock = createMockSupabaseClient({
    files: { "getdx/evidence.json": JSON.stringify(GETDX_EVIDENCE) },
  });

  return {
    deleteCalls,
    upsertCalls,
    from(table) {
      if (table === "github_artifacts") {
        return {
          select() {
            return {
              not() {
                return { data: FIXTURE_ARTIFACTS, error: null };
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
    storage: storageMock.storage,
  };
}

/** One full transform pass, orchestrator order: artifact-driven first. */
async function runPass(fake) {
  const startIndex = fake.upsertCalls.length;
  const artifactResult = await transformEvidenceArtifact(fake, { mapData });
  const roundRobinResult = await transformEvidence(fake);
  const rows = fake.upsertCalls.slice(startIndex).flatMap((call) => call.rows);
  return { artifactResult, roundRobinResult, rows };
}

let mapData;

describe("BioNova evidence coverage contract", () => {
  before(async () => {
    const loader = createDataLoader(createDefaultRuntime());
    mapData = await loader.loadAllData(starterDir);
  });

  test("coverage ≥ floor, ≥14 artifact-interpreted rows, both repos covered", async () => {
    const fake = createFakeClient();
    const { rows } = await runPass(fake);

    // 1(a): coverage = scored / total over the persona's artifacts
    // (computeCoverageRatio semantics, evidence-helpers.js).
    const scoredIds = new Set(rows.map((r) => r.artifact_id));
    const total = FIXTURE_ARTIFACTS.length;
    const scored = FIXTURE_ARTIFACTS.filter((a) =>
      scoredIds.has(a.artifact_id),
    ).length;
    const ratio = scored / total;
    assert.ok(
      ratio >= COVERAGE_CONFIDENCE_FLOOR,
      `coverage ${scored}/${total} (${(ratio * 100).toFixed(1)}%) below floor`,
    );

    // 1(b): artifact-interpreted class contributes ≥14 rows.
    const interpreted = rows.filter(
      (r) => r.provenance === "artifact_interpreted",
    );
    assert.ok(
      interpreted.length >= 14,
      `expected ≥14 artifact_interpreted rows, got ${interpreted.length}`,
    );

    // 1(c): at least one artifact-interpreted row per team repo.
    const artifactsById = new Map(
      FIXTURE_ARTIFACTS.map((a) => [a.artifact_id, a]),
    );
    const repos = new Set(
      interpreted.map((r) => artifactsById.get(r.artifact_id).repository),
    );
    assert.ok(
      repos.has("mes-connector"),
      "no interpreted row in mes-connector",
    );
    assert.ok(repos.has("scada-bridge"), "no interpreted row in scada-bridge");
  });

  test("repeated transform passes produce the same projected set", async () => {
    const fake = createFakeClient();
    const first = await runPass(fake);
    const second = await runPass(fake);

    const project = (rows) =>
      rows
        .map(
          (r) =>
            `${r.artifact_id}|${r.skill_id}|${r.level_id}|${r.marker_text}|${r.matched}|${r.provenance}`,
        )
        .sort();
    assert.deepStrictEqual(project(second.rows), project(first.rows));

    // Every upsert ran with the conflict guard (determinism rule 2's
    // belt-and-braces) and each producer deleted only its own class.
    for (const call of fake.upsertCalls) {
      assert.strictEqual(
        call.options?.onConflict,
        "artifact_id,skill_id,level_id,marker_text",
      );
      assert.strictEqual(call.options?.ignoreDuplicates, true);
    }
    assert.deepStrictEqual(
      fake.deleteCalls.map((c) => c.val),
      [
        "artifact_interpreted",
        "synthetic_placeholder",
        "artifact_interpreted",
        "synthetic_placeholder",
      ],
    );
  });
});
