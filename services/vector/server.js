import { Server, createClient } from "@forwardimpact/librpc";
import { createServiceConfig } from "@forwardimpact/libconfig";
import { VectorIndex } from "@forwardimpact/libvector/index/vector.js";
import { createStorage } from "@forwardimpact/libstorage";
import { createTracer } from "@forwardimpact/librpc";
import { createLogger } from "@forwardimpact/libtelemetry";

import { VectorService } from "./index.js";

const config = await createServiceConfig("vector");

// Initialize observability
const logger = createLogger("vector");
const tracer = await createTracer("vector");

// Initialize LLM client
const llmClient = await createClient("llm", logger, tracer);

// Initialize vector index
const vectorStorage = createStorage("vectors");
const vectorIndex = new VectorIndex(vectorStorage);

const service = new VectorService(config, vectorIndex, llmClient);
const server = new Server(service, config, logger, tracer);

await server.start();
