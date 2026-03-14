/**
 * Prose Engine — LLM-assisted prose generation with cache.
 *
 * Uses libllm for completions, libutil for cache key hashing,
 * and libprompt for prompt template loading.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { generateHash } from "@forwardimpact/libutil";
import { createLogger } from "@forwardimpact/libtelemetry";
import { PromptLoader } from "@forwardimpact/libprompt";

const __dirname = dirname(fileURLToPath(import.meta.url));

export class ProseEngine {
  /**
   * @param {object} options
   * @param {string} options.cachePath      Path to .prose-cache.json
   * @param {string} options.mode           "cached" | "generate" | "no-prose"
   * @param {boolean} [options.strict]      Fail on cache miss
   * @param {import('@forwardimpact/libllm').LlmApi} options.llmApi
   *        Pre-configured LLM client — required when mode is "generate"
   * @param {import('@forwardimpact/libprompt').PromptLoader} options.promptLoader
   *        Prompt template loader
   * @param {object} options.logger         Logger instance
   */
  constructor({
    cachePath,
    mode,
    strict = false,
    llmApi,
    promptLoader,
    logger,
  }) {
    if (!cachePath) throw new Error("cachePath is required");
    if (!mode) throw new Error("mode is required");
    if (!promptLoader) throw new Error("promptLoader is required");
    if (!logger) throw new Error("logger is required");
    this.cachePath = cachePath;
    this.mode = mode;
    this.strict = strict;
    this.llmApi = llmApi;
    this.promptLoader = promptLoader;
    this.logger = logger;
    this.cache = this.#loadCache();
    this.dirty = false;
  }

  /**
   * Generate or retrieve prose for a key.
   * @param {string} key
   * @param {object} context
   * @returns {Promise<string|null>}
   */
  async generateProse(key, context) {
    if (this.mode === "no-prose") return null;

    const cacheKey = generateHash(key, JSON.stringify(context));

    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

    if (this.mode === "cached") {
      if (this.strict) throw new Error(`Cache miss: '${key}'`);
      return null;
    }

    // Tier 1: generate via libllm
    const prose = await this.#callLlm(key, context);
    if (prose) {
      this.cache.set(cacheKey, prose);
      this.dirty = true;
    }
    return prose;
  }

  /**
   * @param {string} key
   * @param {object} context
   * @returns {Promise<string|null>}
   */
  async #callLlm(key, context) {
    const prompt = this.#buildPrompt(key, context);
    const response = await this.llmApi.createCompletions({
      messages: [
        { role: "system", content: this.promptLoader.load("prose-system") },
        { role: "user", content: prompt },
      ],
      max_tokens: context.maxTokens || 500,
    });
    const content = response.choices?.[0]?.message?.content?.trim() || null;
    this.logger.info("prose", `Generated: ${key}`, {
      chars: content ? content.length : 0,
    });
    return content;
  }

  /**
   * Generate or retrieve a structured response (pre-built messages).
   * @param {string} key - Cache key
   * @param {object[]} messages - Pre-built messages array [{role, content}]
   * @returns {Promise<string|null>}
   */
  async generateStructured(key, messages) {
    if (this.mode === "no-prose") return null;

    const cacheKey = generateHash(key, JSON.stringify(messages));

    if (this.cache.has(cacheKey)) {
      this.logger.debug("prose", `Cache hit: ${key}`);
      return this.cache.get(cacheKey);
    }

    if (this.mode === "cached") {
      if (this.strict) throw new Error(`Cache miss: '${key}'`);
      return null;
    }

    const response = await this.llmApi.createCompletions({
      messages,
      max_tokens: 4000,
    });
    const content = response.choices?.[0]?.message?.content?.trim() || null;
    if (content) {
      this.cache.set(cacheKey, content);
      this.dirty = true;
    }
    this.logger.info("prose", `Generated structured: ${key}`, {
      chars: content ? content.length : 0,
    });
    return content;
  }

  /**
   * Generate structured output and parse as JSON.
   * @param {string} key - Cache key
   * @param {object[]} messages - Pre-built messages array
   * @returns {Promise<object|null>}
   */
  async generateJson(key, messages) {
    const raw = await this.generateStructured(key, messages);
    if (!raw) return null;
    const cleaned = raw
      .replace(/^```(?:json)?\s*\n?/m, "")
      .replace(/\n?```\s*$/m, "")
      .trim();
    return JSON.parse(cleaned);
  }

  /** @returns {Map<string, string>} */
  getProseMap() {
    return this.cache;
  }

  saveCache() {
    if (!this.dirty || !this.cachePath) return;
    writeFileSync(
      this.cachePath,
      JSON.stringify(Object.fromEntries(this.cache), null, 2),
    );
  }

  /**
   * Build a prompt from key and context.
   * @param {string} key
   * @param {object} context
   * @returns {string}
   */
  #buildPrompt(key, context) {
    return this.promptLoader.render("prose-user", {
      topic: context.topic || key.replace(/_/g, " ").replace(/-/g, " "),
      tone: context.tone || "technical",
      length: context.length || "2-3 paragraphs",
      domain: context.domain,
      role: context.role,
      audience: context.audience,
      scenario: context.scenario,
      driver: context.driver,
      direction: context.direction,
      magnitude: context.magnitude,
    });
  }

  #loadCache() {
    try {
      if (this.cachePath && existsSync(this.cachePath)) {
        return new Map(
          Object.entries(JSON.parse(readFileSync(this.cachePath, "utf-8"))),
        );
      }
    } catch {
      /* cache corrupt or missing */
    }
    return new Map();
  }
}

/**
 * Creates a ProseEngine with real dependencies wired.
 * @param {object} options
 * @param {string} options.cachePath - Path to .prose-cache.json
 * @param {string} options.mode - "cached" | "generate" | "no-prose"
 * @param {boolean} [options.strict] - Fail on cache miss
 * @param {import('@forwardimpact/libllm').LlmApi} [options.llmApi] - LLM client
 * @returns {ProseEngine}
 */
export function createProseEngine(options) {
  const logger = createLogger("universe");
  const promptLoader = new PromptLoader(join(__dirname, "..", "prompts"));
  return new ProseEngine({ ...options, promptLoader, logger });
}
