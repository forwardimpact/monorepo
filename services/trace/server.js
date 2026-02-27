import { Server } from "@forwardimpact/librpc";
import { createServiceConfig } from "@forwardimpact/libconfig";
import { createStorage } from "@forwardimpact/libstorage";
import { TraceIndex } from "@forwardimpact/libtelemetry/index/trace.js";

import { TraceService } from "./index.js";

const config = await createServiceConfig("trace");

// Initialize storage for traces
const traceStorage = createStorage("traces");

// Create trace index
const traceIndex = new TraceIndex(traceStorage);

const service = new TraceService(config, traceIndex);
const server = new Server(service, config);
await server.start();
