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
import { PromptLoader } from "@forwardimpact/libprompt";

const __dirname = dirname(fileURLToPath(import.meta.url));
const prompts = new PromptLoader(join(__dirname, "..", "prompts"));

export class ProseEngine {
  /**
   * @param {object} options
   * @param {string} options.cachePath      Path to .prose-cache.json
   * @param {string} options.mode           "cached" | "generate" | "no-prose"
   * @param {boolean} [options.strict]      Fail on cache miss
   * @param {import('@forwardimpact/libllm').LlmApi} [options.llmApi]
   *        Pre-configured LLM client — required when mode is "generate"
   */
  constructor({ cachePath, mode, strict = false, llmApi = null }) {
    this.cachePath = cachePath;
    this.mode = mode;
    this.strict = strict;
    this.llmApi = llmApi;
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
    const prompt = buildPrompt(key, context);
    // LlmApi.createCompletions expects a window object with messages array
    const response = await this.llmApi.createCompletions({
      messages: [
        { role: "system", content: prompts.load("prose-system") },
        { role: "user", content: prompt },
      ],
      max_tokens: context.maxTokens || 500,
    });
    return response.choices?.[0]?.message?.content?.trim() || null;
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

    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

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
    // Strip markdown fences if present
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
 * Build a prompt from key and context.
 * @param {string} key
 * @param {object} context
 * @returns {string}
 */
function buildPrompt(key, context) {
  return prompts.render("prose-user", {
    topic: context.topic || key.replace(/_/g, " ").replace(/-/g, " "),
    tone: context.tone || "technical",
    length: context.length || "2-3 paragraphs",
    domain: context.domain,
    role: context.role,
    audience: context.audience,
  });
}
