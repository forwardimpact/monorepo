import { Server } from "@forwardimpact/librpc";
import { createServiceConfig } from "@forwardimpact/libconfig";
import { createTracer } from "@forwardimpact/librpc";
import { createLogger } from "@forwardimpact/libtelemetry";

import { ToolService } from "./index.js";

const config = await createServiceConfig("tool");

// Initialize observability
const logger = createLogger("tool");
const tracer = await createTracer("tool");

const service = new ToolService(config, logger, tracer);
const server = new Server(service, config, logger, tracer);

await server.start();
