#!/usr/bin/env node
import { spawn } from "node:child_process";
import { Server } from "@forwardimpact/librpc";
import { createServiceConfig } from "@forwardimpact/libconfig";
import { createTracer } from "@forwardimpact/librpc";
import { createLogger } from "@forwardimpact/libtelemetry";

import { EmbeddingService } from "./index.js";

const config = await createServiceConfig("embedding");

const logger = createLogger("embedding");
const tracer = await createTracer("embedding");

const backendPort = config.backendPort || 8090;
const model = config.model || "BAAI/bge-small-en-v1.5";
const backendUrl = `http://127.0.0.1:${backendPort}`;

const tei = spawn(
  "text-embeddings-router",
  ["--model-id", model, "--port", String(backendPort), "--json-output"],
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
const server = new Server(service, config, logger, tracer);

await server.start();
