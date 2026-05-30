/**
 * Sinks — accept a pipeline result and apply side-effects.
 *
 * The pipeline returns unformatted bytes; the sink decides what to do with
 * them. Prettier formatting lives here, not in the pipeline.
 *
 * Every sink's `accept(result)` returns the same stats shape:
 * { filesWritten, rawWritten, rawLoaded, loadErrors, loadErrorMessages }.
 *
 * @module libterrain/sinks
 */

import { join, dirname } from "path";
import {
  ContentFormatter,
  formatContent,
} from "@forwardimpact/libsyntheticrender";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

const ZERO_STATS = {
  filesWritten: 0,
  rawWritten: 0,
  rawLoaded: 0,
  loadErrors: 0,
  loadErrorMessages: [],
};

/** No-op sink that discards pipeline output and returns zero stats. */
export class NullSink {
  /** Ignore the result and return an empty stats object. */
  async accept(_result) {
    return { ...ZERO_STATS };
  }
}

/** Sink that formats pipeline output with Prettier and writes files to disk under the monorepo root. */
export class WriteSink {
  /**
   * @param {{ monorepoRoot: string, prettierFn: Function, logger: object, runtime?: import('@forwardimpact/libutil/runtime').Runtime }} options
   */
  constructor({ monorepoRoot, prettierFn, logger, runtime }) {
    if (!monorepoRoot) throw new Error("monorepoRoot is required");
    if (!prettierFn) throw new Error("prettierFn is required");
    if (!logger) throw new Error("logger is required");
    this.monorepoRoot = monorepoRoot;
    this.formatter = new ContentFormatter(prettierFn, logger);
    this.logger = logger;
    // Fall back to the production runtime for BC when no runtime is injected.
    this._fs = (runtime ?? createDefaultRuntime()).fs;
  }

  /** Format and write generated files, raw documents, and evidence to disk. */
  async accept(result) {
    const formattedFiles = await this.formatter.format(result.files);
    const formattedRaw = await this.formatter.format(result.rawDocuments);
    this.logger.info(
      "format",
      `Formatted ${formattedFiles.size} files, ${formattedRaw.size} raw documents`,
    );

    const filesWritten = await writeFiles(
      formattedFiles,
      this.monorepoRoot,
      this._fs,
    );

    let rawWritten = 0;
    if (formattedRaw.size > 0) {
      await writeRawLocally(formattedRaw, this.monorepoRoot, this._fs);
      rawWritten = formattedRaw.size;
    }

    const evidence = result.entities?.activity?.evidence;
    if (evidence) {
      const evidencePath = join(
        this.monorepoRoot,
        "data/activity/evidence.json",
      );
      await this._fs.mkdir(dirname(evidencePath), { recursive: true });
      const formatted = await formatContent(
        evidencePath,
        JSON.stringify(evidence, null, 2),
      );
      await this._fs.writeFile(evidencePath, formatted);
    }

    return { ...ZERO_STATS, filesWritten, rawWritten };
  }
}

/**
 * Uploads raw documents to Supabase Storage. Owns no file-system writes;
 * `build --load` composes this with `WriteSink` so the local copy and the
 * uploaded copy stay byte-identical (both formatted by Prettier).
 */
export class LoadSink {
  /**
   * @param {{ prettierFn: Function, supabase: object, loadToSupabase: Function, logger: object }} options
   */
  constructor({ prettierFn, supabase, loadToSupabase, logger }) {
    if (!prettierFn) throw new Error("prettierFn is required");
    if (!supabase) throw new Error("supabase is required");
    if (!loadToSupabase) throw new Error("loadToSupabase is required");
    if (!logger) throw new Error("logger is required");
    this.formatter = new ContentFormatter(prettierFn, logger);
    this.supabase = supabase;
    this.loadToSupabase = loadToSupabase;
    this.logger = logger;
  }

  /** Format raw documents and upload them to Supabase Storage. */
  async accept(result) {
    if (result.rawDocuments.size === 0) {
      return { ...ZERO_STATS };
    }
    const formattedRaw = await this.formatter.format(result.rawDocuments);
    const loadResult = await this.loadToSupabase(this.supabase, formattedRaw);
    return {
      ...ZERO_STATS,
      rawLoaded: loadResult.loaded,
      loadErrors: loadResult.errors.length,
      loadErrorMessages: loadResult.errors,
    };
  }
}

/**
 * Composes multiple sinks into one. Each sink runs in declared order over
 * the same pipeline result; their stats are merged. Used by `build --load`
 * to compose `WriteSink + LoadSink` without re-introducing a monolithic
 * sink that owns both responsibilities.
 */
export class CompositeSink {
  /** Store the ordered array of child sinks to delegate to. */
  constructor(sinks) {
    if (!Array.isArray(sinks) || sinks.length === 0) {
      throw new Error("CompositeSink requires a non-empty sinks array");
    }
    this.sinks = sinks;
  }

  /** Run each child sink in declared order and merge their stats into one result. */
  async accept(result) {
    const merged = { ...ZERO_STATS, loadErrorMessages: [] };
    for (const sink of this.sinks) {
      const stats = await sink.accept(result);
      merged.filesWritten += stats.filesWritten;
      merged.rawWritten += stats.rawWritten;
      merged.rawLoaded += stats.rawLoaded;
      merged.loadErrors += stats.loadErrors;
      if (stats.loadErrorMessages?.length) {
        merged.loadErrorMessages.push(...stats.loadErrorMessages);
      }
    }
    return merged;
  }
}

/**
 * InspectSink — print a single named DAG node's output. The result's
 * `stage` and `output` fields already carry that, so the sink just
 * formats it for stdout.
 */
export class InspectSink {
  /**
   * @param {{ stdout?: { write: (s: string) => void } }} [options]
   */
  constructor({ stdout } = {}) {
    this.stdout = stdout;
  }

  /** Serialize the terminal stage's output as JSON and write it to stdout. */
  async accept(result) {
    const payload = serializeForInspect(result.output);
    if (this.stdout) {
      this.stdout.write(`# stage: ${result.stage}\n`);
      this.stdout.write(payload + "\n");
    }
    return { ...ZERO_STATS };
  }
}

function serializeForInspect(value) {
  return JSON.stringify(value, replacer, 2);
}

function replacer(_key, value) {
  if (value instanceof Map) return Object.fromEntries(value);
  if (value instanceof Set) return [...value];
  return value;
}

/** No-op prose cache sink that skips persistence. */
export class NullProseCacheSink {
  /** Do nothing — cache entries are intentionally discarded. */
  flush() {}
}

/** Prose cache sink that persists generated cache entries to disk when flushed. */
export class ProseCacheWriteSink {
  /**
   * @param {{ cache: import('@forwardimpact/libsyntheticprose').ProseCache }} options
   */
  constructor({ cache }) {
    if (!cache) throw new Error("cache is required");
    this.cache = cache;
  }

  /** Write all accumulated prose cache entries to the cache file on disk. */
  flush() {
    this.cache.save();
  }
}

/**
 * Write a Map of relative paths → content under the monorepo root. Cleans
 * each top-level subdirectory before writing so removed entities don't linger.
 */
async function writeFiles(files, monorepoRoot, fs) {
  const generatedDirs = new Set();
  for (const relPath of files.keys()) {
    const parts = relPath.split("/");
    if (parts.length >= 2) {
      generatedDirs.add(join(monorepoRoot, parts[0], parts[1]));
    }
  }
  for (const dir of generatedDirs) {
    await fs.rm(dir, { recursive: true, force: true });
  }
  for (const [relPath, content] of files) {
    const fullPath = join(monorepoRoot, relPath);
    await fs.mkdir(dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content);
  }
  return files.size;
}

async function writeRawLocally(rawDocuments, monorepoRoot, fs) {
  for (const [storagePath, content] of rawDocuments) {
    const fullPath = join(monorepoRoot, "data/activity/raw", storagePath);
    await fs.mkdir(dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content);
  }
}
