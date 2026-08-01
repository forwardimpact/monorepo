/**
 * Sinks — accept a pipeline result and apply side-effects.
 *
 * The pipeline returns unformatted bytes. The sink decides what to do with
 * them. This module runs Prettier. The pipeline does not.
 *
 * Every sink's `accept(result)` returns the same stats shape:
 * { filesWritten, rawWritten, rawLoaded, loadErrors, loadErrorMessages }.
 *
 * @module libterrain/sinks
 */

import { join, dirname, relative, isAbsolute } from "path";
import {
  ContentFormatter,
  formatContent,
} from "@forwardimpact/libsyntheticrender";

const ZERO_STATS = {
  filesWritten: 0,
  rawWritten: 0,
  rawLoaded: 0,
  loadErrors: 0,
  loadErrorMessages: [],
};

// Canonical serializers (`JSON.stringify(…, 2)` and `YAML.stringify`) emit
// raw documents, so those documents are already well-formed. A second
// Prettier pass over the thousands of activity/GetDX fixtures costs ~11s on
// a full build and changes nothing. Skip those parsers. Let Prettier handle
// only the content that genuinely needs a reflow (e.g. markdown emails,
// HTML).
const PRESERIALIZED_PARSERS = new Set(["json", "yaml"]);

/** No-op sink that discards pipeline output and returns zero stats. */
export class NullSink {
  /** Ignore the result and return an empty stats object. */
  async accept(_result) {
    return { ...ZERO_STATS };
  }
}

/** Sink that formats pipeline output with Prettier and writes files to disk under the output root. */
export class WriteSink {
  /**
   * @param {{ outputRoot: string, prettierFn: Function, logger: object, runtime?: import('@forwardimpact/libutil/runtime').Runtime }} options
   *   The sink writes every generated file beneath `outputRoot`. In the
   *   monorepo it is the repo root. An external consumer points it at a
   *   disposable build directory with `fit-terrain --output-root`.
   */
  constructor({ outputRoot, prettierFn, logger, runtime }) {
    if (!outputRoot) throw new Error("outputRoot is required");
    if (!prettierFn) throw new Error("prettierFn is required");
    if (!logger) throw new Error("logger is required");
    if (!runtime) throw new Error("runtime is required");
    this.outputRoot = outputRoot;
    this.formatter = new ContentFormatter(prettierFn, logger);
    this.logger = logger;
    this._fs = runtime.fs;
  }

  /** Format and write generated files, raw documents, and evidence to disk. */
  async accept(result) {
    const formattedFiles = await this.formatter.format(result.files);
    const formattedRaw = await this.formatter.format(result.rawDocuments, {
      skipParsers: PRESERIALIZED_PARSERS,
    });
    this.logger.info(
      "format",
      `Formatted ${formattedFiles.size} files, ${formattedRaw.size} raw documents`,
    );

    const filesWritten = await writeFiles(
      formattedFiles,
      this.outputRoot,
      this._fs,
      this.logger,
    );

    let rawWritten = 0;
    if (formattedRaw.size > 0) {
      await writeRawLocally(formattedRaw, this.outputRoot, this._fs);
      rawWritten = formattedRaw.size;
    }

    const evidence = result.entities?.activity?.evidence;
    if (evidence) {
      const evidencePath = join(this.outputRoot, "data/activity/evidence.json");
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
 * Uploads raw documents to Supabase Storage. This sink owns no file-system
 * writes. `build --load` composes it with `WriteSink` so the local copy and
 * the uploaded copy stay byte-identical (Prettier formats both).
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
    const formattedRaw = await this.formatter.format(result.rawDocuments, {
      skipParsers: PRESERIALIZED_PARSERS,
    });
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
 * the same pipeline result. CompositeSink merges their stats. `build --load`
 * uses it to compose `WriteSink + LoadSink`. It does not re-introduce a
 * monolithic sink that owns both responsibilities.
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
  /** Do nothing. This sink discards cache entries on purpose. */
  flush() {}
}

/** Prose cache sink that persists generated cache entries to disk on flush. */
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

// Cap on concurrent writeFile calls. A full build emits ~14k files. An
// unbounded Promise.all would risk EMFILE on hosts with a low descriptor
// ulimit. A bounded pool keeps throughput near-parallel and safe.
const WRITE_CONCURRENCY = 256;

/**
 * Run `fn` over `items` with at most `limit` in flight at once. Returns after
 * every item settles. Callers use it to fan out file writes. It does not
 * exhaust file descriptors on large datasets.
 */
async function mapWithConcurrency(items, limit, fn) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  };
  const size = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: size }, worker));
}

/**
 * Make sure every directory in `paths` exists. Deduplicate them so each
 * unique directory triggers one recursive `mkdir`. The per-file `mkdir` it
 * replaces issued one syscall per file (~14k on a full build) for a handful
 * of distinct directories.
 */
async function ensureDirs(paths, fs) {
  const dirs = new Set(paths.map((p) => dirname(p)));
  await Promise.all([...dirs].map((dir) => fs.mkdir(dir, { recursive: true })));
}

/**
 * True when `dir` is a strict descendant of `root`. `dir` must not be `root`
 * itself. `dir` must not escape `root` through `..`. This check guards the
 * destructive clean in `writeFiles`. A stray output path can then never
 * `rm -rf` the output root or anything outside it. That is the primary risk
 * when `fit-terrain` runs in a consumer's repo with `--output-root`.
 */
function isInside(root, dir) {
  const rel = relative(root, dir);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

/**
 * Write a Map of relative paths → content under the output root. Cleans each
 * top-level subdirectory before the write so removed entities do not linger.
 * Both the cleaned directories and the written files must be strict
 * descendants of `outputRoot`. A path that would escape it is a fatal error.
 * The function raises that error before any `rm` runs. It never writes
 * silently outside the root.
 */
async function writeFiles(files, outputRoot, fs, logger) {
  // Validate every write target before any destructive action. A clean dir
  // can resolve inside the root while the full path still escapes
  // (`a/b/../../..`). So the function checks both. It checks full paths
  // here and the cleaned dirs below.
  const entries = [...files].map(([relPath, content]) => {
    const fullPath = join(outputRoot, relPath);
    if (!isInside(outputRoot, fullPath)) {
      throw new Error(
        `refusing to write '${fullPath}': escapes output root '${outputRoot}'`,
      );
    }
    return [fullPath, content];
  });

  const generatedDirs = new Set();
  for (const relPath of files.keys()) {
    const parts = relPath.split("/");
    if (parts.length >= 2) {
      const dir = join(outputRoot, parts[0], parts[1]);
      if (!isInside(outputRoot, dir)) {
        throw new Error(
          `refusing to clean '${dir}': escapes output root '${outputRoot}'`,
        );
      }
      generatedDirs.add(dir);
    }
  }
  for (const dir of generatedDirs) {
    logger?.info?.("write", `cleaning ${dir}`);
    await fs.rm(dir, { recursive: true, force: true });
  }
  await ensureDirs(
    entries.map(([fullPath]) => fullPath),
    fs,
  );
  await mapWithConcurrency(entries, WRITE_CONCURRENCY, ([fullPath, content]) =>
    fs.writeFile(fullPath, content),
  );
  return files.size;
}

async function writeRawLocally(rawDocuments, outputRoot, fs) {
  const rawRoot = join(outputRoot, "data/activity/raw");
  const entries = [...rawDocuments].map(([storagePath, content]) => [
    join(rawRoot, storagePath),
    content,
  ]);
  await ensureDirs(
    entries.map(([fullPath]) => fullPath),
    fs,
  );
  await mapWithConcurrency(entries, WRITE_CONCURRENCY, ([fullPath, content]) =>
    fs.writeFile(fullPath, content),
  );
}
