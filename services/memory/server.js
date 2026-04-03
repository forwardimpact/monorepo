#!/usr/bin/env node
import { Server } from "@forwardimpact/librpc";
import { createServiceConfig } from "@forwardimpact/libconfig";
import { createStorage } from "@forwardimpact/libstorage";
import { createTracer } from "@forwardimpact/librpc";
import { createLogger } from "@forwardimpact/libtelemetry";
import { createResourceIndex } from "@forwardimpact/libresource";

import { MemoryService } from "./index.js";

const config = await createServiceConfig("memory");

// Initialize observability
const logger = createLogger("memory");
const tracer = await createTracer("memory");

const memoryStorage = createStorage("memories");
const resourceIndex = createResourceIndex("resources");

const service = new MemoryService(config, memoryStorage, resourceIndex);
const server = new Server(service, config, logger, tracer);

await server.start();
