#!/usr/bin/env node
import "@forwardimpact/libpreflight/node22";

import { serverFlagsShortCircuit } from "@forwardimpact/libcli/server-flags";
import { Server, createTracer } from "@forwardimpact/librpc";
import { createServiceConfig } from "@forwardimpact/libconfig";
import { createLogger } from "@forwardimpact/libtelemetry";
import { createDataLoader } from "@forwardimpact/map/loader";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { homedir } from "os";
import { join } from "path";

import { PathwayService } from "./index.js";

const handled = serverFlagsShortCircuit({
  name: "fit-svcpathway",
  description: "Pathway data gRPC service",
  packageJsonUrl: new URL("./package.json", import.meta.url),
  argv: process.argv.slice(2),
});

if (!handled) {
  const config = await createServiceConfig("pathway", {
    port: 3005,
    data_dir: "",
  });

  // The service entry point is a legitimate construction site for the
  // production runtime. It threads the bag to every collaborator below.
  const runtime = createDefaultRuntime();

  // Initialize observability
  const logger = createLogger("pathway", runtime);
  const tracer = await createTracer("pathway");

  // Resolve the pathway data directory with the same upward-walk and HOME
  // fallback rules as fit-pathway. SERVICE_PATHWAY_DATA_DIR overrides the
  // discovery. libconfig reads it and exposes it as config.data_dir.
  const data_dir = config.data_dir
    ? String(config.data_dir)
    : join(runtime.finder.findData("data", homedir()), "pathway");

  // The three-call load sequence matches
  // products/pathway/src/commands/agent.js. loadAllData drops `human` from
  // each skill (loader.js:102-127). loadSkillsWithAgentData spreads the full
  // raw skill, the shape generateAgentProfile walks. The service needs both.
  // createDataLoader requires an injected runtime. Reuse the bag built above.
  const loader = createDataLoader(runtime);
  const data = await loader.loadAllData(data_dir);
  const agentData = await loader.loadAgentData(data_dir);
  const skillsWithAgent = await loader.loadSkillsWithAgentData(data_dir);

  const service = new PathwayService(config, {
    data,
    agentData,
    skillsWithAgent,
  });
  const server = new Server(service, config, { logger, tracer, runtime });

  await server.start();
}
