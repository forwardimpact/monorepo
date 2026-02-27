import { Server } from "@forwardimpact/librpc";
import { createServiceConfig } from "@forwardimpact/libconfig";
import { createGraphIndex } from "@forwardimpact/libgraph";
import { createTracer } from "@forwardimpact/librpc";
import { createLogger } from "@forwardimpact/libtelemetry";

import { GraphService } from "./index.js";

const config = await createServiceConfig("graph");

// Initialize observability
const logger = createLogger("graph");
const tracer = await createTracer("graph");

const graphIndex = createGraphIndex("graphs");

const service = new GraphService(config, graphIndex);
const server = new Server(service, config, logger, tracer);

await server.start();
