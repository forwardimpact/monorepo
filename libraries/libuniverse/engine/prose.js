/**
 * Prose Engine — LLM-assisted prose generation with cache.
 *
 * Uses libllm for completions and libutil for cache key hashing.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { generateHash } from "@forwardimpact/libutil";

const SYSTEM_PROMPT =
  "You are a technical writer for a pharmaceutical company. " +
  "Generate concise, realistic content. Output the text only, no explanations " +
  "or markdown formatting.";

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
        { role: "system", content: SYSTEM_PROMPT },
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
  const topic = context.topic || key.replace(/_/g, " ").replace(/-/g, " ");
  const tone = context.tone || "technical";
  const length = context.length || "2-3 paragraphs";
  const parts = [`Write ${length} of ${tone} prose about: ${topic}.`];
  if (context.domain) parts.push(`Company domain: ${context.domain}.`);
  if (context.role)
    parts.push(`Written from the perspective of: ${context.role}.`);
  if (context.audience) parts.push(`Target audience: ${context.audience}.`);
  parts.push("Output the text only, no explanations.");
  return parts.join("\n");
}
