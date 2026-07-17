import grpc from "@grpc/grpc-js";
import { healthDefinition } from "@forwardimpact/librpc";

/**
 * Replaces 0.0.0.0 with localhost in a URL for user-facing display.
 * @param {string} url
 * @returns {string}
 */
function displayUrl(url) {
  return url.replace("0.0.0.0", "localhost");
}

/**
 * Checks a single gRPC service via Health/Check.
 * @param {object} grpcMod - @grpc/grpc-js module
 * @param {object} healthDef - Health service definition
 * @param {object} config - Service config with host/port
 * @param {object} clock - Clock collaborator (`now()`)
 * @param {number} timeoutMs - Deadline in milliseconds
 * @returns {Promise<string>} "ok" or "unreachable"
 */
function checkGrpcHealth(grpcMod, healthDef, config, clock, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const ClientCtor = grpcMod.makeGenericClientConstructor(
      healthDef,
      "Health",
    );
    const host = config.host === "0.0.0.0" ? "localhost" : config.host;
    const uri = `${host}:${config.port}`;
    const client = new ClientCtor(uri, grpcMod.credentials.createInsecure());

    // grpc-js accepts an absolute deadline as a millisecond timestamp.
    const deadline = clock.now() + timeoutMs;
    client.Check({ service: "" }, { deadline }, (err, response) => {
      client.close();
      if (err) {
        resolve("unreachable");
      } else if (response?.status === 1) {
        resolve("ok");
      } else {
        resolve("unreachable");
      }
    });
  });
}

/**
 * Checks an HTTP service via its /health endpoint.
 * @param {string} healthUrl - Full URL to the health endpoint
 * @param {object} clock - Clock collaborator (`setTimeout`/`clearTimeout`)
 * @param {Function} fetchFn - Fetch implementation
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<string>} "ok" or "unreachable"
 */
function checkHttpHealth(healthUrl, clock, fetchFn = fetch, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const controller = new AbortController();
    const timer = clock.setTimeout(() => controller.abort(), timeoutMs);
    fetchFn(healthUrl, { signal: controller.signal })
      .then((res) => {
        clock.clearTimeout(timer);
        resolve(res.ok ? "ok" : "unreachable");
      })
      .catch(() => {
        clock.clearTimeout(timer);
        resolve("unreachable");
      });
  });
}

/**
 * Queries graph service for resource and triple counts.
 * @param {object} graphConfig - Graph service config
 * @param {import('@forwardimpact/libutil/runtime').Runtime} runtime - Injected
 *   runtime bag, threaded to the client so its auth reads SERVICE_SECRET.
 * @returns {Promise<{resources: number, triples: number}>}
 */
async function queryDataInventory(graphConfig, runtime) {
  const { clients } = await import("@forwardimpact/librpc");
  const { GraphClient } = clients;
  const { graph } = await import("@forwardimpact/libtype");

  const client = new GraphClient(graphConfig, runtime);

  let resources = 0;
  try {
    const subjectsReq = graph.SubjectsQuery.fromObject({});
    const subjectsRes = await client.GetSubjects(subjectsReq);
    resources = subjectsRes.content
      ? subjectsRes.content.split("\n").filter(Boolean).length
      : 0;
  } catch {
    // Graph GetSubjects unavailable
  }

  let triples = 0;
  try {
    const patternReq = graph.PatternQuery.fromObject({});
    const patternRes = await client.QueryByPattern(patternReq);
    triples = patternRes.identifiers ? patternRes.identifiers.length : 0;
  } catch {
    // Graph QueryByPattern unavailable
  }

  return { resources, triples };
}

const SERVICE_NAMES = ["span", "vector", "graph", "pathway", "mcp"];

const GRPC_SERVICES = ["span", "vector", "graph", "pathway"];

const HTTP_SERVICES = {
  mcp: "/health",
};

/**
 * Loads configs for all services, tracking failures gracefully.
 * @param {Function} createServiceConfig - Config factory
 * @returns {Promise<{configs: object, configErrors: Set<string>}>}
 */
async function loadConfigs(createServiceConfig) {
  const configs = {};
  const configErrors = new Set();
  for (const name of SERVICE_NAMES) {
    try {
      configs[name] = await createServiceConfig(name);
    } catch {
      configErrors.add(name);
    }
  }
  return { configs, configErrors };
}

/**
 * Run health checks for all gRPC and HTTP services concurrently via Promise.allSettled.
 * @returns {Promise<object>} Map of service name to {url, status}; url is "unknown" for gRPC services that have no .url field in their config
 */
async function checkAllServices(
  grpcMod,
  healthDef,
  configs,
  configErrors,
  fetchFn,
  clock,
) {
  const checks = GRPC_SERVICES.map((name) => {
    if (configErrors.has(name)) return Promise.resolve([name, "unreachable"]);
    return checkGrpcHealth(grpcMod, healthDef, configs[name], clock).then(
      (s) => [name, s],
    );
  });

  for (const [name, healthPath] of Object.entries(HTTP_SERVICES)) {
    if (configErrors.has(name)) {
      checks.push(Promise.resolve([name, "unreachable"]));
    } else {
      checks.push(
        checkHttpHealth(
          `${configs[name].url}${healthPath}`,
          clock,
          fetchFn,
        ).then((s) => [name, s]),
      );
    }
  }

  const results = await Promise.allSettled(checks);
  const services = {};
  for (const result of results) {
    const [name, status] =
      result.status === "fulfilled" ? result.value : [null, "unreachable"];
    if (name) {
      const url = configs[name]?.url || "unknown";
      services[name] = { url: displayUrl(url), status };
    }
  }
  return services;
}

/**
 * Check whether an Anthropic API key is resolvable via the config, returning "configured" or "missing".
 * @param {object} config - Any loaded config (has anthropicToken method)
 * @returns {Promise<string>} "configured" or "missing"
 */
async function checkAnthropicToken(config) {
  try {
    const token = await config.anthropicToken();
    return token ? "configured" : "missing";
  } catch {
    return "missing";
  }
}

/**
 * Runs all status checks and returns a structured result.
 * @param {object} deps - Injected dependencies
 * @param {Function} deps.createServiceConfig - Config factory
 * @param {object} deps.fs - Node fs/promises module
 * @param {object} [deps.grpc] - @grpc/grpc-js module (default: real grpc)
 * @param {object} [deps.healthDefinition] - Health service definition (default: real def)
 * @param {Function} [deps.fetch] - Fetch function (default: global fetch)
 * @param {object} deps.clock - Clock collaborator (`now()`); supplied by the
 *   caller from `runtime.clock` (the bin is the sole construction site).
 * @param {import('@forwardimpact/libutil/runtime').Runtime} [deps.runtime] -
 *   Injected runtime bag, threaded to the graph client so its auth reads
 *   SERVICE_SECRET.
 * @param {Function} [deps.queryDataInventory] - Data inventory query (default: real query)
 * @returns {Promise<object>} Status result object
 */
export async function runStatus(deps) {
  const grpcMod = deps.grpc || grpc;
  const healthDef = deps.healthDefinition || healthDefinition;
  const fetchFn = deps.fetch || fetch;
  const { clock } = deps;

  const { configs, configErrors } = await loadConfigs(deps.createServiceConfig);
  const services = await checkAllServices(
    grpcMod,
    healthDef,
    configs,
    configErrors,
    fetchFn,
    clock,
  );

  // Data inventory — only query if graph is reachable
  const queryFn = deps.queryDataInventory || queryDataInventory;
  let dataCounts = { resources: 0, triples: 0 };
  if (services.graph?.status === "ok") {
    dataCounts = await queryFn(configs.graph, deps.runtime);
  }
  const data = { ...dataCounts };

  // Credential check — use any available config
  const anyConfig = configs.mcp || configs.graph || Object.values(configs)[0];
  const anthropicTokenStatus = anyConfig
    ? await checkAnthropicToken(anyConfig)
    : "missing";
  const credentials = { ANTHROPIC_API_KEY: anthropicTokenStatus };

  const allServicesOk = Object.values(services).every((s) => s.status === "ok");
  const credentialsOk = credentials.ANTHROPIC_API_KEY === "configured";
  const verdict = allServicesOk && credentialsOk ? "ready" : "not ready";

  return { services, data, credentials, verdict };
}
