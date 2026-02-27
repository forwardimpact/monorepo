import { serve } from "@hono/node-server";

import { createServiceConfig } from "@forwardimpact/libconfig";
import { createClient, createTracer } from "@forwardimpact/librpc";
import { createLogger } from "@forwardimpact/libtelemetry";

import { createWebService } from "./index.js";

// Initialize observability
const logger = createLogger("web");
const tracer = await createTracer("web");

// Service configuration with defaults
const config = await createServiceConfig("web", { auth_enabled: false });

const client = await createClient("agent", logger, tracer);
const app = await createWebService(client, config, logger);

serve(
  {
    fetch: app.fetch,
    port: config.port,
    hostname: config.host,
  },
  () => {
    logger.debug("Server", "Listening", {
      uri: `${config.host}:${config.port}`,
    });
  },
);
