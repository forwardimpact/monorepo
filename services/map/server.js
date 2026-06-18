#!/usr/bin/env node
import "@forwardimpact/libpreflight/node22";

import { Server, createClient, createTracer } from "@forwardimpact/librpc";
import { createServiceConfig } from "@forwardimpact/libconfig";
import { createLogger } from "@forwardimpact/libtelemetry";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { MapService } from "./index.js";

const config = await createServiceConfig("map", {
  port: 3004,
});
const runtime = createDefaultRuntime();
const logger = createLogger("map", runtime);
const tracer = await createTracer("map");

const supabaseUrl = config.supabaseUrl();
const supabaseKey = config.supabaseServiceRoleKey();
const supabase = createSupabaseClient(supabaseUrl, supabaseKey, {
  db: { schema: "activity" },
});

const pathwayClient = await createClient("pathway", logger, tracer);

const service = new MapService(config, { supabase, pathwayClient });
const server = new Server(service, config, { logger, tracer, runtime });

await server.start();
