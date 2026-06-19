#!/usr/bin/env node
import "@forwardimpact/libpreflight/node22";

import { serverFlagsShortCircuit } from "@forwardimpact/libcli/server-flags";
import { spawn } from "node:child_process";
import { Server } from "@forwardimpact/librpc";
import { createServiceConfig } from "@forwardimpact/libconfig";
import { createTracer } from "@forwardimpact/librpc";
import { createLogger } from "@forwardimpact/libtelemetry";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

import { EmbeddingService } from "./index.js";

const handled = serverFlagsShortCircuit({
  name: "fit-svcembedding",
  description: "Text embeddings gRPC service",
  packageJsonUrl: new URL("./package.json", import.meta.url),
  argv: process.argv.slice(2),
});

if (!handled) {
  const config = await createServiceConfig("embedding", {
    port: 3015,
    backend_port: 8090,
    model: "BAAI/bge-small-en-v1.5",
  });

  const runtime = createDefaultRuntime();
  const logger = createLogger("embedding", runtime);
  const tracer = await createTracer("embedding");

  const backend_port = config.backend_port;
  const model = config.model;
  const backendUrl = `http://127.0.0.1:${backend_port}`;

  const tei = spawn(
    "text-embeddings-router",
    ["--model-id", model, "--port", String(backend_port), "--json-output"],
    { stdio: "inherit" },
  );

  for (const sig of ["SIGTERM", "SIGINT"]) {
    process.on(sig, () => {
      tei.kill(sig);
    });
  }

  tei.on("exit", (code, signal) => {
    process.exit(signal ? 1 : (code ?? 1));
  });

  const service = new EmbeddingService(config, backendUrl);
  const server = new Server(service, config, { logger, tracer, runtime });

  await server.start();
}
