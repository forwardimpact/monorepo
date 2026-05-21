#!/usr/bin/env node
import { createServiceConfig } from "@forwardimpact/libconfig";
import { createTracer } from "@forwardimpact/librpc";
import { createLogger } from "@forwardimpact/libtelemetry";

import { MsTeamsService } from "./index.js";

const config = await createServiceConfig("msteams", {
  protocol: "http",
  port: 3978,
  github_repo: "",
  callback_base_url: "",
});
const logger = createLogger("msteams");
const tracer = await createTracer("msteams");

const service = new MsTeamsService(config, { logger, tracer });
await service.start();
