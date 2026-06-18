#!/usr/bin/env node
import "@forwardimpact/libpreflight/node22";

import { Server } from "@forwardimpact/librpc";
import { createServiceConfig } from "@forwardimpact/libconfig";
import { clients } from "@forwardimpact/librpc";
import { embedding } from "@forwardimpact/libtype";
import { VectorIndex } from "@forwardimpact/libvector/index/vector.js";
import { createStorage } from "@forwardimpact/libstorage";
import { createTracer } from "@forwardimpact/librpc";
import { createLogger } from "@forwardimpact/libtelemetry";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

import { VectorService } from "./index.js";

const config = await createServiceConfig("vector", {
  port: 3002,
});

// Initialize observability
const runtime = createDefaultRuntime();
const logger = createLogger("vector", runtime);
const tracer = await createTracer("vector");

// gRPC embedding client
const { EmbeddingClient } = clients;
const embeddingClient = new EmbeddingClient(
  await createServiceConfig("embedding"),
  runtime,
  logger,
  tracer,
);

async function createEmbeddings(input) {
  const req = new embedding.EmbeddingsRequest({
    input: Array.isArray(input) ? input : [input],
  });
  const res = await embeddingClient.CreateEmbeddings(req);
  return { data: res.data.map((v) => ({ embedding: Array.from(v.values) })) };
}

// Initialize vector index
const vectorStorage = createStorage("vectors");
const vectorIndex = new VectorIndex(vectorStorage);

const service = new VectorService(config, vectorIndex, createEmbeddings);
const server = new Server(service, config, { logger, tracer, runtime });

await server.start();
