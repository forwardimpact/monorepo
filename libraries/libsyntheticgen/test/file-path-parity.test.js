/**
 * Spec 820 criterion #6 — file-path parity.
 *
 * The pre-refactor pipeline produced a known set of storage paths for
 * the `MINI_TERRAIN` activity fixture. The post-refactor pipeline must
 * produce the same set. File **contents** change for the in-scope
 * prose-bearing outputs (snapshot comments, GitHub webhooks); the path
 * set must not.
 *
 * The baseline JSON was captured before any contract refactor landed
 * (see `fixtures/README.md` for the regeneration command).
 */
import { describe, test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tokenize } from "../src/dsl/tokenizer.js";
import { parse } from "../src/dsl/parser.js";
import { createSeededRNG } from "../src/engine/rng.js";
import { buildEntities } from "../src/engine/entities.js";
import { generateActivity } from "../src/engine/activity.js";
import { renderRawDocuments } from "@forwardimpact/libsyntheticrender/render/raw";
import { MINI_TERRAIN } from "./fixtures/mini-terrain.fixture.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("file-path parity against pre-refactor baseline", () => {
  test("post-refactor file paths match baseline", () => {
    const baselinePath = path.resolve(
      __dirname,
      "fixtures/file-path-baseline.json",
    );
    const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));

    const ast = parse(tokenize(MINI_TERRAIN));
    const rng = createSeededRNG(ast.seed);
    const entities = buildEntities(ast, rng);
    entities.activity = generateActivity(
      ast,
      rng,
      entities.people,
      entities.teams,
    );
    const files = renderRawDocuments(entities, undefined);
    const actual = Array.from(files.keys()).sort();

    assert.deepStrictEqual(
      actual,
      baseline,
      "post-refactor pipeline must produce the same file-path set as the captured baseline",
    );
  });
});
