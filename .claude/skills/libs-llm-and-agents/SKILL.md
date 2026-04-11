---
name: libs-llm-and-agents
description: >
  Use when calling an LLM for chat completions, embeddings, or vision
  descriptions; managing conversation memory within a model token budget;
  loading and rendering .prompt.md templates with Mustache variables; building
  or running multi-turn agents with tool calling; binding a protobuf tool
  service as an LLM-callable tool; generating a JSON schema from a protobuf
  tool definition; describing a tool to an LLM.
---

# LLM and Agents

## When to Use

- Making LLM chat completion or embedding requests
- Managing conversation memory within token budgets
- Loading and rendering prompt templates from files
- Building conversational agents with tool calling and multi-turn state
- Binding a protobuf tool service into the agent loop

## Libraries

| Library   | Capabilities                                                                                                                 | Key Exports                                                                               |
| --------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| libllm    | Call OpenAI-compatible chat completions and embedding endpoints; describe an image; list available models                    | `LlmApi`, `createLlmApi`, `createProxyAwareFetch`, `normalizeVector`, `DEFAULT_BASE_URL`  |
| libmemory | Build a memory window of tool definitions and message history within a model token budget                                    | `MemoryWindow`, `getModelBudget`                                                          |
| libprompt | Load .prompt.md files from a directory and render them with Mustache variable substitution                                   | `PromptLoader`, `createPromptLoader`                                                      |
| libagent  | Run multi-turn conversations with tool calling, hand off messages between memory/llm/tool services                           | `AgentMind`, `AgentHands`                                                                 |
| libtool   | Register a protobuf tool service, generate an OpenAI-compatible schema from a protobuf definition, describe a tool to an LLM | `ToolProcessor`, `mapFieldToSchema`, `generateSchemaFromProtobuf`, `buildToolDescription` |

## Decision Guide

- **libllm alone vs libagent** — Use `LlmApi` directly for single-shot
  completions (embeddings, classification, one-off generation). Use `AgentMind`
  for multi-turn conversations with tool calling and memory management.
- **libprompt vs inline strings** — Always use `PromptLoader` for system prompts
  (supports Mustache variable substitution, file-based management). Use inline
  strings only for dynamic user messages constructed at runtime.
- **libmemory** — Used internally by `AgentMind`. Access `MemoryWindow` directly
  only when building custom memory strategies or non-standard context window
  layouts.
- **libtool vs libagent** — `ToolProcessor` for binding a protobuf tool service
  into an LLM-callable tool; `AgentMind` for running the conversation that
  invokes the tool. Use both together.

## Composition Recipes

### Recipe 1: Single-shot LLM call

```javascript
import { createLlmApi } from "@forwardimpact/libllm";

const api = createLlmApi(token, "gpt-4", baseUrl, embeddingBaseUrl);
const response = await api.createCompletions(window);
```

### Recipe 2: Multi-turn agent with tools

```javascript
import { AgentMind } from "@forwardimpact/libagent";
import { createPromptLoader } from "@forwardimpact/libprompt";

const promptLoader = createPromptLoader("./prompts");
const agent = new AgentMind(memoryCallbacks, llmCallbacks, toolCallbacks);

const response = await agent.process({
  resourceId: conversationId,
  content: "What is the weather?",
});
```

### Recipe 3: Custom memory window

```javascript
import { MemoryWindow, getModelBudget } from "@forwardimpact/libmemory";

const window = new MemoryWindow(resourceId, resourceIndex, memoryIndex);
const { messages, tools } = await window.build("gpt-4", 1000);
```

### Recipe 4: Register a protobuf tool

```javascript
import {
  ToolProcessor,
  generateSchemaFromProtobuf,
  buildToolDescription,
} from "@forwardimpact/libtool";

const schema = generateSchemaFromProtobuf(definition);
const description = buildToolDescription(definition);
const processor = new ToolProcessor(services, logger);
```

## DI Wiring

### libllm

```javascript
// LlmApi — accepts token, model, baseUrl, embeddingBaseUrl, retry, fetchFn, tokenizerFn
const api = new LlmApi(token, model, baseUrl, embeddingBaseUrl, retry);

// createLlmApi — factory auto-wiring Retry, proxy-aware fetch, tokenizer
const api = createLlmApi(token, model, baseUrl, embeddingBaseUrl);
```

### libmemory

```javascript
// MemoryWindow — accepts resourceId, resourceIndex, memoryIndex
const window = new MemoryWindow(resourceId, resourceIndex, memoryIndex);
```

### libprompt

```javascript
// PromptLoader — accepts directory path
const loader = new PromptLoader("./prompts");

// createPromptLoader — convenience factory
const loader = createPromptLoader("./prompts");
```

### libagent

```javascript
// AgentMind — accepts memory, llm, tool callback interfaces
const agent = new AgentMind(memoryCallbacks, llmCallbacks, toolCallbacks);
```

### libtool

```javascript
// ToolProcessor — accepts service registry and logger
const processor = new ToolProcessor(services, logger);

// Pure helpers for schema generation
import {
  mapFieldToSchema,
  generateSchemaFromProtobuf,
  buildToolDescription,
} from "@forwardimpact/libtool";
```
