import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { MapService } from "../index.js";
import { createMockConfig } from "@forwardimpact/libmock";

function createMockSupabase(overrides = {}) {
  const tables = {};

  function mockTable(name) {
    return {
      select: () => ({
        eq: (col, val) => ({
          single: async () => {
            const rows = tables[name] || [];
            const row = rows.find((r) => r[col] === val);
            return {
              data: row || null,
              error: row ? null : { message: "not found" },
            };
          },
          not: () => ({
            then: async (resolve) => {
              const rows = (tables[name] || []).filter(
                (r) => r[col] === val && r.getdx_team_id != null,
              );
              resolve({ data: rows });
            },
          }),
        }),
        in: () => ({
          not: () => ({
            then: async (resolve) => resolve({ data: [] }),
          }),
        }),
      }),
      upsert: async () => ({ error: null }),
    };
  }

  return {
    from: (name) => mockTable(name),
    rpc: async () => ({ data: [] }),
    _tables: tables,
    ...overrides,
  };
}

function createMockPathwayClient() {
  return {
    GetMarkersForProfile: async () => ({
      content: "skill_a\tworking\tDelivered a feature",
    }),
  };
}

describe("MapService", () => {
  it("constructs without error", () => {
    const config = createMockConfig();
    const supabase = createMockSupabase();
    const pathwayClient = createMockPathwayClient();
    const service = new MapService(config, { supabase, pathwayClient });
    assert.ok(service);
  });

  it("GetUnscoredArtifacts returns empty for no artifacts", async () => {
    const config = createMockConfig();
    const supabase = createMockSupabase({
      from: (name) => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: null, error: null }),
          }),
          range: async () => ({ data: [], error: null }),
          order: () => ({
            then: async (resolve) => resolve({ data: [], error: null }),
          }),
        }),
      }),
    });
    const pathwayClient = createMockPathwayClient();
    const service = new MapService(config, { supabase, pathwayClient });
    const result = await service.GetUnscoredArtifacts({});
    const artifacts = JSON.parse(result.content);
    assert.deepStrictEqual(artifacts, []);
  });

  it("GetPerson returns person profile", async () => {
    const config = createMockConfig();
    const person = {
      email: "alice@example.com",
      name: "Alice",
      discipline: "software_engineering",
      level: "J060",
      track: null,
      manager_email: "bob@example.com",
    };
    const supabase = createMockSupabase();
    supabase._tables.organization_people = [person];
    supabase.from = (name) => ({
      select: () => ({
        eq: (col, val) => ({
          single: async () => {
            if (name === "organization_people") {
              const row = supabase._tables[name]?.find((r) => r[col] === val);
              return {
                data: row || null,
                error: row ? null : { message: "not found" },
              };
            }
            return { data: null, error: { message: "not found" } };
          },
        }),
      }),
    });
    const pathwayClient = createMockPathwayClient();
    const service = new MapService(config, { supabase, pathwayClient });
    const result = await service.GetPerson({ email: "alice@example.com" });
    const parsed = JSON.parse(result.content);
    assert.equal(parsed.email, "alice@example.com");
    assert.equal(parsed.discipline, "software_engineering");
  });

  it("WriteEvidence rejects row without rationale", async () => {
    const config = createMockConfig();
    const supabase = createMockSupabase();
    const pathwayClient = createMockPathwayClient();
    const service = new MapService(config, { supabase, pathwayClient });
    await assert.rejects(
      () =>
        service.WriteEvidence({
          artifact_id: "a1",
          skill_id: "skill_a",
          level_id: "working",
          marker_text: "Delivered a feature",
          matched: true,
          rationale: "",
        }),
      /rationale is required/,
    );
  });

  it("GetArtifact returns artifact detail", async () => {
    const config = createMockConfig();
    const artifact = {
      artifact_id: "art-1",
      artifact_type: "pull_request",
      email: "alice@example.com",
      repository: "org/repo",
      occurred_at: "2026-01-01T00:00:00Z",
      metadata: { title: "Fix bug" },
    };
    const supabase = createMockSupabase();
    supabase.from = () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: artifact, error: null }),
        }),
      }),
    });
    const pathwayClient = createMockPathwayClient();
    const service = new MapService(config, { supabase, pathwayClient });
    const result = await service.GetArtifact({ artifact_id: "art-1" });
    const parsed = JSON.parse(result.content);
    assert.equal(parsed.artifact_id, "art-1");
    assert.equal(parsed.artifact_type, "pull_request");
    assert.equal(parsed.email, "alice@example.com");
  });

  it("WriteEvidence succeeds with valid grounded markers", async () => {
    const config = createMockConfig();
    const supabase = createMockSupabase();
    supabase.from = (name) => ({
      select: () => ({
        eq: (col, val) => ({
          single: async () => {
            if (name === "github_artifacts") {
              return {
                data: { email: "alice@example.com" },
                error: null,
              };
            }
            if (name === "organization_people") {
              return {
                data: {
                  email: "alice@example.com",
                  discipline: "se",
                  level: "J060",
                  track: null,
                },
                error: null,
              };
            }
            return { data: null, error: { message: "not found" } };
          },
        }),
      }),
      upsert: async () => ({ error: null }),
    });
    const pathwayClient = {
      GetMarkersForProfile: async () => ({
        content: "skill_a\tworking\tDelivered a feature",
      }),
    };
    const service = new MapService(config, { supabase, pathwayClient });
    const result = await service.WriteEvidence({
      artifact_id: "art-1",
      skill_id: "skill_a",
      level_id: "working",
      marker_text: "Delivered a feature",
      matched: true,
      rationale: "The PR shows end-to-end delivery.",
    });
    assert.equal(result.content, "1 row written");
  });

  it("WriteEvidence rejects markers not in standard", async () => {
    const config = createMockConfig();
    const supabase = createMockSupabase();
    supabase.from = (name) => ({
      select: () => ({
        eq: () => ({
          single: async () => {
            if (name === "github_artifacts") {
              return {
                data: { email: "alice@example.com" },
                error: null,
              };
            }
            if (name === "organization_people") {
              return {
                data: {
                  email: "alice@example.com",
                  discipline: "se",
                  level: "J060",
                  track: null,
                },
                error: null,
              };
            }
            return { data: null, error: { message: "not found" } };
          },
        }),
      }),
    });
    const pathwayClient = {
      GetMarkersForProfile: async () => ({
        content: "skill_a\tworking\tDelivered a feature",
      }),
    };
    const service = new MapService(config, { supabase, pathwayClient });
    await assert.rejects(
      () =>
        service.WriteEvidence({
          artifact_id: "art-1",
          skill_id: "skill_a",
          level_id: "working",
          marker_text: "Invented marker not in standard",
          matched: true,
          rationale: "This should fail.",
        }),
      /Marker not in standard/,
    );
  });

  function createGroundedSupabase(upsertCalls) {
    const supabase = createMockSupabase();
    supabase.from = (name) => ({
      select: () => ({
        eq: () => ({
          single: async () => {
            if (name === "github_artifacts") {
              return { data: { email: "alice@example.com" }, error: null };
            }
            if (name === "organization_people") {
              return {
                data: {
                  email: "alice@example.com",
                  discipline: "se",
                  level: "J060",
                  track: null,
                },
                error: null,
              };
            }
            return { data: null, error: { message: "not found" } };
          },
        }),
      }),
      upsert: async (rows, options) => {
        upsertCalls.push({ table: name, rows, options });
        return { error: null };
      },
    });
    return supabase;
  }

  const validEvidenceReq = {
    artifact_id: "art-1",
    skill_id: "skill_a",
    level_id: "working",
    marker_text: "Delivered a feature",
    matched: true,
    rationale: "The PR shows end-to-end delivery.",
  };

  it("WriteEvidence omits provenance so the DB default applies", async () => {
    const config = createMockConfig();
    const upsertCalls = [];
    const supabase = createGroundedSupabase(upsertCalls);
    const pathwayClient = createMockPathwayClient();
    const service = new MapService(config, { supabase, pathwayClient });
    const result = await service.WriteEvidence({ ...validEvidenceReq });
    assert.equal(result.content, "1 row written");
    assert.equal(upsertCalls.length, 1);
    assert.ok(!("provenance" in upsertCalls[0].rows[0]));
  });

  it("WriteEvidence passes a valid provenance value through", async () => {
    const config = createMockConfig();
    const upsertCalls = [];
    const supabase = createGroundedSupabase(upsertCalls);
    const pathwayClient = createMockPathwayClient();
    const service = new MapService(config, { supabase, pathwayClient });
    const result = await service.WriteEvidence({
      ...validEvidenceReq,
      provenance: "agent_attested",
    });
    assert.equal(result.content, "1 row written");
    assert.equal(upsertCalls.length, 1);
    assert.equal(upsertCalls[0].rows[0].provenance, "agent_attested");
  });

  it("WriteEvidence rejects an invalid provenance before insert", async () => {
    const config = createMockConfig();
    const upsertCalls = [];
    const supabase = createGroundedSupabase(upsertCalls);
    const pathwayClient = createMockPathwayClient();
    const service = new MapService(config, { supabase, pathwayClient });
    await assert.rejects(
      () =>
        service.WriteEvidence({ ...validEvidenceReq, provenance: "made_up" }),
      /Invalid provenance "made_up"\. Must be one of:/,
    );
    assert.equal(upsertCalls.length, 0);
  });
});
