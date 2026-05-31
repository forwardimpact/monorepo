#!/usr/bin/env node
// Thin entry point — the sole construction site for the runtime collaborator
// bag, threaded into src/outpost.js's dispatch via run(runtime, version).
import "@forwardimpact/libpreflight/node22";

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

import { run } from "../src/outpost.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// In compiled binaries (bun build --compile), `bun build --define` injects the
// version string here so the readFileSync branch is eliminated as dead code.
// Source execution falls through to package.json.
const VERSION =
  process.env.OUTPOST_VERSION ||
  JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"))
    .version;

const runtime = createDefaultRuntime();
const code = await run(runtime, VERSION);
if (code) runtime.proc.exit(code);
