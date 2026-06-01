import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { mkdtempSync, rmSync, readFileSync } from "fs";
import { tmpdir } from "os";
import {
  createDslParser,
  createEntityGenerator,
} from "@forwardimpact/libsyntheticgen";
import {
  validateCrossContent,
  Renderer,
  ContentValidator,
} from "@forwardimpact/libsyntheticrender";
import {
  ProseCache,
  ProseGenerator,
  PathwayGenerator,
} from "@forwardimpact/libsyntheticprose";
import { TemplateLoader } from "@forwardimpact/libtemplate/loader";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { Pipeline } from "../src/pipeline.js";
import { NullProseCacheSink } from "../src/sinks.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, "fixtures", "minimal.dsl");
const CLINICAL_FIXTURE_PATH = join(__dirname, "fixtures", "clinical.dsl");
const FHIR_FIXTURE_PATH = join(__dirname, "fixtures", "fhir.dsl");
const FIXTURE_PATIENT_UUID = "55555555-5555-4555-8555-555555555555";

function makeLogger() {
  return {
    info: () => {},
    debug: () => {},
    warn: () => {},
    error: () => {},
  };
}

function makePromptLoader() {
  return { load: () => "system", render: () => "user" };
}

const TEMPLATE_DIR = join(
  __dirname,
  "..",
  "..",
  "libsyntheticrender",
  "templates",
);

function makeFhirToolFactory() {
  return function () {
    return {
      checkAvailability: async () => true,
      generate: async (config) => [
        {
          name: `${config.name}_patient`,
          records: [
            {
              resourceType: "Patient",
              id: FIXTURE_PATIENT_UUID,
              name: [{ use: "official", family: "Jones", given: ["Alice"] }],
              gender: "female",
              birthDate: "1980-01-01",
            },
          ],
        },
        {
          name: `${config.name}_condition`,
          records: [
            {
              resourceType: "Condition",
              subject: { reference: `urn:uuid:${FIXTURE_PATIENT_UUID}` },
              code: {
                coding: [{ code: "diabetes_t2", display: "Type 2 Diabetes" }],
                text: "Type 2 Diabetes",
              },
              onsetDateTime: "2020-01-01",
            },
          ],
        },
      ],
    };
  };
}

function makePipelineDeps({
  mode = "no-prose",
  strict = false,
  toolFactory = null,
} = {}) {
  const tmpDir = mkdtempSync(join(tmpdir(), "pipeline-deps-"));
  const logger = makeLogger();
  const runtime = createDefaultRuntime();
  const proseCache = new ProseCache({
    runtime,
    cachePath: join(tmpDir, "cache.json"),
    logger,
  });
  const proseGenerator = new ProseGenerator({
    runtime,
    cache: proseCache,
    mode,
    strict,
    promptLoader: makePromptLoader(),
    logger,
  });
  return {
    tmpDir,
    deps: {
      dslParser: createDslParser(),
      entityGenerator: createEntityGenerator(logger, runtime),
      proseCache,
      proseGenerator,
      pathwayGenerator: new PathwayGenerator(proseGenerator, logger),
      renderer: new Renderer(
        new TemplateLoader(TEMPLATE_DIR, createDefaultRuntime()),
        logger,
        runtime,
      ),
      validator: new ContentValidator(logger),
      proseCacheSink: new NullProseCacheSink(),
      toolFactory,
      runtime,
      logger,
    },
  };
}

describe("Pipeline integration", () => {
  test("parses minimal DSL fixture", () => {
    const source = readFileSync(FIXTURE_PATH, "utf-8");
    const parser = createDslParser();
    const ast = parser.parse(source);

    assert.strictEqual(ast.domain, "test.example");
    assert.strictEqual(ast.industry, "technology");
    assert.ok(ast.people);
    assert.ok(ast.teams.length > 0);
    assert.ok(ast.projects.length > 0);
  });

  test("generates entities from minimal DSL", () => {
    const source = readFileSync(FIXTURE_PATH, "utf-8");
    const parser = createDslParser();
    const ast = parser.parse(source);
    const generator = createEntityGenerator(
      makeLogger(),
      createDefaultRuntime(),
    );
    const entities = generator.generate(ast);

    assert.ok(entities.orgs.length > 0);
    assert.ok(entities.departments.length > 0);
    assert.ok(entities.teams.length > 0);
    assert.ok(entities.people.length > 0);
    assert.ok(entities.projects.length > 0);
    assert.ok(entities.domain);
  });

  test("entity IRIs use consistent /id/ namespace", () => {
    const source = readFileSync(FIXTURE_PATH, "utf-8");
    const parser = createDslParser();
    const ast = parser.parse(source);
    const generator = createEntityGenerator(
      makeLogger(),
      createDefaultRuntime(),
    );
    const entities = generator.generate(ast);

    for (const org of entities.orgs) {
      assert.ok(org.iri.includes("/id/org/"), `Bad org IRI: ${org.iri}`);
    }
    for (const dept of entities.departments) {
      assert.ok(
        dept.iri.includes("/id/department/"),
        `Bad dept IRI: ${dept.iri}`,
      );
    }
    for (const team of entities.teams) {
      assert.ok(team.iri.includes("/id/team/"), `Bad team IRI: ${team.iri}`);
    }
    for (const person of entities.people) {
      assert.ok(
        person.iri.includes("/id/person/"),
        `Bad person IRI: ${person.iri}`,
      );
    }
    for (const proj of entities.projects) {
      assert.ok(
        proj.iri.includes("/id/project/"),
        `Bad project IRI: ${proj.iri}`,
      );
    }
  });

  test("constructor requires both proseCache and proseGenerator", () => {
    const { tmpDir, deps } = makePipelineDeps();
    try {
      assert.throws(
        () => new Pipeline({ ...deps, proseCache: null }),
        /proseCache is required/,
      );
      assert.throws(
        () => new Pipeline({ ...deps, proseGenerator: null }),
        /proseGenerator is required/,
      );
      // Happy path constructs without throwing.
      assert.ok(new Pipeline(deps));
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  test("run to write terminal in no-prose mode aggregates stats", async () => {
    const { tmpDir, deps } = makePipelineDeps({ mode: "no-prose" });
    try {
      const pipeline = new Pipeline(deps);
      const result = await pipeline.run({
        storyPath: FIXTURE_PATH,
        terminal: "write",
      });

      // Stats shape: hits/misses/missKeys from ProseCache, generated from ProseGenerator.
      assert.deepStrictEqual(Object.keys(result.stats.prose).sort(), [
        "generated",
        "hits",
        "missKeys",
        "misses",
      ]);
      assert.strictEqual(result.stats.prose.generated, 0);
      // No-prose mode short-circuits before any cache read.
      assert.strictEqual(result.stats.prose.hits, 0);
      assert.strictEqual(result.stats.prose.misses, 0);
      assert.strictEqual(result.stats.prose.missKeys.size, 0);
      assert.ok(result.files.size > 0);
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  test("check verb walks only cache-lookup closure", async () => {
    const { tmpDir, deps } = makePipelineDeps({ mode: "no-prose" });
    try {
      const pipeline = new Pipeline(deps);
      const result = await pipeline.run({
        storyPath: FIXTURE_PATH,
        terminal: "cache-lookup",
      });

      // Only the four nodes back from cache-lookup should run.
      assert.deepStrictEqual([...result.ran].sort(), [
        "cache-lookup",
        "entities",
        "parse",
        "prose-keys",
      ]);
      // No render/validate side effects.
      assert.strictEqual(result.files.size, 0);
      assert.strictEqual(result.validation.checks.length, 0);
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  test("validate verb pulls datasets via skeleton → fhir-cross-ref", async () => {
    const { tmpDir, deps } = makePipelineDeps({ mode: "no-prose" });
    try {
      const pipeline = new Pipeline(deps);
      const result = await pipeline.run({
        storyPath: FIXTURE_PATH,
        terminal: "validate",
      });

      assert.ok(result.ran.has("validate"));
      assert.ok(result.ran.has("enriched"));
      // skeleton depends on fhir-cross-ref → datasets. With no toolFactory
      // wired, `datasets` short-circuits and the extra work stays O(1). When
      // Synthea IS configured but no `fhir_microdata_html` output is declared,
      // `datasets` still runs fully (and serializes ahead of `skeleton`); the
      // cost is accepted as the alternative to a stateful post-render mutation pass.
      assert.ok(result.ran.has("datasets"));
      assert.ok(result.ran.has("fhir-cross-ref"));
      assert.ok(!result.ran.has("write"));
      assert.ok(!result.ran.has("raw"));
      assert.ok(!result.ran.has("markdown"));
      assert.ok(!result.ran.has("pathway"));
      assert.ok(!result.ran.has("fhir-microdata-html"));
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  test("run rejects unknown terminal stage", async () => {
    const { tmpDir, deps } = makePipelineDeps({ mode: "no-prose" });
    try {
      const pipeline = new Pipeline(deps);
      await assert.rejects(
        () => pipeline.run({ storyPath: FIXTURE_PATH, terminal: "nonsense" }),
        /Unknown stage 'nonsense'/,
      );
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  test("clinical-output produces zero files when no clinical block", async () => {
    const { tmpDir, deps } = makePipelineDeps({ mode: "no-prose" });
    try {
      const pipeline = new Pipeline(deps);
      const result = await pipeline.run({
        storyPath: FIXTURE_PATH,
        terminal: "clinical-output",
      });
      assert.strictEqual(result.output.files.size, 0);
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  test("clinical-output renders SQL and JSONL files", async () => {
    const { tmpDir, deps } = makePipelineDeps({ mode: "no-prose" });
    try {
      const pipeline = new Pipeline(deps);
      const result = await pipeline.run({
        storyPath: CLINICAL_FIXTURE_PATH,
        terminal: "clinical-output",
      });
      const paths = [...result.output.files.keys()];
      assert.ok(
        paths.some((p) => p.startsWith("bn_") && p.endsWith(".sql")),
        `Expected SQL migration files, got: ${paths.join(", ")}`,
      );
      assert.ok(
        paths.includes("out/clinical.jsonl"),
        `Expected embeddings JSONL, got: ${paths.join(", ")}`,
      );
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  test("write stage merges clinical output alongside other files", async () => {
    const { tmpDir, deps } = makePipelineDeps({ mode: "no-prose" });
    try {
      const pipeline = new Pipeline(deps);
      const result = await pipeline.run({
        storyPath: CLINICAL_FIXTURE_PATH,
        terminal: "write",
      });
      const paths = [...result.files.keys()];
      assert.ok(paths.some((p) => p.startsWith("bn_") && p.endsWith(".sql")));
      assert.ok(paths.includes("out/clinical.jsonl"));
      // Existing knowledge files still produced
      assert.ok(paths.some((p) => p.startsWith("data/knowledge/")));
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  test("write merges fhir_microdata_html files when wired", async () => {
    const { tmpDir, deps } = makePipelineDeps({
      mode: "no-prose",
      toolFactory: makeFhirToolFactory(),
    });
    try {
      const pipeline = new Pipeline(deps);
      const result = await pipeline.run({
        storyPath: FHIR_FIXTURE_PATH,
        terminal: "write",
      });
      assert.ok(
        result.files.has(`data/patients/${FIXTURE_PATIENT_UUID}.html`),
        "expected per-patient HTML file",
      );
      assert.ok(
        result.files.has("data/patients/index.html"),
        "expected patient index.html",
      );
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  test("cross-content validation passes on generated entities", () => {
    const source = readFileSync(FIXTURE_PATH, "utf-8");
    const parser = createDslParser();
    const ast = parser.parse(source);
    const generator = createEntityGenerator(
      makeLogger(),
      createDefaultRuntime(),
    );
    const entities = generator.generate(ast);
    const result = validateCrossContent(entities);

    // Minimal fixture has no snapshots block, so snapshot checks are expected to fail
    const snapshotChecks = new Set([
      "getdx_snapshots_list_response",
      "getdx_snapshots_info_responses",
    ]);
    const failures = result.checks.filter(
      (c) => !c.passed && !snapshotChecks.has(c.name),
    );
    if (failures.length > 0) {
      const names = failures.map((f) => f.name).join(", ");
      assert.fail(`Validation failures: ${names}`);
    }
  });
});
