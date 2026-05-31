#!/usr/bin/env node
import "@forwardimpact/libpreflight/node22";

import { Server, createTracer } from "@forwardimpact/librpc";
import { createServiceConfig } from "@forwardimpact/libconfig";
import { createLogger } from "@forwardimpact/libtelemetry";
import { createDataLoader } from "@forwardimpact/map/loader";
import { Finder } from "@forwardimpact/libutil";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { homedir } from "os";
import { join } from "path";
import fs from "fs/promises";

import { PathwayService } from "./index.js";

const config = await createServiceConfig("pathway", {
  data_dir: "",
});

// Initialize observability
const logger = createLogger("pathway");
const tracer = await createTracer("pathway");

// Resolve the pathway data directory using the same upward-walk + HOME
// fallback rules as fit-pathway. SERVICE_PATHWAY_DATA_DIR (picked up by
// libconfig and exposed as config.data_dir) overrides the discovery.
const finder = new Finder(fs, logger, process);
const data_dir = config.data_dir
  ? String(config.data_dir)
  : join(finder.findData("data", homedir()), "pathway");

// Three-call load sequence matching products/pathway/src/commands/agent.js.
// loadAllData drops `human` from each skill (loader.js:102-127) while
// loadSkillsWithAgentData spreads the full raw skill, which is the shape
// generateAgentProfile walks. Both are required.
// createDataLoader requires an injected runtime; the service entry point is a
// legitimate construction site for the production runtime.
const loader = createDataLoader(createDefaultRuntime());
const data = await loader.loadAllData(data_dir);
const agentData = await loader.loadAgentData(data_dir);
const skillsWithAgent = await loader.loadSkillsWithAgentData(data_dir);

const service = new PathwayService(config, {
  data,
  agentData,
  skillsWithAgent,
});
const server = new Server(service, config, logger, tracer);

await server.start();
