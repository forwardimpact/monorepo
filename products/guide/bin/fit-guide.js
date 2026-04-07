#!/usr/bin/env node
/**
 * fit-guide CLI
 *
 * Conversational agent interface for the Guide knowledge platform.
 *
 * Usage:
 *   npx fit-guide
 *   echo "Tell me about the company" | npx fit-guide
 */

import fs from "fs/promises";
import { homedir } from "os";
import { resolve } from "path";

import { Repl } from "@forwardimpact/librepl";

const usage = `**fit-guide** — Conversational agent for the Guide knowledge platform

Send conversational messages to the Agent service for processing.
The agent maintains conversation context across multiple turns.

**Examples:**

    echo "Tell me about the company" | npx fit-guide
    printf "What is microservices?\\nWhat are the benefits?\\n" | npx fit-guide

Documentation: https://www.forwardimpact.team/guide`;

// Module-level service handles, populated by setup() after CLI args are parsed.
// Kept outside REPL state so they aren't serialized to storage.
let dataDir = null;
let useStreaming = false;
let agentClient = null;
let agentConfig = null;
let logger = null;

/**
 * Prints the package version and exits the REPL early.
 * @returns {Promise<void>}
 */
async function showVersion() {
  const { version } = JSON.parse(
    await fs.readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  console.log(version);
}

/**
 * Generates secrets, writes .env, and copies starter config into ./config/.
 * @returns {Promise<void>}
 */
async function runInit() {
  const { generateJWT, generateSecret, getOrGenerateSecret, updateEnvFile } =
    await import("@forwardimpact/libsecret");

  const serviceSecret = generateSecret();
  const jwtSecret = await getOrGenerateSecret("JWT_SECRET", () =>
    generateSecret(32),
  );
  const jwtAnonKey = generateJWT(
    {
      iss: "supabase",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 60 * 60,
      role: "anon",
    },
    jwtSecret,
  );

  await updateEnvFile("SERVICE_SECRET", serviceSecret);
  await updateEnvFile("JWT_SECRET", jwtSecret);
  await updateEnvFile("JWT_ANON_KEY", jwtAnonKey);

  // Assign unique ports so services don't all bind to the default 3000
  const serviceUrls = {
    SERVICE_WEB_URL: "http://localhost:3001",
    SERVICE_AGENT_URL: "grpc://localhost:3002",
    SERVICE_MEMORY_URL: "grpc://localhost:3003",
    SERVICE_LLM_URL: "grpc://localhost:3004",
    SERVICE_VECTOR_URL: "grpc://localhost:3005",
    SERVICE_GRAPH_URL: "grpc://localhost:3006",
    SERVICE_TOOL_URL: "grpc://localhost:3007",
    SERVICE_TRACE_URL: "grpc://localhost:3008",
  };

  for (const [key, url] of Object.entries(serviceUrls)) {
    await updateEnvFile(key, url);
  }

  console.log("SERVICE_SECRET was updated in .env");
  console.log("JWT_SECRET is set in .env");
  console.log("JWT_ANON_KEY was updated in .env");
  console.log("Service URLs written to .env (ports 3001–3008).");

  // Copy starter config into ./config/ (config.json, agents/, tools.yml)
  const starterDir = new URL("../starter", import.meta.url).pathname;
  const configDir = resolve("config");

  try {
    await fs.access(starterDir);
  } catch {
    console.error("Error: Starter data not found in package.");
    console.error("This may indicate a corrupted package installation.");
    process.exit(1);
  }

  try {
    await fs.access(configDir);
    console.log("config/ already exists, skipping starter copy.");
  } catch {
    await fs.cp(starterDir, configDir, { recursive: true });
    console.log(`config/ created with starter configuration.

  config/
  ├── config.json                  # Service configuration
  ├── agents/
  │   ├── planner.agent.md         # Plans retrieval strategy
  │   ├── researcher.agent.md      # Retrieves data
  │   └── editor.agent.md          # Synthesizes response
  └── tools.yml                    # Tool definitions`);
  }
}

/**
 * Resolves the data directory, validates the local config, and wires up the
 * agent service client. Runs after CLI flag handlers, before the REPL loop.
 * @returns {Promise<void>}
 */
async function setupServices() {
  // Onboarding check — guide the user if --init has never been run
  try {
    await fs.access(resolve("config", "config.json"));
  } catch {
    console.log(`fit-guide — Conversational agent for the Guide knowledge platform

Run npx fit-guide --init to generate configuration, then
npx fit-rc start to launch the service stack.

Documentation: https://www.forwardimpact.team/guide
Run npx fit-guide --help for CLI options.`);
    process.exit(1);
  }

  const { createServiceConfig } = await import("@forwardimpact/libconfig");
  const { createClient, createTracer } = await import("@forwardimpact/librpc");
  const { createLogger } = await import("@forwardimpact/libtelemetry");
  const { Finder } = await import("@forwardimpact/libutil");

  logger = createLogger("cli");

  if (!dataDir) {
    const finder = new Finder(fs, logger, process);
    try {
      dataDir = finder.findData("data", homedir());
    } catch {
      throw new Error(
        "No data directory found. Use --data <path> to specify location.",
      );
    }
  }

  agentConfig = await createServiceConfig("agent");
  const tracer = await createTracer("cli");
  agentClient = await createClient("agent", logger, tracer);
}

/**
 * Sends a user prompt to the agent service via either the streaming or unary
 * RPC and writes the response back through the REPL output stream.
 * @param {string} prompt - The user's input prompt
 * @param {object} state - REPL state (carries resource_id across turns)
 * @param {import("stream").Writable} outputStream - Stream to write results to
 * @returns {Promise<void>}
 */
async function handlePrompt(prompt, state, outputStream) {
  const { agent, common } = await import("@forwardimpact/libtype");

  const userMessage = common.Message.fromObject({
    role: "user",
    content: prompt,
  });
  const request = agent.AgentRequest.fromObject({
    messages: [userMessage],
    llm_token: await agentConfig.llmToken(),
    resource_id: state.resource_id,
    model: agentConfig.model,
    agent: agentConfig.agent,
  });

  const rpcName = useStreaming ? "ProcessStream" : "ProcessUnary";

  try {
    if (useStreaming) {
      const stream = agentClient.ProcessStream(request);
      for await (const response of stream) {
        if (response.resource_id) {
          state.resource_id = response.resource_id;
        }
        if (response.messages?.length > 0) {
          const text = response.messages.map((msg) => msg.content).join("\n");
          outputStream.write(text);
        }
      }
    } else {
      const response = await agentClient.ProcessUnary(request);
      if (response.resource_id) {
        state.resource_id = response.resource_id;
      }
      if (response.messages?.length > 0) {
        const text = response.messages.map((msg) => msg.content).join("\n");
        outputStream.write(text);
      }
    }
  } catch (err) {
    logger.exception(rpcName, err);
    throw err;
  }
}

const { createStorage } = await import("@forwardimpact/libstorage");
const storage = createStorage("cli");

const repl = new Repl({
  prompt: "> ",
  usage,
  storage,
  state: {
    resource_id: null,
  },
  commands: {
    version: {
      usage: "Show version",
      type: "boolean",
      handler: async () => {
        await showVersion();
        return false;
      },
    },
    init: {
      usage: "Generate secrets, .env, and config/config.json",
      type: "boolean",
      handler: async () => {
        await runInit();
        return false;
      },
    },
    data: {
      usage: "Path to framework data directory",
      handler: ([path]) => {
        dataDir = resolve(path);
      },
    },
    streaming: {
      usage: "Use the streaming agent endpoint (default: unary)",
      type: "boolean",
      handler: () => {
        useStreaming = true;
      },
    },
  },
  setup: setupServices,
  onLine: handlePrompt,
});

try {
  await repl.start();
} catch (err) {
  console.error(`Failed to connect to the Guide service stack.

Error: ${err.message}

Ensure all required services are running:
  agent, llm, memory, graph, vector, tool, trace, web

Start the service stack: npx fit-rc start
Documentation: https://www.forwardimpact.team/guide`);
  process.exit(1);
}
