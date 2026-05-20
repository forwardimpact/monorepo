/**
 * CLI-shaped helpers for fit-terrain: pipeline wiring, sink selection, and
 * output renderers. Kept out of bin/fit-terrain.js so the entry point reads as
 * dispatch + I/O only.
 */

import { join, dirname } from "path";
import { readFile, readdir, mkdtemp, rm, writeFile } from "fs/promises";
import { fileURLToPath } from "url";
import { execFile } from "child_process";
import { promisify } from "util";
import { tmpdir } from "os";
import {
  formatHeader,
  formatListItem,
  formatTable,
} from "@forwardimpact/libcli";

import { PromptLoader } from "@forwardimpact/libprompt";
import { TemplateLoader } from "@forwardimpact/libtemplate/loader";
import {
  createDslParser,
  createEntityGenerator,
  FakerTool,
  SyntheaTool,
  SdvTool,
} from "@forwardimpact/libsyntheticgen";
import {
  ProseCache,
  ProseGenerator,
  PathwayGenerator,
} from "@forwardimpact/libsyntheticprose";
import { Renderer, ContentValidator } from "@forwardimpact/libsyntheticrender";

import { Pipeline, STAGES } from "./pipeline.js";
import {
  NullSink,
  WriteSink,
  LoadSink,
  CompositeSink,
  InspectSink,
  NullProseCacheSink,
  ProseCacheWriteSink,
} from "./sinks.js";
import { loadToSupabase } from "./load.js";

/**
 * Build the Supabase client used by LoadSink, validating config first.
 *
 * @param {object} params
 * @param {object} params.config - libconfig Config carrying Supabase URL + service-role key.
 */
export async function resolveSupabaseClient({ config }) {
  if (!config) throw new Error("resolveSupabaseClient: config required");
  let createClient;
  try {
    ({ createClient } = await import("@supabase/supabase-js"));
  } catch {
    throw new Error(
      "build --load requires @supabase/supabase-js. Install with: bun add @supabase/supabase-js",
    );
  }
  let url, key;
  try {
    url = config.supabaseUrl();
    key = config.supabaseServiceRoleKey();
  } catch (err) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set. " +
        `Run \`just env-setup\` to generate them. Underlying: ${err.message}`,
    );
  }
  return createClient(url, key);
}

/** Assemble all pipeline dependencies from CLI options and return a configured Pipeline. */
export function createPipeline(opts) {
  const {
    logger,
    mode,
    cachePath,
    llmApi,
    promptDir,
    templateDir,
    persistCache,
  } = opts;
  const promptLoader = new PromptLoader(promptDir);
  const templateLoader = new TemplateLoader(templateDir);

  const dslParser = createDslParser();
  const entityGenerator = createEntityGenerator(logger);
  const proseCache = new ProseCache({ cachePath, logger });
  const proseGenerator = new ProseGenerator({
    cache: proseCache,
    mode,
    strict: opts.strict,
    llmApi,
    promptLoader,
    logger,
  });
  const pathwayGenerator = new PathwayGenerator(proseGenerator, logger);
  const renderer = new Renderer(templateLoader, logger);
  const validator = new ContentValidator(logger);

  const execFileFn = promisify(execFile);

  function toolFactory(name, deps) {
    switch (name) {
      case "faker":
        return new FakerTool({ logger: deps.logger });
      case "synthea":
        return new SyntheaTool({
          logger: deps.logger,
          syntheaJar:
            process.env.SYNTHEA_JAR ||
            "vendor/synthea/synthea-with-dependencies.jar",
          execFileFn,
          fsFns: {
            readFile,
            readdir,
            mkdtemp: (prefix) => mkdtemp(join(tmpdir(), prefix)),
            rm,
          },
        });
      case "sdv":
        return new SdvTool({
          logger: deps.logger,
          execFileFn,
          fsFns: { writeFile, rm },
        });
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  const proseCacheSink = persistCache
    ? new ProseCacheWriteSink({ cache: proseCache })
    : new NullProseCacheSink();

  return new Pipeline({
    dslParser,
    entityGenerator,
    proseCache,
    proseGenerator,
    pathwayGenerator,
    renderer,
    validator,
    proseCacheSink,
    toolFactory,
    logger,
  });
}

/** Choose the output sink for a verb, composing WriteSink and LoadSink when --load is set. */
export async function selectOutputSink({
  verb,
  load,
  monorepoRoot,
  prettierFn,
  logger,
  config,
}) {
  if (verb === "inspect") return new InspectSink();
  if (verb !== "build" && verb !== "generate") return new NullSink();

  const writeSink = new WriteSink({ monorepoRoot, prettierFn, logger });
  if (!load) return writeSink;

  const supabase = await resolveSupabaseClient({ config });
  const loadSink = new LoadSink({
    prettierFn,
    supabase,
    loadToSupabase,
    logger,
  });
  return new CompositeSink([writeSink, loadSink]);
}

/**
 * Map a verb to its terminal DAG stage. `inspect` takes the stage name
 * from positional args; everything else has a fixed terminal.
 */
export function terminalForVerb(verb, inspectStage) {
  switch (verb) {
    case "check":
      return "cache-lookup";
    case "validate":
      return "validate";
    case "build":
    case "generate":
      return "write";
    case "inspect":
      if (!inspectStage) {
        throw new Error(
          `inspect requires a stage. Known: ${STAGES.join(", ")}`,
        );
      }
      if (!STAGES.includes(inspectStage)) {
        throw new Error(
          `Unknown stage '${inspectStage}'. Known: ${STAGES.join(", ")}`,
        );
      }
      return inspectStage;
    default:
      throw new Error(`Unknown verb: ${verb}`);
  }
}

/** Resolve prompt and template directories from installed libsyntheticprose and libsyntheticrender packages. */
export function resolvePackagePaths(metaResolve) {
  const libsyntheticproseDir = dirname(
    fileURLToPath(metaResolve("@forwardimpact/libsyntheticprose")),
  );
  const libsyntheticrenderPackageRoot = dirname(
    dirname(fileURLToPath(metaResolve("@forwardimpact/libsyntheticrender"))),
  );
  return {
    promptDir: join(libsyntheticproseDir, "prompts"),
    templateDir: join(libsyntheticrenderPackageRoot, "templates"),
  };
}

/**
 * Render the validation block followed by a totals summary. Returns true on
 * pass, false on fail.
 */
export function printValidation(result, summary) {
  const items = result.validation.checks.map((check) => ({
    label: check.name,
    description: check.passed ? "✓" : `✗ ${check.message ?? "failed"}`,
  }));
  const ok = result.validation.passed;
  summary.render({
    title: formatHeader("Validation"),
    items,
    ok,
  });

  if (!ok) {
    process.stdout.write("\n");
    const failed = result.validation.checks.filter((c) => !c.passed);
    for (const check of failed) {
      process.stdout.write(
        formatListItem(check.name, check.message ?? "failed") + "\n",
      );
    }
  }

  // Totals footer (spec § validate: "{ checks: N, failures: M }").
  summary.render({
    title: formatHeader("Validation summary"),
    items: [
      { label: "Checks", description: String(result.validation.checks.length) },
      { label: "Failures", description: String(result.validation.failures) },
    ],
    ok,
  });

  return ok;
}

/**
 * Render a prose cache stats block (Hits/Generated/Misses/Rate) via summary.render; returns immediately if no cache entries were recorded.
 */
export function printProseStats(summary, result, ok) {
  const { hits, generated, misses } = result.stats.prose;
  const total = hits + generated + misses;
  if (total === 0) return;
  const rate = Math.round((hits / total) * 100);
  const table = formatTable(
    ["Hits", "Generated", "Misses", "Rate"],
    [[hits, generated, misses, `${rate}%`]],
  );
  summary.render({
    title: formatHeader("Prose"),
    items: [],
    ok,
    extras: table,
  });
}

/**
 * Render the in-memory render stats (file counts produced by the pipeline,
 * before write). Distinct from the Write block which counts what hit disk.
 */
export function printRenderStats(summary, result, ok) {
  const items = [
    { label: "Files", description: `${result.stats.files} rendered` },
  ];
  if (result.stats.rawDocuments > 0) {
    items.push({
      label: "Raw documents",
      description: `${result.stats.rawDocuments} rendered`,
    });
  }
  summary.render({ title: formatHeader("Render"), items, ok });
}

/**
 * Render the write-stats block (file counts on disk + any load errors as
 * formatListItem rows in the structured result).
 */
export function printWriteStats(summary, writeStats, ok) {
  const items = [];
  if (writeStats.filesWritten > 0) {
    items.push({
      label: "Files",
      description: `${writeStats.filesWritten} written`,
    });
  }
  if (writeStats.rawWritten > 0) {
    items.push({
      label: "Raw documents",
      description: `${writeStats.rawWritten} written to data/activity/raw/`,
    });
  }
  if (writeStats.rawLoaded > 0) {
    items.push({
      label: "Raw documents",
      description: `${writeStats.rawLoaded} loaded to Supabase Storage`,
    });
  }
  if (writeStats.loadErrors > 0) {
    items.push({
      label: "Load errors",
      description: String(writeStats.loadErrors),
    });
  }
  if (items.length === 0 && writeStats.loadErrors === 0) return;
  summary.render({ title: formatHeader("Write"), items, ok });
  if (writeStats.loadErrors > 0 && writeStats.loadErrorMessages?.length) {
    process.stdout.write("\n");
    for (const err of writeStats.loadErrorMessages) {
      process.stdout.write(formatListItem("error", err) + "\n");
    }
  }
}

/**
 * Render the LLM-call accounting block emitted by `generate`. Reports the
 * number of actual LLM invocations made during this run (prose.generated counter).
 */
export function printGenerateStats(summary, result, ok) {
  const items = [
    {
      label: "LLM calls",
      description: String(result.stats.prose.generated),
    },
  ];
  summary.render({ title: formatHeader("Generate"), items, ok });
}

/**
 * Render the cache report used by `check`. On success, a tight key/hits/
 * misses/rate block. On failure, a formatTable surfaces the same numbers in a
 * scannable, agent-parseable shape so a CI gate can diff cache state turn over
 * turn.
 */
export function printCacheReport(result, summary, ok) {
  const { hits, generated, misses, missKeys } = result.stats.prose;
  const total = hits + generated + misses;
  const rate = total === 0 ? 100 : Math.round((hits / total) * 100);

  if (!ok) {
    const sortedMissKeys = [...missKeys].sort();
    if (sortedMissKeys.length > 0) {
      process.stdout.write("\n");
      summary.render({
        title: formatHeader(`Cache misses (${sortedMissKeys.length})`),
        items: [],
        ok,
        extras: sortedMissKeys.map((k) => `  ${k}`).join("\n") + "\n",
      });
    }
    const table = formatTable(
      ["Keys", "Hits", "Misses", "Rate"],
      [[total, hits, misses, `${rate}%`]],
    );
    summary.render({
      title: formatHeader("Cache report"),
      items: [],
      ok,
      extras: table,
    });
    return;
  }

  summary.render({
    title: formatHeader("Cache report"),
    items: [
      { label: "Keys", description: String(total) },
      { label: "Hits", description: String(hits) },
      { label: "Misses", description: String(misses) },
      { label: "Hit rate", description: `${rate}%` },
    ],
    ok,
  });
}
