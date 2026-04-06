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

import { resolve } from "path";
import fs from "fs/promises";
import { homedir } from "os";

// --help flag (works without SERVICE_SECRET)
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`fit-guide — Conversational agent for the Guide knowledge platform

Usage:
  npx fit-guide                   Start interactive conversation
  npx fit-guide --data=<path>     Specify framework data directory
  echo "question" | npx fit-guide Pipe a question directly

Options:
  --data=<path>   Path to framework data directory
  --init          Generate secrets, .env, and config/config.json
  --help, -h      Show this help message
  --version, -v   Show version

Guide connects to the Forward Impact service stack to provide
AI-powered guidance grounded in your engineering framework.

Documentation: https://www.forwardimpact.team/guide`);
  process.exit(0);
}

// --version flag (works without SERVICE_SECRET)
if (process.argv.includes("--version") || process.argv.includes("-v")) {
  const { version } = JSON.parse(
    await fs.readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  console.log(version);
  process.exit(0);
}

// --init flag (works without SERVICE_SECRET)
if (process.argv.includes("--init")) {
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

  process.exit(0);
}

// SERVICE_SECRET gate — provide onboarding instructions instead of a cryptic error
if (!process.env.SERVICE_SECRET) {
  console.log(`fit-guide — Conversational agent for the Guide knowledge platform

Guide requires a running service stack to function. The following
services must be available:

  agent, llm, memory, graph, vector, tool, trace, web

To get started:

  1. Run: npx fit-guide --init
  2. Load environment: set -a && source .env && set +a
  3. Start the service stack: npx fit-rc start
  4. Run: npx fit-guide

Documentation: https://www.forwardimpact.team/guide
Run npx fit-guide --help for CLI options.`);
  process.exit(1);
}

// Pre-flight validation: check config and environment before connecting
{
  const configPath = resolve("config", "config.json");
  let configData;
  try {
    configData = JSON.parse(await fs.readFile(configPath, "utf8"));
  } catch {
    console.error(
      `Error: config/config.json not found or invalid.\nRun: npx fit-guide --init`,
    );
    process.exit(1);
  }

  const agentConfig = configData?.service?.agent;
  const errors = [];

  if (!agentConfig?.agent) {
    errors.push(
      `No agent configured. Add a "service.agent.agent" field to config/config.json.`,
    );
  }
  if (!agentConfig?.model) {
    errors.push(
      `No model configured. Add a "service.agent.model" field to config/config.json.`,
    );
  }
  if (!process.env.LLM_TOKEN) {
    errors.push(`LLM_TOKEN is not set in the environment. Add it to .env.`);
  }
  if (!process.env.LLM_BASE_URL) {
    errors.push(`LLM_BASE_URL is not set in the environment. Add it to .env.`);
  }

  if (errors.length > 0) {
    console.error(
      `Configuration errors:\n\n  ${errors.join("\n  ")}\n\nSee: https://www.forwardimpact.team/docs/reference/configuration/`,
    );
    process.exit(1);
  }
}

try {
  const { createServiceConfig } = await import("@forwardimpact/libconfig");
  const { Repl } = await import("@forwardimpact/librepl");
  const { createClient, createTracer } = await import("@forwardimpact/librpc");
  const { createLogger } = await import("@forwardimpact/libtelemetry");
  const { agent, common } = await import("@forwardimpact/libtype");
  const { createStorage } = await import("@forwardimpact/libstorage");
  const { Finder } = await import("@forwardimpact/libutil");

  const usage = `**Usage:** <message>

Send conversational messages to the Agent service for processing.
The agent maintains conversation context across multiple turns.

**Examples:**

    echo "Tell me about the company" | npx fit-guide
    printf "What is microservices?\\nWhat are the benefits?\\n" | npx fit-guide`;

  // Parse --data flag from CLI args
  const dataArg = process.argv.find((a) => a.startsWith("--data="));
  let dataDir;
  if (dataArg) {
    dataDir = resolve(dataArg.slice(7));
  } else {
    const guideLogger = createLogger("cli");
    const finder = new Finder(fs, guideLogger, process);
    try {
      dataDir = finder.findData("data", homedir());
    } catch {
      throw new Error(
        "No data directory found. Use --data=<path> to specify location.",
      );
    }
  }

  const config = await createServiceConfig("agent");
  const logger = createLogger("cli");
  const tracer = await createTracer("cli");
  const agentClient = await createClient("agent", logger, tracer);

  // Create storage for persisting REPL state
  const storage = createStorage("cli");

  /**
   * Handles user prompts by adding them to message history,
   * sending to the Agent service, and returning the response
   * @param {string} prompt - The user's input prompt
   * @param {object} state - The REPL state object
   * @param {import("stream").Writable} outputStream - Stream to write results to
   */
  async function handlePrompt(prompt, state, outputStream) {
    try {
      // Create user message - content is just a string
      const userMessage = common.Message.fromObject({
        role: "user",
        content: prompt,
      });

      // Create typed request using agent.AgentRequest
      const request = agent.AgentRequest.fromObject({
        messages: [userMessage],
        llm_token: await config.llmToken(),
        resource_id: state.resource_id,
        model: config.model,
        agent: config.agent,
      });

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
    } catch (err) {
      logger.exception("ProcessStream", err);
      throw err;
    }
  }

  // Create REPL with dependency injection
  const repl = new Repl({
    usage,
    storage,
    state: {
      resource_id: null,
      dataDir,
    },
    onLine: handlePrompt,
    afterLine: (state) => {
      return logger.debug("ProcessStream", "Stream ended", {
        resource_id: state.resource_id,
      });
    },
  });

  repl.start();
} catch (err) {
  console.error(`Failed to connect to the Guide service stack.

Error: ${err.message}

Ensure all required services are running:
  agent, llm, memory, graph, vector, tool, trace, web

Start the service stack: npx fit-rc start
Documentation: https://www.forwardimpact.team/guide`);
  process.exit(1);
}
