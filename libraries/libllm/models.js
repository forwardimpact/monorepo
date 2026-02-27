/**
 * Static map of model names to their context window token budgets
 * Seeded from GitHub Models API via `./scripts/env.sh node scripts/models.js`
 * @type {Map<string, number>}
 */
export const BUDGETS = new Map([
  ["ai21-labs/ai21-jamba-1.5-large", 262144],
  ["cohere/cohere-command-a", 131072],
  ["cohere/cohere-command-r-08-2024", 131072],
  ["cohere/cohere-command-r-plus-08-2024", 131072],
  ["deepseek/deepseek-r1", 128000],
  ["deepseek/deepseek-r1-0528", 128000],
  ["deepseek/deepseek-v3-0324", 128000],
  ["meta/llama-3.2-11b-vision-instruct", 128000],
  ["meta/llama-3.2-90b-vision-instruct", 128000],
  ["meta/llama-3.3-70b-instruct", 128000],
  ["meta/llama-4-maverick-17b-128e-instruct-fp8", 1000000],
  ["meta/llama-4-scout-17b-16e-instruct", 10000000],
  ["meta/meta-llama-3.1-405b-instruct", 131072],
  ["meta/meta-llama-3.1-8b-instruct", 131072],
  ["microsoft/mai-ds-r1", 128000],
  ["microsoft/phi-4", 16384],
  ["microsoft/phi-4-mini-instruct", 128000],
  ["microsoft/phi-4-mini-reasoning", 128000],
  ["microsoft/phi-4-multimodal-instruct", 128000],
  ["microsoft/phi-4-reasoning", 32768],
  ["mistral-ai/codestral-2501", 256000],
  ["mistral-ai/ministral-3b", 131072],
  ["mistral-ai/mistral-medium-2505", 128000],
  ["mistral-ai/mistral-small-2503", 128000],
  ["openai/gpt-4.1", 1048576],
  ["openai/gpt-4.1-mini", 1048576],
  ["openai/gpt-4.1-nano", 1048576],
  ["openai/gpt-4o", 131072],
  ["openai/gpt-4o-mini", 131072],
  ["openai/gpt-5", 200000],
  ["openai/gpt-5-chat", 200000],
  ["openai/gpt-5-mini", 200000],
  ["openai/gpt-5-nano", 200000],
  ["openai/o1", 200000],
  ["openai/o1-mini", 128000],
  ["openai/o1-preview", 128000],
  ["openai/o3", 200000],
  ["openai/o3-mini", 200000],
  ["openai/o4-mini", 200000],
  ["openai/text-embedding-3-large", 8191],
  ["openai/text-embedding-3-small", 8191],
  ["xai/grok-3", 131072],
  ["xai/grok-3-mini", 131072],
]);

/**
 * Returns the token budget for a given model
 * @param {string} model - Model name with provider prefix (e.g., 'openai/gpt-5')
 * @returns {number} Token budget for the model
 * @throws {Error} If model is not found in BUDGETS
 */
export function getBudget(model) {
  const budget = BUDGETS.get(model);
  if (!budget) {
    throw new Error(
      `Unknown model: ${model}. Known models: ${[...BUDGETS.keys()].join(", ")}`,
    );
  }
  return budget;
}
