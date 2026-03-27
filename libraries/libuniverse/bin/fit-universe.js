#!/usr/bin/env node

// fit-universe CLI — run with --help for usage.

import { resolve, join, dirname } from "path";
import { mkdir, writeFile, readFile, readdir, mkdtemp, rm } from "fs/promises";
import { fileURLToPath } from "url";
import { execFile } from "child_process";
import { promisify } from "util";
import { tmpdir } from "os";
import { format } from "prettier";
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

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  const config = await createScriptConfig("universe", {
    LLM_TOKEN: null,
    LLM_MODEL: "openai/gpt-4.1-mini",
    LLM_BASE_URL: null,
    LLM_EMBEDDING_BASE_URL: null,
    SUPABASE_URL: null,
    SUPABASE_SERVICE_ROLE_KEY: null,
  });

  const mode = args.cached ? "cached" : args.generate ? "generate" : "no-prose";

  let llmApi = null;
  if (mode === "generate") {
    const { createLlmApi } = await import("@forwardimpact/libllm");
    const token = await config.llmToken();
    const baseUrl = config.llmBaseUrl();
    let embeddingBaseUrl;
    try {
      embeddingBaseUrl = config.embeddingBaseUrl();
    } catch {
      embeddingBaseUrl = baseUrl;
    }
    llmApi = createLlmApi(
      token,
      config.LLM_MODEL || "openai/gpt-4.1-mini",
      baseUrl,
      embeddingBaseUrl,
    );
  }

  const monorepoRoot = resolve(__dirname, "../../..");
  const schemaDir = join(monorepoRoot, "products/map/schema/json");
  const cachePath = join(__dirname, "..", ".prose-cache.json");

  const libsyntheticproseDir = dirname(
    fileURLToPath(import.meta.resolve("@forwardimpact/libsyntheticprose")),
  );
  const libsyntheticrenderDir = dirname(
    fileURLToPath(import.meta.resolve("@forwardimpact/libsyntheticrender")),
  );
  const promptDir = join(libsyntheticproseDir, "prompts");
  const templateDir = join(libsyntheticrenderDir, "templates");

  // Wire all dependencies (composition root)
  const logger = createLogger("universe");
  const promptLoader = new PromptLoader(promptDir);
  const templateLoader = new TemplateLoader(templateDir);

  const dslParser = createDslParser();
  const entityGenerator = createEntityGenerator(logger);
  const proseEngine = new ProseEngine({
    cachePath,
    mode,
    strict: !!args.strict,
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

  const pipeline = new Pipeline({
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

  const result = await pipeline.run({
    universePath:
      args.universe || join(monorepoRoot, "examples", "universe.dsl"),
    only: args.only || null,
    schemaDir,
  });

  // Write filesystem files (HTML, Pathway, Markdown)
  if (!args.dryRun) {
    for (const [relPath, content] of result.files) {
      const fullPath = join(monorepoRoot, relPath);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, content);
    }
    console.log(`${result.files.size} files written`);
  }

  // Handle raw documents (activity data)
  if (result.rawDocuments.size > 0) {
    if (args.load) {
      const { createClient } = await import("@supabase/supabase-js");
      const { loadToSupabase } = await import("../load.js");
      const supabase = createClient(
        config.SUPABASE_URL,
        config.SUPABASE_SERVICE_ROLE_KEY,
      );
      const loadResult = await loadToSupabase(supabase, result.rawDocuments);
      console.log(
        `${loadResult.loaded} raw documents loaded to Supabase Storage`,
      );
      if (loadResult.errors.length > 0) {
        console.error(`${loadResult.errors.length} errors:`);
        for (const err of loadResult.errors) console.error(`  ${err}`);
      }
    } else if (!args.dryRun) {
      for (const [storagePath, content] of result.rawDocuments) {
        const fullPath = join(monorepoRoot, "data/activity/raw", storagePath);
        await mkdir(dirname(fullPath), { recursive: true });
        await writeFile(fullPath, content);
      }
      console.log(
        `${result.rawDocuments.size} raw documents written to data/activity/raw/`,
      );
    }

    // Write evidence directly (no raw source system for evidence)
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

  // Dry run output
  if (args.dryRun) {
    console.log("\nFilesystem files:");
    for (const [path] of result.files) console.log(`  ${path}`);
    console.log(
      `\nRaw documents (${args.load ? "Supabase Storage" : "local"}):`,
    );
    for (const [path] of result.rawDocuments) console.log(`  raw/${path}`);
    console.log(
      `\n  ${result.files.size + result.rawDocuments.size} total (dry run)`,
    );
  }

  // Report validation
  console.log("\nValidation:");
  for (const check of result.validation.checks) {
    const icon = check.passed ? "✓" : "✗";
    console.log(`  ${icon} ${check.name}`);
  }

  // Prose cache stats
  const { hits, generated, misses } = result.stats.prose;
  const proseTotal = hits + generated + misses;
  if (proseTotal > 0) {
    const rate = Math.round((hits / proseTotal) * 100);
    console.log(
      `\nProse: ${hits} hits, ${generated} generated, ${misses} misses (${rate}% hit rate)`,
    );
  }

  if (!result.validation.passed) {
    console.error(`\n${result.validation.failures} validation failures`);
    process.exit(1);
  }
}

/**
 * @param {string[]} argv
 * @returns {object}
 */
function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--cached") args.cached = true;
    else if (arg === "--generate") args.generate = true;
    else if (arg === "--strict") args.strict = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--load") args.load = true;
    else if (arg.startsWith("--only=")) args.only = arg.slice(7);
    else if (arg.startsWith("--universe=")) args.universe = arg.slice(11);
  }
  return args;
}

function printHelp() {
  console.log(`fit-universe — synthetic data generation pipeline

Usage:
  npx fit-universe [options]

Options:
  --generate          Generate prose via LLM (requires LLM_TOKEN)
  --cached            Use cached prose from .prose-cache.json
  --strict            Fail on cache miss (use with --cached)
  --dry-run           Show what would be written without writing
  --load              Load raw documents to Supabase Storage
  --only=<type>       Render only one content type (html|pathway|raw|markdown)
  --universe=<path>   Path to a custom universe DSL file
  -h, --help          Show this help message

Prose modes:
  (default)           Structural generation only, no LLM calls
  --cached            Read prose from .prose-cache.json
  --generate          Call LLM to generate prose, write to cache

Content types:
  html                Organizational articles, guides, FAQs (data/knowledge)
  pathway             YAML framework files (data/pathway)
  raw                 Roster, GitHub events, evidence (data/activity)
  markdown            Briefings, notes, KB content (data/personal)

Examples:
  npx fit-universe                           # Structural only
  npx fit-universe --generate                # Full generation with LLM prose
  npx fit-universe --cached --strict         # Cached prose, fail on miss
  npx fit-universe --only=pathway            # Generate pathway data only
  npx fit-universe --universe=custom.dsl     # Use custom DSL file
`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
