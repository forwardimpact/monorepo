#!/usr/bin/env node

// fit-universe CLI — run with --help for usage.

import { readFileSync } from "node:fs";
import { resolve, join, dirname } from "path";
import { mkdir, writeFile, readFile, readdir, mkdtemp, rm } from "fs/promises";
import { fileURLToPath } from "url";
import { execFile } from "child_process";
import { promisify } from "util";
import { tmpdir } from "os";
import { format } from "prettier";
import {
  createCli,
  formatHeader,
  formatSubheader,
  formatSuccess,
  formatError,
  formatBullet,
} from "@forwardimpact/libcli";
import { createScriptConfig } from "@forwardimpact/libconfig";
import { createLogger } from "@forwardimpact/libtelemetry";
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
  ProseEngine,
  PathwayGenerator,
} from "@forwardimpact/libsyntheticprose";
import {
  Renderer,
  ContentValidator,
  ContentFormatter,
  formatContent,
} from "@forwardimpact/libsyntheticrender";
import { Pipeline } from "../pipeline.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const { version: VERSION } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

const definition = {
  name: "fit-universe",
  version: VERSION,
  description: "Synthetic data generation pipeline",
  options: {
    generate: {
      type: "boolean",
      description: "Generate prose via LLM and update cache",
    },
    "no-prose": {
      type: "boolean",
      description: "Skip prose entirely (structural scaffolding only)",
    },
    strict: {
      type: "boolean",
      description: "Fail on cache miss (use with default cached mode)",
    },
    "dry-run": {
      type: "boolean",
      description: "Show what would be written without writing",
    },
    load: {
      type: "boolean",
      description: "Load raw documents to Supabase Storage",
    },
    only: {
      type: "string",
      description: "Render only one content type (html|pathway|raw|markdown)",
    },
    story: { type: "string", description: "Path to a custom story DSL file" },
    cache: { type: "string", description: "Path to prose cache file" },
    help: { type: "boolean", short: "h", description: "Show this help" },
    version: { type: "boolean", description: "Show version" },
    json: { type: "boolean", description: "Output help as JSON" },
  },
  examples: [
    "bunx fit-universe",
    "bunx fit-universe --generate",
    "bunx fit-universe --strict",
    "bunx fit-universe --no-prose",
    "bunx fit-universe --only=pathway",
  ],
};

const cli = createCli(definition);

/**
 * Resolve the LLM API client when running in generate mode.
 * @param {object} config
 * @returns {Promise<object|null>}
 */
async function resolveLlmApi(config) {
  const { createLlmApi } = await import("@forwardimpact/libllm");
  const token = await config.llmToken();
  const baseUrl = config.llmBaseUrl();
  let embeddingBaseUrl;
  try {
    embeddingBaseUrl = config.embeddingBaseUrl();
  } catch {
    embeddingBaseUrl = baseUrl;
  }
  return createLlmApi(
    token,
    config.LLM_MODEL || "openai/gpt-4.1-mini",
    baseUrl,
    embeddingBaseUrl,
  );
}

/**
 * Write filesystem output files from the pipeline result.
 * @param {Map<string,string>} files
 * @param {string} monorepoRoot
 */
async function writeOutputFiles(files, monorepoRoot) {
  const generatedDirs = new Set();
  for (const relPath of files.keys()) {
    const parts = relPath.split("/");
    if (parts.length >= 2) {
      generatedDirs.add(join(monorepoRoot, parts[0], parts[1]));
    }
  }
  for (const dir of generatedDirs) {
    await rm(dir, { recursive: true, force: true });
  }

  for (const [relPath, content] of files) {
    const fullPath = join(monorepoRoot, relPath);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content);
  }
  process.stdout.write(formatSuccess(`${files.size} files written`) + "\n");
}

/**
 * Handle raw documents: load to Supabase, write locally, or skip (dry-run).
 * @param {object} result
 * @param {object} args
 * @param {string} monorepoRoot
 */
async function handleRawDocuments(result, args, monorepoRoot) {
  if (result.rawDocuments.size === 0) return;

  if (args.load) {
    await loadRawToSupabase(result.rawDocuments);
  } else if (!args.dryRun) {
    await writeRawLocally(result.rawDocuments, monorepoRoot);
  }

  const evidence = result.entities.activity?.evidence;
  if (evidence && !args.dryRun && !args.load) {
    const evidencePath = join(monorepoRoot, "data/activity/evidence.json");
    await mkdir(dirname(evidencePath), { recursive: true });
    const formatted = await formatContent(
      evidencePath,
      JSON.stringify(evidence, null, 2),
    );
    await writeFile(evidencePath, formatted);
  }
}

/**
 * Load raw documents to Supabase Storage.
 * @param {Map<string,string>} rawDocuments
 * @param {object} config
 */
async function loadRawToSupabase(rawDocuments) {
  let createClient;
  try {
    ({ createClient } = await import("@supabase/supabase-js"));
  } catch {
    throw new Error(
      "--load requires @supabase/supabase-js. Install with: bun add @supabase/supabase-js",
    );
  }
  const url = process.env.MAP_SUPABASE_URL;
  const key = process.env.MAP_SUPABASE_SERVICE_ROLE_KEY;
  if (!url) {
    throw new Error(
      "MAP_SUPABASE_URL is not set. Run `fit-map activity start` and export the URL it prints.",
    );
  }
  if (!key) {
    throw new Error(
      "MAP_SUPABASE_SERVICE_ROLE_KEY is not set. Run `just env-secrets` to generate it.",
    );
  }
  const { loadToSupabase } = await import("../load.js");
  const supabase = createClient(url, key);
  const loadResult = await loadToSupabase(supabase, rawDocuments);
  process.stdout.write(
    formatSuccess(
      `${loadResult.loaded} raw documents loaded to Supabase Storage`,
    ) + "\n",
  );
  if (loadResult.errors.length > 0) {
    process.stderr.write(
      formatError(`${loadResult.errors.length} errors:`) + "\n",
    );
    for (const err of loadResult.errors) {
      process.stderr.write(formatBullet(err, 1) + "\n");
    }
  }
}

/**
 * Write raw documents to local filesystem.
 * @param {Map<string,string>} rawDocuments
 * @param {string} monorepoRoot
 */
async function writeRawLocally(rawDocuments, monorepoRoot) {
  for (const [storagePath, content] of rawDocuments) {
    const fullPath = join(monorepoRoot, "data/activity/raw", storagePath);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content);
  }
  process.stdout.write(
    formatSuccess(
      `${rawDocuments.size} raw documents written to data/activity/raw/`,
    ) + "\n",
  );
}

/**
 * Print dry-run summary.
 * @param {object} result
 * @param {boolean} load
 */
function printDryRun(result, load) {
  process.stdout.write("\n" + formatHeader("Filesystem files") + "\n");
  for (const [path] of result.files) {
    process.stdout.write(formatBullet(path, 0) + "\n");
  }
  process.stdout.write(
    "\n" +
      formatHeader(`Raw documents (${load ? "Supabase Storage" : "local"})`) +
      "\n",
  );
  for (const [path] of result.rawDocuments) {
    process.stdout.write(formatBullet(`raw/${path}`, 0) + "\n");
  }
  process.stdout.write(
    "\n" +
      formatSubheader(
        `${result.files.size + result.rawDocuments.size} total (dry run)`,
      ) +
      "\n",
  );
}

/**
 * Print validation and prose stats.
 * @param {object} result
 */
function printReport(result) {
  process.stdout.write("\n" + formatHeader("Validation") + "\n");
  for (const check of result.validation.checks) {
    const icon = check.passed ? "\u2713" : "\u2717";
    process.stdout.write(formatBullet(`${icon} ${check.name}`, 0) + "\n");
  }

  const { hits, generated, misses } = result.stats.prose;
  const proseTotal = hits + generated + misses;
  if (proseTotal > 0) {
    const rate = Math.round((hits / proseTotal) * 100);
    process.stdout.write(
      "\n" +
        formatSubheader(
          `Prose: ${hits} hits, ${generated} generated, ${misses} misses (${rate}% hit rate)`,
        ) +
        "\n",
    );
  }

  if (!result.validation.passed) {
    process.stderr.write(
      "\n" +
        formatError(`${result.validation.failures} validation failures`) +
        "\n",
    );
    process.exit(1);
  }
}

/**
 * Wire all pipeline dependencies and create a Pipeline instance.
 * @param {object} opts
 * @returns {Pipeline}
 */
function createPipeline(opts) {
  const { logger, mode, cachePath, llmApi, promptDir, templateDir } = opts;
  const promptLoader = new PromptLoader(promptDir);
  const templateLoader = new TemplateLoader(templateDir);

  const dslParser = createDslParser();
  const entityGenerator = createEntityGenerator(logger);
  const proseEngine = new ProseEngine({
    cachePath,
    mode,
    strict: opts.strict,
    llmApi,
    promptLoader,
    logger,
  });
  const pathwayGenerator = new PathwayGenerator(proseEngine, logger);
  const renderer = new Renderer(templateLoader, logger);
  const validator = new ContentValidator(logger);
  const formatter = new ContentFormatter(format, logger);

  const execFileFn = promisify(execFile);

  /**
   * Create a tool instance by name.
   * @param {string} name
   * @param {object} deps
   * @returns {object}
   */
  function toolFactory(name, deps) {
    switch (name) {
      case "faker":
        return new FakerTool({ logger: deps.logger });
      case "synthea":
        return new SyntheaTool({
          logger: deps.logger,
          syntheaJar:
            process.env.SYNTHEA_JAR || "synthea-with-dependencies.jar",
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

  return new Pipeline({
    dslParser,
    entityGenerator,
    proseEngine,
    pathwayGenerator,
    renderer,
    validator,
    formatter,
    toolFactory,
    logger,
  });
}

async function main() {
  const parsed = cli.parse(process.argv.slice(2));
  if (!parsed) process.exit(0);

  const { values } = parsed;

  const config = await createScriptConfig("universe", {
    LLM_TOKEN: null,
    LLM_MODEL: "openai/gpt-4.1-mini",
    LLM_BASE_URL: null,
    LLM_EMBEDDING_BASE_URL: null,
  });

  const mode = values["no-prose"]
    ? "no-prose"
    : values.generate
      ? "generate"
      : "cached";

  const llmApi = mode === "generate" ? await resolveLlmApi(config) : null;

  const monorepoRoot = resolve(__dirname, "../../..");
  const schemaDir = join(monorepoRoot, "products/map/schema/json");
  const cachePath =
    values.cache || join(monorepoRoot, "data", "synthetic", "prose-cache.json");

  const libsyntheticproseDir = dirname(
    fileURLToPath(import.meta.resolve("@forwardimpact/libsyntheticprose")),
  );
  const libsyntheticrenderDir = dirname(
    fileURLToPath(import.meta.resolve("@forwardimpact/libsyntheticrender")),
  );

  const pipeline = createPipeline({
    logger: createLogger("universe"),
    mode,
    cachePath,
    strict: !!values.strict,
    llmApi,
    promptDir: join(libsyntheticproseDir, "prompts"),
    templateDir: join(libsyntheticrenderDir, "templates"),
  });

  const result = await pipeline.run({
    universePath:
      values.story || join(monorepoRoot, "data", "synthetic", "story.dsl"),
    only: values.only || null,
    schemaDir,
  });

  if (!values["dry-run"]) {
    await writeOutputFiles(result.files, monorepoRoot);
  }

  await handleRawDocuments(
    result,
    { load: values.load, dryRun: values["dry-run"] },
    monorepoRoot,
  );

  if (values["dry-run"]) {
    printDryRun(result, values.load);
  }

  printReport(result);
}

const logger = createLogger("universe");

main().catch((err) => {
  logger.exception("main", err);
  cli.error(err.message);
  process.exit(1);
});
