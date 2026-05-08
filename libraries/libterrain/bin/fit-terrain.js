#!/usr/bin/env node

// fit-terrain CLI — run with --help for usage.

import { readFileSync } from "node:fs";
import { resolve, join, dirname } from "path";
import { fileURLToPath } from "url";
import { format } from "prettier";
import {
  createCli,
  formatWarning,
  SummaryRenderer,
} from "@forwardimpact/libcli";
import { createScriptConfig } from "@forwardimpact/libconfig";
import { createLogger } from "@forwardimpact/libtelemetry";

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

const __dirname = dirname(fileURLToPath(import.meta.url));

// `bun build --compile` injects FIT_TERRAIN_VERSION via --define, eliminating
// the readFileSync branch in the compiled binary (which would ENOENT against
// the bunfs virtual mount). Source execution falls through to package.json.
const VERSION =
  process.env.FIT_TERRAIN_VERSION ||
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
    .version;

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
  version: VERSION,
  description: "Synthetic data generation pipeline",
  globalOptions: {
    story: { type: "string", description: "Path to a custom story DSL file" },
    cache: { type: "string", description: "Path to prose cache file" },
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
        "bunx fit-terrain generate --model=claude-sonnet-4-6",
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

const cli = createCli(definition);
const logger = createLogger("terrain");

/**
 * Build an Anthropic-backed LLM client adapted to the OpenAI choices shape
 * consumed by ProseGenerator.
 */
async function resolveLlmApi(config, modelOverride) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const token = await config.anthropicToken();
  const model = modelOverride || config.LLM_MODEL || "claude-haiku-4-5";
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
 * @returns {Promise<{ ok: boolean }>}
 */
async function runVerb(options) {
  const { verb, inspectStage } = options;

  const config = await createScriptConfig("terrain", {
    LLM_MODEL: "claude-haiku-4-5",
  });

  const mode = verb === "generate" ? "generate" : "cached";
  // `check` walks only to `cache-lookup`; strict mode would abort on the
  // first miss before the report is rendered.
  const strict = false;
  const persistCache = verb === "generate";

  const llmApi =
    mode === "generate" ? await resolveLlmApi(config, options.model) : null;

  const monorepoRoot = resolve(__dirname, "../../..");
  const schemaDir = join(monorepoRoot, "products/map/schema/json");
  const cachePath =
    options.cache ||
    join(monorepoRoot, "data", "synthetic", "prose-cache.json");

  const { promptDir, templateDir } = resolvePackagePaths(import.meta.resolve);

  const pipeline = createPipeline({
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
    monorepoRoot,
    prettierFn: format,
    logger,
  });
  const writeStats = await sink.accept(result);

  const summary = new SummaryRenderer({ process });

  if (verb === "inspect") {
    return { ok: true };
  }

  if (verb === "check") {
    const ok = result.stats.prose.misses === 0;
    printCacheReport(result, summary, ok);
    return { ok };
  }

  if (verb === "validate") {
    const ok = printValidation(result, summary);
    return { ok };
  }

  // build / generate
  const validationOk = printValidation(result, summary);
  const writeOk = writeStats.loadErrors === 0;
  const cacheMisses = result.stats.prose.misses;
  if (cacheMisses > 0) {
    process.stdout.write(
      "\n" +
        formatWarning(
          `${cacheMisses} prose cache misses — run "fit-terrain generate" to fill the cache.`,
        ) +
        "\n",
    );
  }
  printRenderStats(summary, result, validationOk);
  printProseStats(summary, result, validationOk);
  printWriteStats(summary, writeStats, writeOk);
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
  const argv = process.argv.slice(2);
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

  if (!ok) process.exitCode = 1;
}

main().catch((err) => {
  logger.exception("main", err);
  cli.error(err.message);
});
