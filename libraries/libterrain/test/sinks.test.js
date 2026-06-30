import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createMockFs, createTestRuntime } from "@forwardimpact/libmock";
import { join } from "path";
import { format } from "prettier";
import {
  NullSink,
  WriteSink,
  LoadSink,
  CompositeSink,
  InspectSink,
  NullProseCacheSink,
  ProseCacheWriteSink,
} from "../src/sinks.js";

const ROOT = "/monorepo";

function makeLogger() {
  return {
    info: () => {},
    debug: () => {},
    warn: () => {},
    error: () => {},
  };
}

// Build an in-memory fs (optionally pre-seeded) and a runtime over it. WriteSink
// performs every write/clean through `runtime.fs`, so reads of the seeded map
// back-verify what the sink materialised — no real tmpdir needed.
function fsRuntime(seed = {}) {
  const fs = createMockFs(seed);
  return { fs, runtime: createTestRuntime({ fs }) };
}

function makeResult(overrides = {}) {
  return {
    files: new Map(),
    rawDocuments: new Map(),
    entities: { domain: "test.example" },
    validation: { checks: [], failures: 0, passed: true },
    stats: {
      prose: { hits: 0, misses: 0, generated: 0 },
      files: 0,
      rawDocuments: 0,
    },
    ...overrides,
  };
}

describe("NullSink", () => {
  test("returns zeroed stats and writes nothing", async () => {
    const { fs } = fsRuntime();
    const result = makeResult({
      files: new Map([["data/knowledge/x.html", "<p>hi</p>"]]),
    });
    const stats = await new NullSink().accept(result);
    assert.deepStrictEqual(stats, {
      filesWritten: 0,
      rawWritten: 0,
      rawLoaded: 0,
      loadErrors: 0,
      loadErrorMessages: [],
    });
    assert.strictEqual(fs.existsSync(join(ROOT, "data")), false);
  });
});

describe("WriteSink", () => {
  test("formats with Prettier, writes files, raw, and evidence", async () => {
    const { fs, runtime } = fsRuntime();
    const result = makeResult({
      files: new Map([
        [
          "data/knowledge/x.html",
          "<!doctype html><html><body><p>hi</p></body></html>",
        ],
      ]),
      rawDocuments: new Map([["alice/email-1.md", "# Email\n\nbody"]]),
      entities: {
        domain: "test.example",
        activity: { evidence: { events: [{ id: 1 }] } },
      },
    });

    const sink = new WriteSink({
      outputRoot: ROOT,
      prettierFn: format,
      runtime,
      logger: makeLogger(),
    });
    const stats = await sink.accept(result);

    assert.strictEqual(stats.filesWritten, 1);
    assert.strictEqual(stats.rawWritten, 1);
    assert.strictEqual(stats.rawLoaded, 0);

    const html = await fs.readFile(
      join(ROOT, "data/knowledge/x.html"),
      "utf-8",
    );
    assert.match(html, /<!doctype html>/);
    // Prettier reformats the single-line input across multiple lines.
    assert.ok(
      html.split("\n").length > 2,
      "html should be multi-line after Prettier",
    );

    const raw = await fs.readFile(
      join(ROOT, "data/activity/raw/alice/email-1.md"),
      "utf-8",
    );
    assert.match(raw, /# Email/);

    const evidence = JSON.parse(
      await fs.readFile(join(ROOT, "data/activity/evidence.json"), "utf-8"),
    );
    assert.deepStrictEqual(evidence, { events: [{ id: 1 }] });
  });

  test("cleans top-level subdirectories of files before writing", async () => {
    // Pre-seed a stale file that the cleanup step should delete.
    const stalePath = join(ROOT, "data/knowledge/stale.html");
    const { fs, runtime } = fsRuntime({ [stalePath]: "<p>stale</p>" });
    const result = makeResult({
      files: new Map([["data/knowledge/new.html", "<p>new</p>"]]),
    });

    const sink = new WriteSink({
      outputRoot: ROOT,
      prettierFn: format,
      runtime,
      logger: makeLogger(),
    });
    await sink.accept(result);

    assert.strictEqual(fs.existsSync(stalePath), false);
    assert.strictEqual(
      fs.existsSync(join(ROOT, "data/knowledge/new.html")),
      true,
    );
  });

  test("skips evidence sidecar when entities.activity.evidence is absent", async () => {
    const { fs, runtime } = fsRuntime();
    const result = makeResult({
      files: new Map([["data/knowledge/x.html", "<p>hi</p>"]]),
    });
    const sink = new WriteSink({
      outputRoot: ROOT,
      prettierFn: format,
      runtime,
      logger: makeLogger(),
    });
    await sink.accept(result);
    assert.strictEqual(
      fs.existsSync(join(ROOT, "data/activity/evidence.json")),
      false,
    );
  });

  test("writes under a caller-chosen outputRoot, not the project root", async () => {
    const BUILD = "/build/.synthetic";
    const { fs, runtime } = fsRuntime();
    const result = makeResult({
      files: new Map([["products/polaris/site/seed.sql", "select 1;\n"]]),
    });
    const sink = new WriteSink({
      outputRoot: BUILD,
      prettierFn: format,
      runtime,
      logger: makeLogger(),
    });
    await sink.accept(result);

    assert.ok(
      fs.existsSync(join(BUILD, "products/polaris/site/seed.sql")),
      "file should land under the output root",
    );
    assert.strictEqual(
      fs.existsSync(join(ROOT, "products/polaris/site/seed.sql")),
      false,
      "nothing should be written under the project root",
    );
  });

  test("refuses to clean a directory that escapes the output root", async () => {
    const { runtime } = fsRuntime();
    // A relative path climbing out of the output root would otherwise resolve
    // the clean target to a sibling of the root — the catastrophic rm the guard
    // exists to prevent.
    const result = makeResult({
      files: new Map([["../../evil/x.txt", "boom"]]),
    });
    const sink = new WriteSink({
      outputRoot: ROOT,
      prettierFn: format,
      runtime,
      logger: makeLogger(),
    });
    await assert.rejects(() => sink.accept(result), /escapes output root/);
  });

  test("refuses a write whose full path escapes even when its top dir stays inside", async () => {
    const { runtime } = fsRuntime();
    // "a/b" stays inside so the clean guard passes, but the full path escapes.
    const result = makeResult({
      files: new Map([["a/b/../../../../etc/passwd", "boom"]]),
    });
    const sink = new WriteSink({
      outputRoot: ROOT,
      prettierFn: format,
      runtime,
      logger: makeLogger(),
    });
    await assert.rejects(() => sink.accept(result), /escapes output root/);
  });
});

describe("LoadSink", () => {
  test("uploads formatted raw to Supabase without touching the filesystem", async () => {
    const { fs, runtime } = fsRuntime();
    const result = makeResult({
      files: new Map([["data/knowledge/x.html", "<p>x</p>"]]),
      rawDocuments: new Map([["alice/note.md", "# Note\n\ntext"]]),
    });

    const calls = [];
    const loadToSupabase = async (_supabase, rawDocs) => {
      for (const [path, content] of rawDocs) {
        calls.push({ path, content });
      }
      return { loaded: rawDocs.size, errors: [] };
    };

    const sink = new LoadSink({
      prettierFn: format,
      runtime,
      supabase: { id: "stub" },
      loadToSupabase,
      logger: makeLogger(),
    });
    const stats = await sink.accept(result);

    // LoadSink owns Supabase upload only — no local writes.
    assert.strictEqual(stats.filesWritten, 0);
    assert.strictEqual(stats.rawLoaded, 1);
    assert.strictEqual(stats.rawWritten, 0);
    assert.strictEqual(calls.length, 1);
    const expected = await format("# Note\n\ntext", {
      parser: "markdown",
      filepath: "alice/note.md",
    });
    assert.strictEqual(calls[0].content, expected);
    // No local writes: the in-memory fs stays empty under the root.
    assert.strictEqual(fs.readdirSync(ROOT).length, 0);
  });

  test("surfaces Supabase load errors via loadErrorMessages", async () => {
    const result = makeResult({
      rawDocuments: new Map([["alice/note.md", "body"]]),
    });

    const loadToSupabase = async () => ({
      loaded: 0,
      errors: ["bucket missing"],
    });

    const sink = new LoadSink({
      prettierFn: format,
      supabase: { id: "stub" },
      loadToSupabase,
      logger: makeLogger(),
    });
    const stats = await sink.accept(result);

    assert.strictEqual(stats.loadErrors, 1);
    assert.deepStrictEqual(stats.loadErrorMessages, ["bucket missing"]);
  });

  test("returns zeroed stats when there are no raw documents", async () => {
    const result = makeResult({
      files: new Map([["data/knowledge/x.html", "<p>x</p>"]]),
    });
    let called = false;
    const loadToSupabase = async () => {
      called = true;
      return { loaded: 0, errors: [] };
    };
    const sink = new LoadSink({
      prettierFn: format,
      supabase: { id: "stub" },
      loadToSupabase,
      logger: makeLogger(),
    });
    const stats = await sink.accept(result);
    assert.strictEqual(stats.rawLoaded, 0);
    assert.strictEqual(called, false);
  });
});

describe("CompositeSink", () => {
  test("merges stats from each composed sink in order", async () => {
    const { fs, runtime } = fsRuntime();
    const result = makeResult({
      files: new Map([["data/knowledge/x.html", "<p>x</p>"]]),
      rawDocuments: new Map([["alice/note.md", "# n\n\nbody"]]),
    });

    const writeSink = new WriteSink({
      outputRoot: ROOT,
      prettierFn: format,
      runtime,
      logger: makeLogger(),
    });
    const loadSink = new LoadSink({
      prettierFn: format,
      runtime,
      supabase: { id: "stub" },
      loadToSupabase: async (_s, raw) => ({ loaded: raw.size, errors: [] }),
      logger: makeLogger(),
    });

    const stats = await new CompositeSink([writeSink, loadSink]).accept(result);
    assert.strictEqual(stats.filesWritten, 1);
    assert.strictEqual(stats.rawWritten, 1);
    assert.strictEqual(stats.rawLoaded, 1);
    assert.strictEqual(stats.loadErrors, 0);
    // Composite preserves the local copy written by WriteSink.
    assert.ok(fs.existsSync(join(ROOT, "data/activity/raw/alice/note.md")));
  });

  test("rejects empty sink list", () => {
    assert.throws(() => new CompositeSink([]), /non-empty/);
  });
});

describe("InspectSink", () => {
  test("writes the named stage's output to stdout and zeroes stats", async () => {
    const chunks = [];
    const stdout = { write: (s) => chunks.push(s) };
    const result = {
      ...makeResult(),
      stage: "entities",
      output: { domain: "x.example", count: 3 },
    };
    const stats = await new InspectSink({ stdout }).accept(result);
    assert.deepStrictEqual(stats, {
      filesWritten: 0,
      rawWritten: 0,
      rawLoaded: 0,
      loadErrors: 0,
      loadErrorMessages: [],
    });
    const text = chunks.join("");
    assert.match(text, /# stage: entities/);
    assert.match(text, /"domain": "x\.example"/);
  });

  test("serializes Maps and Sets in the inspected output", async () => {
    const chunks = [];
    const stdout = { write: (s) => chunks.push(s) };
    const result = {
      ...makeResult(),
      stage: "cache-lookup",
      output: new Map([["org_readme", "lorem"]]),
    };
    await new InspectSink({ stdout }).accept(result);
    assert.match(chunks.join(""), /"org_readme": "lorem"/);
  });
});

describe("ProseCacheWriteSink", () => {
  test("flush() persists cache state to disk", () => {
    const cachePath = "/prose/cache.json";
    const cache = {
      dirty: true,
      save() {
        this.savedTo = cachePath;
        this.saveCount = (this.saveCount || 0) + 1;
      },
    };
    const sink = new ProseCacheWriteSink({ cache });
    sink.flush();
    sink.flush();
    assert.strictEqual(cache.saveCount, 2);
    assert.strictEqual(cache.savedTo, cachePath);
  });

  test("constructor requires a cache", () => {
    assert.throws(() => new ProseCacheWriteSink({}), /cache is required/);
  });
});

describe("NullProseCacheSink", () => {
  test("flush() is a no-op", () => {
    const sink = new NullProseCacheSink();
    sink.flush(); // does not throw
    sink.flush();
  });
});
