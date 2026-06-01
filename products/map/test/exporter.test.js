/**
 * Exporter tests — verify that exportAll writes one HTML microdata file per
 * base entity into the expected directory tree, that re-running is
 * idempotent, and that stale entries are removed before writing.
 */

import { test, describe, beforeEach, afterEach } from "node:test";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import assert from "node:assert";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import * as fsp from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MicrodataRdfParser } from "microdata-rdf-streaming-parser";

import { Exporter } from "../src/exporter.js";
import { createRenderer } from "../src/renderer.js";
import { VOCAB_BASE } from "../src/iri.js";
import { DATA } from "./fixtures.js";

const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";

let outputDir;

beforeEach(() => {
  outputDir = mkdtempSync(join(tmpdir(), "map-exporter-"));
});

afterEach(() => {
  rmSync(outputDir, { recursive: true, force: true });
});

async function parseQuads(html) {
  const parser = new MicrodataRdfParser({
    baseIRI: "https://example.invalid/",
    contentType: "text/html",
  });
  parser.write(html);
  parser.end();
  const quads = [];
  for await (const quad of parser) {
    quads.push(quad);
  }
  return quads;
}

describe("Exporter", () => {
  test("writes one file per base entity into <outputDir>/pathway/<type>/<id>.html", async () => {
    const exporter = new Exporter(fsp, createRenderer(createDefaultRuntime()));
    const result = await exporter.exportAll({ data: DATA, outputDir });

    assert.strictEqual(result.errors.length, 0);

    const expected = [
      "skill/planning.html",
      "capability/delivery.html",
      "level/J040.html",
      "behaviour/systems_thinking.html",
      "discipline/software_engineering.html",
      "track/platform.html",
      "driver/quality.html",
      "tool/linear.html",
    ];

    for (const rel of expected) {
      const path = join(outputDir, "pathway", rel);
      assert.ok(existsSync(path), `expected ${rel} to exist`);
    }
  });

  test("rendered files parse with fit: vocabulary subjects", async () => {
    const exporter = new Exporter(fsp, createRenderer(createDefaultRuntime()));
    await exporter.exportAll({ data: DATA, outputDir });

    const html = await fsp.readFile(
      join(outputDir, "pathway", "skill", "planning.html"),
      "utf-8",
    );
    const quads = await parseQuads(html);
    assert.ok(
      quads.some(
        (q) =>
          q.predicate.value === RDF_TYPE &&
          q.object.value === `${VOCAB_BASE}Skill`,
      ),
    );
  });

  test("running twice yields byte-identical output", async () => {
    const exporter = new Exporter(fsp, createRenderer(createDefaultRuntime()));
    await exporter.exportAll({ data: DATA, outputDir });

    const path = join(outputDir, "pathway", "skill", "planning.html");
    const first = await fsp.readFile(path, "utf-8");

    await exporter.exportAll({ data: DATA, outputDir });
    const second = await fsp.readFile(path, "utf-8");

    assert.strictEqual(first, second);
  });

  test("clears stale files in pathway/ before writing", async () => {
    const ghostDir = join(outputDir, "pathway", "skill");
    await fsp.mkdir(ghostDir, { recursive: true });
    await fsp.writeFile(join(ghostDir, "ghost.html"), "ghost");

    const exporter = new Exporter(fsp, createRenderer(createDefaultRuntime()));
    await exporter.exportAll({ data: DATA, outputDir });

    assert.strictEqual(existsSync(join(ghostDir, "ghost.html")), false);
  });
});
