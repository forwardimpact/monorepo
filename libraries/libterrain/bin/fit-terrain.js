#!/usr/bin/env node

// fit-terrain CLI — run with --help for usage.

import "@forwardimpact/libpreflight/node22";

import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { format } from "prettier";
import {
  createCli,
  formatWarning,
  SummaryRenderer,
  withEmbeddedAssets,
} from "@forwardimpact/libcli";
import { createScriptConfig } from "@forwardimpact/libconfig";
import { createLogger } from "@forwardimpact/libtelemetry";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { CHAT_MODEL, FAST_MODEL } from "@forwardimpact/libutil/models";

import {
  createPipeline,
  selectOutputSink,
  resolvePackagePaths,
  terminalForVerb,
  printValidation,
  printProseStats,
  printWriteStats,
  printRenderStats,
  printCacheReport,
  printGenerateStats,
} from "../src/cli-helpers.js";

// Overlay the runtime so the prompt/template loaders read inlined assets when
// this is a compiled binary; a no-op in source/npx execution.
const runtime = withEmbeddedAssets(createDefaultRuntime());

const documentation = [
  {
    title: "Prove Agent Changes",
    url: "https://www.forwardimpact.team/docs/libraries/prove-changes/index.md",
    description:
      "End-to-end workflow from dataset generation through evaluation to trace analysis.",
  },
  {
    title: "Generate an Eval Dataset",
    url: "https://www.forwardimpact.team/docs/libraries/prove-changes/generate-dataset/index.md",
    description:
      "Using the Terrain DSL to define and generate synthetic datasets.",
  },
];

const definition = {
  name: "fit-terrain",
  description: "Synthetic data generation pipeline",
  globalOptions: {
    story: { type: "string", description: "Path to a custom story DSL file" },
    cache: { type: "string", description: "Path to prose cache file" },
    "output-root": {
      type: "string",
      description:
        "Directory to write generated output into (default: project root)",
    },
    "schema-dir": {
      type: "string",
      description:
        "Directory of map JSON schemas for pathway rendering (default: resolved from @forwardimpact/map)",
    },
    help: { type: "boolean", short: "h", description: "Show this help" },
    version: { type: "boolean", description: "Show version" },
    json: { type: "boolean", description: "Output help as JSON" },
  },
  commands: [
    {
      name: "check",
      description: "Verify cache completeness; prints hit-rate",
      examples: [
        "bunx fit-terrain check",
        "LOG_LEVEL=error bunx fit-terrain check",
      ],
    },
    {
      name: "validate",
      description: "Run entity and cross-content checks (no writes)",
      examples: ["bunx fit-terrain validate"],
    },
    {
      name: "build",
      description: "Render and write all content",
      options: {
        only: {
          type: "string",
          description:
            "Render only one content type (html|pathway|raw|markdown)",
        },
        load: {
          type: "boolean",
          description: "Load raw documents to Supabase Storage",
        },
      },
      examples: [
        "bunx fit-terrain build",
        "bunx fit-terrain build --only=pathway",
        "bunx fit-terrain build --load",
      ],
    },
    {
      name: "generate",
      description: "Fill the prose cache via LLM, then build",
      options: {
        model: {
          type: "string",
          description: "Override LLM model (defaults to LLM_MODEL config)",
        },
      },
      examples: [
        "bunx fit-terrain generate",
        `bunx fit-terrain generate --model=${CHAT_MODEL}`,
      ],
    },
    {
      name: "inspect",
      args: "<stage>",
      description:
        "Dump a pipeline stage's output. Stages: parse, entities, prose-keys, cache-lookup, skeleton, enriched, raw, markdown, pathway, datasets, validate, write.",
      examples: [
        "bunx fit-terrain inspect entities",
        "bunx fit-terrain inspect cache-lookup",
        "bunx fit-terrain inspect validate",
      ],
    },
  ],
  examples: [
    "bunx fit-terrain check",
    "bunx fit-terrain validate",
    "bunx fit-terrain build --only=pathway",
    "bunx fit-terrain generate",
  ],
  documentation,
};

const cli = createCli(definition, {
  runtime,
  packageJsonUrl: new URL("../package.json", import.meta.url),
});
const logger = createLogger("terrain", runtime);

/**
 * Build an Anthropic-backed LLM client adapted to the OpenAI choices shape
 * consumed by ProseGenerator.
 */
async function resolveLlmApi(config, modelOverride) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const token = await config.anthropicToken();
  const model = modelOverride || config.LLM_MODEL || FAST_MODEL;
  const client = new Anthropic({ apiKey: token });

  return {
    async createCompletions({ messages, max_tokens }) {
      const systemMessages = messages.filter((m) => m.role === "system");
      const turnMessages = messages.filter((m) => m.role !== "system");
      const system = systemMessages.map((m) => m.content).join("\n\n");
      const response = await client.messages.create({
        model,
        max_tokens,
        system: system || undefined,
        messages: turnMessages,
      });
      const text = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");
      return { choices: [{ message: { content: text } }] };
    },
  };
}

/**
 * Resolve the map JSON-schema directory from the installed `@forwardimpact/map`
 * package. Pathway rendering reads nine `<name>.schema.json` files from here.
 * Returns `null` when the package is not installed, so the pipeline cleanly
 * skips pathway rendering rather than crashing — an external consumer that only
 * renders clinical output (Polaris's case) need not depend on `map`.
 *
 * Called directly in this module so `this === import.meta`, which Bun requires
 * for `import.meta.resolve`.
 */
function defaultSchemaDir() {
  try {
    const url = import.meta.resolve(
      "@forwardimpact/map/schema/json/standard.schema.json",
    );
    return dirname(fileURLToPath(url));
  } catch {
    return null;
  }
}

/**
 * Run the pipeline for the given verb. Returns whether the verb succeeded;
 * the caller maps that to process.exitCode.
 *
 * @param {object} options
 * @param {"check"|"validate"|"build"|"generate"} options.verb
 * @param {string} [options.only]
 * @param {boolean} [options.load]
 * @param {string} [options.model]
 * @param {string} [options.story]
 * @param {string} [options.cache]
 * @param {string} [options.outputRoot]
 * @param {string} [options.schemaDir]
 * @returns {Promise<{ ok: boolean }>}
 */
async function runVerb(options) {
  const { verb, inspectStage } = options;

  const config = await createScriptConfig("terrain", {
    LLM_MODEL: FAST_MODEL,
  });

  const mode = verb === "generate" ? "generate" : "cached";
  // `check` walks only to `cache-lookup`; strict mode would abort on the
  // first miss before the report is rendered.
  const strict = false;
  const persistCache = verb === "generate";

  const llmApi =
    mode === "generate" ? await resolveLlmApi(config, options.model) : null;

  // The project tree this run reads (story DSL, schemas) and writes to. Finder
  // handles the compiled-vs-source split: cwd for a compiled binary, upward
  // package.json search otherwise — so this stays free of build-mode checks.
  const monorepoRoot = runtime.finder.findProjectRoot();
  // Read root (story/cache/schema defaults) stays the resolved project root.
  // Only the *write* target moves when `--output-root` is given, so an external
  // consumer renders into a disposable directory it owns.
  const outputRoot = options.outputRoot || monorepoRoot;
  const schemaDir = options.schemaDir || defaultSchemaDir();
  const cachePath =
    options.cache ||
    join(monorepoRoot, "data", "synthetic", "prose-cache.json");

  // Bind to `import.meta` so the helper can invoke it under Bun, which
  // requires `import.meta.resolve` to be called with `this === import.meta`.
  const { promptDir, templateDir } = resolvePackagePaths((specifier) =>
    import.meta.resolve(specifier),
  );

  const pipeline = createPipeline({
    runtime,
    logger,
    mode,
    cachePath,
    strict,
    llmApi,
    promptDir,
    templateDir,
    persistCache,
  });

  const terminal = terminalForVerb(verb, inspectStage);

  const result = await pipeline.run({
    storyPath:
      options.story || join(monorepoRoot, "data", "synthetic", "story.dsl"),
    terminal,
    only: options.only || null,
    schemaDir,
  });

  const sink = await selectOutputSink({
    verb,
    load: !!options.load,
    outputRoot,
    prettierFn: format,
    logger,
    config,
    runtime,
  });
  const writeStats = await sink.accept(result);

  const summary = new SummaryRenderer({ process: runtime.proc });

  if (verb === "inspect") {
    return { ok: true };
  }

  if (verb === "check") {
    const ok = result.stats.prose.misses === 0;
    printCacheReport(result, summary, ok, runtime.proc.stdout);
    return { ok };
  }

  if (verb === "validate") {
    const ok = printValidation(result, summary, runtime.proc.stdout);
    return { ok };
  }

  // build / generate
  const validationOk = printValidation(result, summary, runtime.proc.stdout);
  const writeOk = writeStats.loadErrors === 0;
  const cacheMisses = result.stats.prose.misses;
  if (cacheMisses > 0) {
    runtime.proc.stdout.write(
      "\n" +
        formatWarning(
          `${cacheMisses} prose cache misses — run "fit-terrain generate" to fill the cache.`,
        ) +
        "\n",
    );
  }
  printRenderStats(summary, result, validationOk);
  printProseStats(summary, result, validationOk);
  printWriteStats(summary, writeStats, writeOk, runtime.proc.stdout);
  if (verb === "generate") {
    printGenerateStats(summary, result, validationOk && writeOk);
  }
  // Verb-level outcome: build/generate exit 1 on validation failure (spec
  // line 173) or write failure. Per-block `ok` flags above describe each
  // block independently; this conjunction is only the exit-code rule.
  return { ok: validationOk && writeOk };
}

const KNOWN_VERBS = new Set([
  "check",
  "validate",
  "build",
  "generate",
  "inspect",
]);

function isParseError(err) {
  const code = err.code ?? err.cause?.code;
  return typeof code === "string" && code.startsWith("ERR_PARSE_ARGS_");
}

function tryParse(argv) {
  try {
    return cli.parse(argv);
  } catch (err) {
    if (isParseError(err)) {
      cli.usageError(err.message);
      return null;
    }
    throw err;
  }
}

function resolveVerb(positionals) {
  const verb = positionals[0];
  if (!verb || !KNOWN_VERBS.has(verb)) {
    cli.usageError(
      `Unknown command "${verb ?? ""}". Run "fit-terrain --help".`,
    );
    return null;
  }

  let inspectStage = null;
  if (verb === "inspect") {
    inspectStage = positionals[1];
    if (!inspectStage) {
      cli.usageError(
        "inspect requires a stage name. Run `fit-terrain --help`.",
      );
      return null;
    }
  }

  return { verb, inspectStage };
}

async function main() {
  const argv = runtime.proc.argv.slice(2);
  if (argv.length === 0) {
    cli.showHelp();
    return;
  }

  const parsed = tryParse(argv);
  if (!parsed) return;

  const { values, positionals } = parsed;
  const resolved = resolveVerb(positionals);
  if (!resolved) return;

  let ok;
  try {
    ({ ok } = await runVerb({
      verb: resolved.verb,
      inspectStage: resolved.inspectStage,
      only: values.only,
      load: !!values.load,
      model: values.model,
      story: values.story,
      cache: values.cache,
      outputRoot: values["output-root"],
      schemaDir: values["schema-dir"],
    }));
  } catch (err) {
    if (
      resolved.verb === "inspect" &&
      err.message.startsWith("Unknown stage")
    ) {
      cli.usageError(err.message);
      return;
    }
    throw err;
  }

  if (!ok) runtime.proc.exitCode = 1;
}

main().catch((err) => {
  logger.exception("main", err);
  cli.error(err.message);
});
