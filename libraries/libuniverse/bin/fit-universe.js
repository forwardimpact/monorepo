#!/usr/bin/env node

/**
 * fit-universe CLI — synthetic data generation pipeline.
 *
 * Usage:
 *   npx fit-universe                     # Structural generation only
 *   npx fit-universe --cached            # Use cached prose
 *   npx fit-universe --generate          # Generate prose via LLM
 *   npx fit-universe --cached --strict   # Fail on cache miss
 *   npx fit-universe --load              # Load raw docs to Supabase Storage
 *   npx fit-universe --only=pathway      # Render only one content type
 *   npx fit-universe --dry-run           # Show what would be written
 *   npx fit-universe --universe=path     # Custom universe file
 */

import { resolve, join, dirname } from "path";
import { mkdir, writeFile } from "fs/promises";
import { fileURLToPath } from "url";
import { createScriptConfig } from "@forwardimpact/libconfig";
import { runPipeline } from "../pipeline.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const args = parseArgs(process.argv.slice(2));

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
    llmApi = createLlmApi(
      config.LLM_TOKEN,
      config.LLM_MODEL,
      config.LLM_BASE_URL,
      config.LLM_EMBEDDING_BASE_URL || config.LLM_BASE_URL,
    );
  }

  const monorepoRoot = resolve(__dirname, "../../..");
  const schemaDir = join(monorepoRoot, "products/map/schema/json");
  const result = await runPipeline({
    universePath: args.universe || join(__dirname, "..", "data", "default.dsl"),
    dataDir: join(monorepoRoot, "examples"),
    mode,
    strict: !!args.strict,
    only: args.only || null,
    llmApi,
    cachePath: join(__dirname, "..", ".prose-cache.json"),
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
        const fullPath = join(
          monorepoRoot,
          "examples/activity/raw",
          storagePath,
        );
        await mkdir(dirname(fullPath), { recursive: true });
        await writeFile(fullPath, content);
      }
      console.log(
        `${result.rawDocuments.size} raw documents written to examples/activity/raw/`,
      );
    }

    // Write evidence directly (no raw source system for evidence)
    const evidence = result.entities.activity?.evidence;
    if (evidence && !args.dryRun && !args.load) {
      const evidencePath = join(
        monorepoRoot,
        "examples/activity/evidence.json",
      );
      await mkdir(dirname(evidencePath), { recursive: true });
      await writeFile(evidencePath, JSON.stringify(evidence, null, 2));
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
    if (arg === "--cached") args.cached = true;
    else if (arg === "--generate") args.generate = true;
    else if (arg === "--strict") args.strict = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--load") args.load = true;
    else if (arg.startsWith("--only=")) args.only = arg.slice(7);
    else if (arg.startsWith("--universe=")) args.universe = arg.slice(11);
  }
  return args;
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
