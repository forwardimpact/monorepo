#!/usr/bin/env node
// This file is the thin entry point. It is the sole construction site for the
// runtime collaborator bag. It threads that bag into the dispatch in
// src/outpost.js through run(runtime, version).
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
