import { test, describe } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

import protoLoader from "@grpc/proto-loader";
import mustache from "mustache";

import { CodegenBase, CodegenMetadata } from "@forwardimpact/libcodegen";
import { createTestRuntime } from "@forwardimpact/libmock";

const projectRoot = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../../..",
);

function discoverProtoDirs() {
  const dirs = [];
  const scopeDir = path.join(projectRoot, "node_modules", "@forwardimpact");
  if (fs.existsSync(scopeDir)) {
    for (const name of fs.readdirSync(scopeDir)) {
      const protoDir = path.join(scopeDir, name, "proto");
      if (fs.existsSync(protoDir) && fs.statSync(protoDir).isDirectory()) {
        dirs.push(fs.realpathSync(protoDir));
      }
    }
  }
  const own = path.join(projectRoot, "proto");
  if (fs.existsSync(own)) dirs.push(own);
  return dirs;
}

function createBase() {
  const protoDirs = discoverProtoDirs();
  return new CodegenBase(
    protoDirs,
    projectRoot,
    path,
    mustache,
    protoLoader,
    fs,
    createTestRuntime(),
  );
}

describe("CodegenBase.parseMetadata", () => {
  test("returns null for non-service protos", () => {
    const base = createBase();
    const commonProto = base
      .collectProtoFiles()
      .find((f) => f.endsWith("common.proto"));
    const result = base.parseMetadata(commonProto);
    assert.strictEqual(result, null);
  });

  test("returns methods with fields for service protos", () => {
    const base = createBase();
    const graphProto = base
      .collectProtoFiles()
      .find((f) => f.endsWith("graph.proto"));
    const result = base.parseMetadata(graphProto);
    assert.ok(result);
    assert.strictEqual(result.packageName, "graph");
    assert.strictEqual(result.serviceName, "Graph");
    assert.ok(result.methods.QueryByPattern);
    assert.ok(result.methods.GetOntology);
    assert.ok(result.methods.GetSubjects);
  });

  test("fields have correct type strings", () => {
    const base = createBase();
    const graphProto = base
      .collectProtoFiles()
      .find((f) => f.endsWith("graph.proto"));
    const result = base.parseMetadata(graphProto);
    const fields = result.methods.QueryByPattern.fields;
    assert.strictEqual(fields.subject.type, "string");
    assert.strictEqual(fields.filter.type, "message");
  });

  test("optional is true for fields with explicit optional keyword", () => {
    const base = createBase();
    const graphProto = base
      .collectProtoFiles()
      .find((f) => f.endsWith("graph.proto"));
    const result = base.parseMetadata(graphProto);
    assert.strictEqual(result.methods.GetSubjects.fields.type.optional, true);
    assert.strictEqual(
      result.methods.QueryByPattern.fields.filter.optional,
      true,
    );
    assert.strictEqual(
      result.methods.QueryByPattern.fields.subject.optional,
      false,
    );
  });

  test("repeated is true for repeated fields", () => {
    const base = createBase();
    const vectorProto = base
      .collectProtoFiles()
      .find((f) => f.endsWith("vector.proto"));
    const result = base.parseMetadata(vectorProto);
    assert.strictEqual(
      result.methods.SearchContent.fields.input.repeated,
      true,
    );
  });

  test("description is populated from proto field comments", () => {
    const base = createBase();
    const graphProto = base
      .collectProtoFiles()
      .find((f) => f.endsWith("graph.proto"));
    const result = base.parseMetadata(graphProto);
    assert.ok(result.methods.QueryByPattern.fields.subject.description);
    assert.match(
      result.methods.QueryByPattern.fields.subject.description,
      /wildcard/,
    );
  });

  test("description is null when proto field has no comment", () => {
    const base = createBase();
    const graphProto = base
      .collectProtoFiles()
      .find((f) => f.endsWith("graph.proto"));
    const result = base.parseMetadata(graphProto);
    assert.strictEqual(
      result.methods.QueryByPattern.fields.filter.description,
      null,
    );
  });

  test("field names use snake_case (matching fromObject)", () => {
    const base = createBase();
    const pathwayProto = base
      .collectProtoFiles()
      .find((f) => f.endsWith("pathway.proto"));
    const result = base.parseMetadata(pathwayProto);
    const fields = result.methods.DescribeProgression.fields;
    assert.ok(fields.from_level, "expected from_level field");
    assert.ok(fields.to_level, "expected to_level field");
  });
});

describe("CodegenMetadata", () => {
  test("run writes metadata.js with valid ESM export", () => {
    const base = createBase();
    const gen = new CodegenMetadata(base);
    const tmpDir = path.join(projectRoot, "generated");
    gen.run(tmpDir);

    const metaPath = path.join(tmpDir, "types", "metadata.js");
    assert.ok(fs.existsSync(metaPath));

    const content = fs.readFileSync(metaPath, "utf8");
    assert.match(content, /^\/\*\* @generated by fit-codegen/);
    assert.match(content, /export const metadata =/);
  });
});
