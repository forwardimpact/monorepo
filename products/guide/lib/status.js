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
 * @param {number} timeoutMs - Deadline in milliseconds
 * @returns {Promise<string>} "ok" or "unreachable"
 */
function checkGrpcHealth(grpcMod, healthDef, config, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const ClientCtor = grpcMod.makeGenericClientConstructor(
      healthDef,
      "Health",
    );
    const host = config.host === "0.0.0.0" ? "localhost" : config.host;
    const uri = `${host}:${config.port}`;
    const client = new ClientCtor(uri, grpcMod.credentials.createInsecure());

    const deadline = new Date(Date.now() + timeoutMs);
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
 * Checks the web service via HTTP /web/health.
 * @param {object} config - Service config with url property
 * @param {Function} fetchFn - Fetch implementation
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<string>} "ok" or "unreachable"
 */
function checkWebHealth(config, fetchFn = fetch, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    fetchFn(`${config.url}/web/health`, { signal: controller.signal })
      .then((res) => {
        clearTimeout(timer);
        resolve(res.ok ? "ok" : "unreachable");
      })
      .catch(() => {
        clearTimeout(timer);
        resolve("unreachable");
      });
  });
}

/**
 * Queries graph service for resource and triple counts.
 * @param {object} graphConfig - Graph service config
 * @returns {Promise<{resources: number, triples: number}>}
 */
async function queryDataInventory(graphConfig) {
  try {
    const { GraphClient } =
      await import("@forwardimpact/librpc/generated/services/graph/client.js");
    const { graph } = await import("@forwardimpact/libtype");

    const client = new GraphClient(graphConfig);

    const subjectsReq = graph.SubjectsQuery.fromObject({});
    const subjectsRes = await client.GetSubjects(subjectsReq);
    const resourceCount = subjectsRes.content
      ? subjectsRes.content.split("\n").filter(Boolean).length
      : 0;

    const patternReq = graph.PatternQuery.fromObject({});
    const patternRes = await client.QueryByPattern(patternReq);
    const tripleCount = patternRes.identifiers
      ? patternRes.identifiers.length
      : 0;

    return { resources: resourceCount, triples: tripleCount };
  } catch {
    return { resources: 0, triples: 0 };
  }
}

/**
 * Counts *.agent.md files in config/agents/.
 * @param {object} fsModule - Node fs/promises module
 * @returns {Promise<number>}
 */
async function countAgents(fsModule) {
  try {
    const entries = await fsModule.readdir("config/agents");
    return entries.filter((f) => f.endsWith(".agent.md")).length;
  } catch {
    return 0;
  }
}

const SERVICE_NAMES = [
  "agent",
  "llm",
  "memory",
  "graph",
  "vector",
  "tool",
  "trace",
  "web",
];

const GRPC_SERVICES = [
  "agent",
  "llm",
  "memory",
  "graph",
  "vector",
  "tool",
  "trace",
];

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
 * Runs health checks against all services in parallel.
 * @returns {Promise<object>} Map of service name to {url, status}
 */
async function checkAllServices(
  grpcMod,
  healthDef,
  configs,
  configErrors,
  fetchFn,
) {
  const checks = GRPC_SERVICES.map((name) => {
    if (configErrors.has(name)) return Promise.resolve([name, "unreachable"]);
    return checkGrpcHealth(grpcMod, healthDef, configs[name]).then((s) => [
      name,
      s,
    ]);
  });
  if (configErrors.has("web")) {
    checks.push(Promise.resolve(["web", "unreachable"]));
  } else {
    checks.push(checkWebHealth(configs.web, fetchFn).then((s) => ["web", s]));
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
 * Checks LLM credential availability.
 * @param {object} llmConfig - LLM service config
 * @returns {Promise<string>} "configured" or "missing"
 */
async function checkLlmToken(llmConfig) {
  try {
    const token = await llmConfig.llmToken();
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
 * @returns {Promise<object>} Status result object
 */
export async function runStatus(deps) {
  const grpcMod = deps.grpc || grpc;
  const healthDef = deps.healthDefinition || healthDefinition;
  const fetchFn = deps.fetch || fetch;

  const { configs, configErrors } = await loadConfigs(deps.createServiceConfig);
  const services = await checkAllServices(
    grpcMod,
    healthDef,
    configs,
    configErrors,
    fetchFn,
  );

  // Data inventory — only query if graph is reachable
  let dataCounts = { resources: 0, triples: 0 };
  if (services.graph?.status === "ok") {
    dataCounts = await queryDataInventory(configs.graph);
  }
  const agents = await countAgents(deps.fs);
  const data = { ...dataCounts, agents };

  const llmTokenStatus = configErrors.has("llm")
    ? "missing"
    : await checkLlmToken(configs.llm);
  const credentials = { LLM_TOKEN: llmTokenStatus };

  const allServicesOk = Object.values(services).every((s) => s.status === "ok");
  const credentialsOk = credentials.LLM_TOKEN === "configured";
  const verdict = allServicesOk && credentialsOk ? "ready" : "not ready";

  return { services, data, credentials, verdict };
}
