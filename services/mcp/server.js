#!/usr/bin/env node
import "@forwardimpact/libpreflight/node22";

import { serverFlagsShortCircuit } from "@forwardimpact/libcli/server-flags";
import { createServiceConfig } from "@forwardimpact/libconfig";
import { createResourceIndex } from "@forwardimpact/libresource";
import { createClient, createTracer } from "@forwardimpact/librpc";
import { createLogger } from "@forwardimpact/libtelemetry";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

import { createMcpService } from "./index.js";

const handled = serverFlagsShortCircuit({
  name: "fit-svcmcp",
  description: "MCP gateway service",
  packageJsonUrl: new URL("./package.json", import.meta.url),
  argv: process.argv.slice(2),
});

if (!handled) {
  const config = await createServiceConfig("mcp", {
    protocol: "http",
    port: 3011,
    system_prompt: "",
    tools: "",
  });
  const runtime = createDefaultRuntime();
  const logger = createLogger("mcp", runtime);
  const tracer = await createTracer("mcp");

  if (!config.tools || Object.keys(config.tools).length === 0) {
    logger.warn(
      "startup",
      "No MCP tools configured — the server will expose zero tools and " +
        "agents cannot query the standard. Define service.mcp.tools in " +
        "your config.json; see " +
        "https://www.forwardimpact.team/docs/getting-started/engineers/guide/index.md",
    );
  }

  const graphClient = await createClient("graph", logger, tracer);
  const vectorClient = await createClient("vector", logger, tracer);
  const pathwayClient = await createClient("pathway", logger, tracer);
  const mapClient = await createClient("map", logger, tracer);
  const resourceIndex = createResourceIndex("resources");
  const { clock } = runtime;

  const service = createMcpService({
    config,
    logger,
    tracer,
    graphClient,
    vectorClient,
    pathwayClient,
    mapClient,
    resourceIndex,
    clock,
  });

  await service.start();

  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, () => service.stop());
  }
}
