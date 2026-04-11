---
name: libs-llm-orchestration
description: >
  LLM orchestration for AI features. libllm provides the API client for
  completions and embeddings. libmemory manages conversation history within
  token budgets. libprompt loads and renders prompt templates. libagent
  orchestrates multi-turn conversations with tool use. Use when integrating LLM
  capabilities, building agents, or managing AI context windows.
---

# LLM Orchestration

## When to Use

- Making LLM chat completion or embedding requests
- Managing conversation memory within token budgets
- Loading and rendering prompt templates from files
- Building conversational agents with tool calling and multi-turn state

## Libraries

| Library   | Main API                             | Purpose                                                      |
| --------- | ------------------------------------ | ------------------------------------------------------------ |
| libllm    | `LlmApi`                             | HTTP client for OpenAI-compatible completions and embeddings |
| libmemory | `WindowBuilder`, `createWindow`      | Token-budgeted context window construction                   |
| libprompt | `PromptLoader`, `createPromptLoader` | Load and render .prompt.md templates                         |
| libagent  | `AgentMind`, `AgentAction`           | Multi-turn conversation orchestration with tools             |

## Decision Guide

- **libllm alone vs libagent** — Use `LlmApi` directly for single-shot
  completions (embeddings, classification, one-off generation). Use `AgentMind`
  for multi-turn conversations with tool calling and memory management.
- **libprompt vs inline strings** — Always use `PromptLoader` for system prompts
  (supports Mustache variable substitution, file-based management). Use inline
  strings only for dynamic user messages constructed at runtime.
- **libmemory** — Used internally by `AgentMind`. Access `WindowBuilder`
  directly only when building custom memory strategies or non-standard context
  window layouts.

## Composition Recipes

### Recipe 1: Single-shot LLM call

```javascript
import { LlmApi } from "@forwardimpact/libllm";

const api = new LlmApi(config, logger);
const response = await api.completion(
  [{ role: "user", content: "Summarize this document" }],
  { model: "gpt-4", maxTokens: 1000 },
);
```

### Recipe 2: Multi-turn agent with tools

```javascript
import { AgentMind } from "@forwardimpact/libagent";
import { createPromptLoader } from "@forwardimpact/libprompt";

const promptLoader = createPromptLoader("./prompts");
const agent = new AgentMind(memoryClient, llmClient, toolClient);

const response = await agent.process({
  resourceId: conversationId,
  content: "What is the weather?",
});

// Streaming
for await (const chunk of agent.stream(request)) {
  process.stdout.write(chunk.content);
}
```

### Recipe 3: Custom memory window

```javascript
import { WindowBuilder } from "@forwardimpact/libmemory";
import { PromptLoader } from "@forwardimpact/libprompt";

const loader = new PromptLoader("./prompts");
const systemPrompt = loader.render("system", { agentName: "Assistant" });

const builder = new WindowBuilder(tokenizer);
const window = await builder.build({
  messages: conversationHistory,
  tools: availableTools,
  budget: 4000,
});
```

## DI Wiring

### libllm

```javascript
// LlmApi — accepts config and logger
const api = new LlmApi(config, logger);
const response = await api.completion(messages, options);
const embeddings = await api.embed(texts);
```

### libmemory

```javascript
// WindowBuilder — accepts tokenizer
const builder = new WindowBuilder(tokenizer);

// createWindow — factory for common usage
const window = await createWindow(resourceId, { maxTokens: 4000, systemPrompt });

// MemoryIndex — stores conversation identifiers
const index = new MemoryIndex(storage);
```

### libprompt

```javascript
// PromptLoader — accepts directory path
const loader = new PromptLoader("./prompts");
const rendered = loader.render("system", { agentName: "Assistant" });

// createPromptLoader — convenience factory
const loader = createPromptLoader("./prompts");
```

### libagent

```javascript
// AgentMind — accepts memoryClient, llmClient, toolClient
const agent = new AgentMind(memoryClient, llmClient, toolClient);
const response = await agent.process({ resourceId, content });
```
