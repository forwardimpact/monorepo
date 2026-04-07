/**
 * End-to-end pipeline test for the export → resource → graph flow.
 *
 * Wires the Stream A exporter into the real libresource ResourceProcessor
 * and libgraph GraphProcessor, then asserts that
 * `GraphIndex.getSubjects("fit:Skill")` returns the fixture skill's IRI.
 *
 * This is the only test that exercises foundation F2's `RDF_PREFIXES`
 * registration: the `fit:Skill` short form must expand via the N3 Store's
 * prefix table or the query degrades to a literal and misses all
 * subjects. It is also the only test that proves ResourceProcessor's
 * `ALLOWED_TYPE_PREFIXES` (foundation F1) accepts the fit: vocabulary —
 * if F1 regresses, the parser rejects every main item and no subjects are
 * loaded into the graph.
 *
 * The test uses real filesystem LocalStorage instances for both the
 * knowledge directory (from the exporter) and the graph index directory,
 * and an in-memory mock for the ResourceIndex (Map-backed) so we don't
 * need to wire libpolicy and a second storage backend.
 */

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import * as fsp from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "n3";

import { LocalStorage } from "@forwardimpact/libstorage";
import { Parser as ResourceParser } from "@forwardimpact/libresource/parser.js";
import { Skolemizer } from "@forwardimpact/libresource/skolemizer.js";
import { ResourceProcessor } from "@forwardimpact/libresource/processor/resource.js";
import { RDF_PREFIXES } from "@forwardimpact/libgraph";
import { GraphIndex } from "@forwardimpact/libgraph/index/graph.js";
import { GraphProcessor } from "@forwardimpact/libgraph/processor/graph.js";

import { Exporter } from "../src/exporter.js";
import { createRenderer } from "../src/renderer.js";
import { skillIri } from "../src/iri.js";

const SILENT_LOGGER = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

const DATA = {
  capabilities: [{ id: "delivery", name: "Delivery", description: "..." }],
  skills: [
    {
      id: "planning",
      name: "Planning",
      capability: "delivery",
      description: "Plan work.",
      proficiencyDescriptions: { working: "..." },
    },
  ],
  disciplines: [
    {
      id: "software_engineering",
      specialization: "Software Engineering",
      coreSkills: ["planning"],
      description: "...",
    },
  ],
  tracks: [],
  drivers: [],
  behaviours: [],
  levels: [
    {
      id: "J040",
      professionalTitle: "Level I",
      qualificationSummary: "Entry.",
      ordinalRank: 1,
    },
  ],
  stages: [],
};

/**
 * Minimal Map-backed ResourceIndex mock that satisfies the surface the
 * ResourceProcessor (put) and GraphProcessor (findAll, get, has) use. Keeps
 * the test self-contained — no libpolicy, no second storage backend.
 */
function createInMemoryResourceIndex() {
  const store = new Map();
  return {
    async put(resource) {
      resource.withIdentifier();
      const id = String(resource.id);
      store.set(id, resource);
    },
    async has(id) {
      return store.has(String(id));
    },
    async get(ids) {
      if (!ids) return [];
      return ids.map((id) => store.get(String(id))).filter(Boolean);
    },
    async findAll() {
      return Array.from(store.values()).map((r) => r.id);
    },
  };
}

let outputDir;
let graphDir;

beforeEach(() => {
  outputDir = mkdtempSync(join(tmpdir(), "map-pipeline-"));
  graphDir = mkdtempSync(join(tmpdir(), "map-pipeline-graph-"));
});

afterEach(() => {
  rmSync(outputDir, { recursive: true, force: true });
  rmSync(graphDir, { recursive: true, force: true });
});

describe("end-to-end export → resource → graph pipeline", () => {
  test("fit-map export → ResourceProcessor → GraphProcessor → getSubjects('fit:Skill') returns the fixture skill", async () => {
    // 1. Export to a temp knowledge dir
    const exporter = new Exporter(fsp, createRenderer());
    const { errors } = await exporter.exportAll({ data: DATA, outputDir });
    assert.strictEqual(errors.length, 0, "export should produce no errors");

    // 2. Wire LocalStorage at <tempKnowledge>/pathway/ so the resource
    //    processor walks the HTML files produced by the exporter.
    const knowledgeStorage = new LocalStorage(join(outputDir, "pathway"), fsp);

    // 3. In-memory resource index (shared between ResourceProcessor's put
    //    and GraphProcessor's findAll/get).
    const resourceIndex = createInMemoryResourceIndex();

    // 4. Real ResourceProcessor with real Parser + Skolemizer.
    const resourceParser = new ResourceParser(new Skolemizer(), SILENT_LOGGER);
    const resourceProcessor = new ResourceProcessor(
      "https://www.forwardimpact.team/schema/rdf/",
      resourceIndex,
      knowledgeStorage,
      resourceParser,
      SILENT_LOGGER,
    );
    await resourceProcessor.process(".html");

    // Sanity check: resource index has at least one resource whose Turtle
    // content mentions the fit: skill subject. Foundation F1 — if the
    // parser widening regressed, zero main items would be produced.
    const ids = await resourceIndex.findAll();
    assert.ok(ids.length > 0, "ResourceProcessor should have stored resources");
    const stored = await resourceIndex.get(ids);
    const turtle = stored.map((r) => r.content || "").join("\n");
    assert.ok(
      turtle.includes("schema/rdf/Skill"),
      "Stored Turtle should mention the fit:Skill type",
    );

    // 5. Real GraphIndex with the foundation-registered RDF_PREFIXES map.
    //    This is what makes `fit:Skill` resolvable to the full IRI.
    const graphStorage = new LocalStorage(graphDir, fsp);
    const store = new Store({ prefixes: RDF_PREFIXES });
    const graphIndex = new GraphIndex(graphStorage, store, RDF_PREFIXES);

    // 6. GraphProcessor consumes the resource index and writes into the
    //    graph index.
    const graphProcessor = new GraphProcessor(
      graphIndex,
      resourceIndex,
      SILENT_LOGGER,
    );
    await graphProcessor.process("test-actor");

    // 7. Foundation F2 check — the fit: prefix must be registered so
    //    `fit:Skill` expands to the full IRI. If this regresses, the
    //    subjects map comes back empty.
    const subjects = await graphIndex.getSubjects("fit:Skill");
    assert.ok(
      subjects.has(skillIri("planning")),
      `expected fit:Skill subjects to include ${skillIri("planning")}, got: ${[...subjects.keys()].join(", ")}`,
    );
  });
});
