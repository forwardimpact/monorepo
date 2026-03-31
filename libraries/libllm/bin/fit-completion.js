#!/usr/bin/env bun
import { createServiceConfig } from "@forwardimpact/libconfig";
import { createLlmApi } from "@forwardimpact/libllm";

/**
 * Sends a completion request to the LLM API
 * Reads a JSON memory window from stdin
 * Usage: echo '{"messages":[...]}' | fit-completion
 * @returns {Promise<void>}
 */
async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const input = Buffer.concat(chunks).toString().trim();
  if (!input) {
    console.error("Usage: echo '{\"messages\":[...]}' | fit-completion");
    process.exit(1);
  }

  const window = JSON.parse(input);
  const agentConfig = await createServiceConfig("agent");

  const llm = createLlmApi(
    await agentConfig.llmToken(),
    agentConfig.model,
    agentConfig.llmBaseUrl(),
    agentConfig.embeddingBaseUrl(),
  );

  const response = await llm.createCompletions(window);
  console.log(JSON.stringify(response, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
