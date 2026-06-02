#!/usr/bin/env node
// Thin entry point — the sole construction site for the runtime collaborator
// bag, threaded into src/outpost.js's dispatch via run(runtime, version).
import "@forwardimpact/libpreflight/node22";

import { resolveVersion } from "@forwardimpact/libcli";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

import { run } from "../src/outpost.js";

const runtime = createDefaultRuntime();
const version = resolveVersion({
  packageJsonUrl: new URL("../package.json", import.meta.url),
  runtime,
});
const code = await run(runtime, version);
if (code) runtime.proc.exit(code);
