#!/usr/bin/env bun
/**
 * fit-guide CLI
 *
 * Conversational agent interface for the Guide knowledge platform.
 *
 * Usage:
 *   bunx fit-guide
 *   echo "Tell me about the company" | bunx fit-guide
 */

import { resolve } from "path";
import fs from "fs/promises";
import { homedir } from "os";

// --help flag (works without SERVICE_SECRET)
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`fit-guide — Conversational agent for the Guide knowledge platform

Usage:
  bunx fit-guide                   Start interactive conversation
  bunx fit-guide --data=<path>     Specify framework data directory
  echo "question" | bunx fit-guide Pipe a question directly

Options:
  --data=<path>   Path to framework data directory
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

// SERVICE_SECRET gate — provide onboarding instructions instead of a cryptic error
if (!process.env.SERVICE_SECRET) {
  console.log(`fit-guide — Conversational agent for the Guide knowledge platform

Guide requires a running service stack to function. The following
services must be available:

  agent, llm, memory, graph, vector, tool, trace, web

To get started:

  1. Clone the monorepo and run: make services
  2. Set SERVICE_SECRET in your environment
  3. Run: bunx fit-guide

Documentation: https://www.forwardimpact.team/guide
Run bunx fit-guide --help for CLI options.`);
  process.exit(1);
}

import { createServiceConfig } from "@forwardimpact/libconfig";
import { Repl } from "@forwardimpact/librepl";
import { createClient, createTracer } from "@forwardimpact/librpc";
import { createLogger } from "@forwardimpact/libtelemetry";
import { agent, common } from "@forwardimpact/libtype";
import { createStorage } from "@forwardimpact/libstorage";
import { Finder } from "@forwardimpact/libutil";

const usage = `**Usage:** <message>

Send conversational messages to the Agent service for processing.
The agent maintains conversation context across multiple turns.

**Examples:**

    echo "Tell me about the company" | bunx fit-guide
    printf "What is microservices?\\nWhat are the benefits?\\n" | bunx fit-guide`;

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

try {
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

For local development: make services
Documentation: https://www.forwardimpact.team/guide`);
  process.exit(1);
}
