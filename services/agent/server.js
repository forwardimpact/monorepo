import { Server, createClient } from "@forwardimpact/librpc";
import { createServiceConfig } from "@forwardimpact/libconfig";
import { createResourceIndex } from "@forwardimpact/libresource";
import { AgentMind, AgentHands } from "@forwardimpact/libagent";
import { createTracer } from "@forwardimpact/librpc";
import { createLogger } from "@forwardimpact/libtelemetry";

import { AgentService } from "./index.js";

const agentConfig = await createServiceConfig("agent");

// Initialize observability
const logger = createLogger("agent");
const tracer = await createTracer("agent");

const memoryClient = await createClient("memory", logger, tracer);
const llmClient = await createClient("llm", logger, tracer);
const toolClient = await createClient("tool", logger, tracer);

const resourceIndex = createResourceIndex("resources");

// Create callbacks for AgentHands and AgentMind
const callbacks = {
  memory: {
    append: memoryClient.AppendMemory.bind(memoryClient),
    get: memoryClient.GetWindow.bind(memoryClient),
  },
  llm: {
    createCompletions: llmClient.CreateCompletions.bind(llmClient),
  },
  tool: {
    call: toolClient.CallTool.bind(toolClient),
  },
};

const agentHands = new AgentHands(callbacks, resourceIndex);
const agentMind = new AgentMind(
  agentConfig,
  callbacks,
  resourceIndex,
  agentHands,
);

const service = new AgentService(agentConfig, agentMind, resourceIndex);

const server = new Server(service, agentConfig, logger, tracer);

await server.start();
