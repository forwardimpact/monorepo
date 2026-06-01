import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { join } from "path";
import { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync } from "fs";
import { tmpdir } from "os";
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

function makeLogger() {
  return {
    info: () => {},
    debug: () => {},
    warn: () => {},
    error: () => {},
  };
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
    const tmpDir = mkdtempSync(join(tmpdir(), "nullsink-"));
    try {
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
      assert.strictEqual(existsSync(join(tmpDir, "data")), false);
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });
});

describe("WriteSink", () => {
  test("formats with Prettier, writes files, raw, and evidence", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "writesink-"));
    try {
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
        monorepoRoot: tmpDir,
        prettierFn: format,
        runtime: createDefaultRuntime(),
        logger: makeLogger(),
      });
      const stats = await sink.accept(result);

      assert.strictEqual(stats.filesWritten, 1);
      assert.strictEqual(stats.rawWritten, 1);
      assert.strictEqual(stats.rawLoaded, 0);

      const html = readFileSync(join(tmpDir, "data/knowledge/x.html"), "utf-8");
      assert.match(html, /<!doctype html>/);
      // Prettier reformats the single-line input across multiple lines.
      assert.ok(
        html.split("\n").length > 2,
        "html should be multi-line after Prettier",
      );

      const raw = readFileSync(
        join(tmpDir, "data/activity/raw/alice/email-1.md"),
        "utf-8",
      );
      assert.match(raw, /# Email/);

      const evidence = JSON.parse(
        readFileSync(join(tmpDir, "data/activity/evidence.json"), "utf-8"),
      );
      assert.deepStrictEqual(evidence, { events: [{ id: 1 }] });
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  test("cleans top-level subdirectories of files before writing", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "writesink-clean-"));
    try {
      const result = makeResult({
        files: new Map([["data/knowledge/new.html", "<p>new</p>"]]),
      });

      // Pre-populate a stale file that should be deleted by the cleanup step.
      const stalePath = join(tmpDir, "data/knowledge/stale.html");
      const { mkdirSync, writeFileSync } = await import("fs");
      mkdirSync(join(tmpDir, "data/knowledge"), { recursive: true });
      writeFileSync(stalePath, "<p>stale</p>");

      const sink = new WriteSink({
        monorepoRoot: tmpDir,
        prettierFn: format,
        runtime: createDefaultRuntime(),
        logger: makeLogger(),
      });
      await sink.accept(result);

      assert.strictEqual(existsSync(stalePath), false);
      assert.strictEqual(
        existsSync(join(tmpDir, "data/knowledge/new.html")),
        true,
      );
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  test("skips evidence sidecar when entities.activity.evidence is absent", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "writesink-noev-"));
    try {
      const result = makeResult({
        files: new Map([["data/knowledge/x.html", "<p>hi</p>"]]),
      });
      const sink = new WriteSink({
        monorepoRoot: tmpDir,
        prettierFn: format,
        runtime: createDefaultRuntime(),
        logger: makeLogger(),
      });
      await sink.accept(result);
      assert.strictEqual(
        existsSync(join(tmpDir, "data/activity/evidence.json")),
        false,
      );
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });
});

describe("LoadSink", () => {
  test("uploads formatted raw to Supabase without touching the filesystem", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "loadsink-"));
    try {
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
        runtime: createDefaultRuntime(),
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
      assert.strictEqual(readdirSync(tmpDir).length, 0);
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
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
    const tmpDir = mkdtempSync(join(tmpdir(), "composite-"));
    try {
      const result = makeResult({
        files: new Map([["data/knowledge/x.html", "<p>x</p>"]]),
        rawDocuments: new Map([["alice/note.md", "# n\n\nbody"]]),
      });

      const writeSink = new WriteSink({
        monorepoRoot: tmpDir,
        prettierFn: format,
        runtime: createDefaultRuntime(),
        logger: makeLogger(),
      });
      const loadSink = new LoadSink({
        prettierFn: format,
        runtime: createDefaultRuntime(),
        supabase: { id: "stub" },
        loadToSupabase: async (_s, raw) => ({ loaded: raw.size, errors: [] }),
        logger: makeLogger(),
      });

      const stats = await new CompositeSink([writeSink, loadSink]).accept(
        result,
      );
      assert.strictEqual(stats.filesWritten, 1);
      assert.strictEqual(stats.rawWritten, 1);
      assert.strictEqual(stats.rawLoaded, 1);
      assert.strictEqual(stats.loadErrors, 0);
      // Composite preserves the local copy written by WriteSink.
      assert.ok(existsSync(join(tmpDir, "data/activity/raw/alice/note.md")));
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
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
    const tmpDir = mkdtempSync(join(tmpdir(), "cachesink-"));
    try {
      const cachePath = join(tmpDir, "cache.json");
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
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
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
