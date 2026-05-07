/**
 * ProseGenerator — async LLM-backed prose generation that writes through
 * to a `ProseCache`.
 *
 * Pairs with `ProseCache` (sync). Calls the LLM only when the cache misses
 * and the mode permits generation.
 *
 * `generatePlain()` keys the cache by entity key directly so the on-disk
 * file is diff-readable and the key set is enumerable.
 * `generateStructured()` keys by `${entityKey}#${hash}` so the entity is
 * still greppable while prompt drift auto-invalidates stale entries.
 *
 * @module libsyntheticprose/engine/generator
 */

import { generateHash } from "@forwardimpact/libutil";

/** Async LLM-backed prose generator that writes through to a ProseCache on every miss. */
export class ProseGenerator {
  /**
   * @param {object} options
   * @param {ProseCache} options.cache             Sync prose cache
   * @param {string} options.mode                  "cached" | "generate" | "no-prose"
   * @param {boolean} [options.strict]             Fail on cache miss
   * @param {{ createCompletions: Function }} [options.llmApi]
   *        Pre-configured LLM client — required when mode is "generate"
   * @param {import('@forwardimpact/libprompt').PromptLoader} options.promptLoader
   * @param {object} options.logger
   */
  constructor({ cache, mode, strict = false, llmApi, promptLoader, logger }) {
    if (!cache) throw new Error("cache is required");
    if (!mode) throw new Error("mode is required");
    if (!promptLoader) throw new Error("promptLoader is required");
    if (!logger) throw new Error("logger is required");
    this.cache = cache;
    this.mode = mode;
    this.strict = strict;
    this.llmApi = llmApi;
    this.promptLoader = promptLoader;
    this.logger = logger;
    this.stats = { generated: 0 };
  }

  /**
   * Resolve prose for a key — cache hit, cache miss + generate, or null.
   * @param {string} key
   * @param {object} context
   * @returns {Promise<string|null>}
   */
  async generatePlain(key, context) {
    if (this.mode === "no-prose") return null;

    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;

    if (this.mode === "cached") {
      if (this.strict) throw new Error(`Cache miss: '${key}'`);
      return null;
    }

    const prose = await this.#callLlm(key, context);
    this.stats.generated++;
    if (prose) this.cache.set(key, prose);
    return prose;
  }

  /**
   * Resolve a structured response from pre-built messages.
   *
   * Cache key includes both the entity key and the prompt content so
   * that prompt changes automatically invalidate stale entries.
   *
   * @param {string} key
   * @param {object[]} messages
   * @param {{ maxTokens?: number }} [options]
   * @returns {Promise<string|null>}
   */
  async generateStructured(key, messages, { maxTokens = 4000 } = {}) {
    if (this.mode === "no-prose") return null;

    const cacheKey = `${key}#${generateHash(JSON.stringify(messages))}`;
    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) {
      this.logger.debug("prose", `Cache hit: ${key}`);
      return cached;
    }

    if (this.mode === "cached") {
      if (this.strict) throw new Error(`Cache miss: '${key}'`);
      return null;
    }

    this.logger.info("prose", `Calling LLM: ${key}`);
    const startedAt = Date.now();
    const response = await this.llmApi.createCompletions({
      messages,
      max_tokens: maxTokens,
    });
    const elapsedMs = Date.now() - startedAt;
    const content = response.choices?.[0]?.message?.content?.trim() || null;
    this.stats.generated++;
    if (content) this.cache.set(cacheKey, content);
    this.logger.info("prose", `Generated: ${key}`, {
      chars: content ? content.length : 0,
      ms: elapsedMs,
    });
    return content;
  }

  /**
   * Generate structured output and parse as JSON.
   * @param {string} key
   * @param {object[]} messages
   * @param {{ maxTokens?: number }} [options]
   * @returns {Promise<object|null>}
   */
  async generateJson(key, messages, options) {
    const raw = await this.generateStructured(key, messages, options);
    if (!raw) return null;
    const cleaned = raw
      .replace(/^```(?:json)?\s*\n?/m, "")
      .replace(/\n?```\s*$/m, "")
      .trim();
    try {
      return JSON.parse(cleaned);
    } catch (err) {
      this.logger.error(
        "prose",
        `Failed to parse JSON for ${key} (likely truncated): ${err.message}`,
        { chars: cleaned.length, tail: cleaned.slice(-200) },
      );
      throw new Error(
        `Failed to parse JSON for ${key} (${cleaned.length} chars): ${err.message}`,
        { cause: err },
      );
    }
  }

  /**
   * @param {string} key
   * @param {object} context
   * @returns {Promise<string|null>}
   */
  async #callLlm(key, context) {
    const prompt = this.#buildPrompt(key, context);
    this.logger.info("prose", `Calling LLM: ${key}`);
    const startedAt = Date.now();
    const response = await this.llmApi.createCompletions({
      messages: [
        { role: "system", content: this.promptLoader.load("prose-system") },
        { role: "user", content: prompt },
      ],
      max_tokens: context.maxTokens || 500,
    });
    const elapsedMs = Date.now() - startedAt;
    const content = response.choices?.[0]?.message?.content?.trim() || null;
    this.logger.info("prose", `Generated: ${key}`, {
      chars: content ? content.length : 0,
      ms: elapsedMs,
    });
    return content;
  }

  /**
   * Build the rendered prompt for a prose-context entry.
   *
   * The scalar `driver` / `direction` / `magnitude` consumed by the
   * template's `{{#scenario}}` block are derived from `context.drivers[0]`
   * — the top driver (sorted by `|magnitude|`) per spec 820 design-a
   * Decision #7. Snapshot-comment and webhook contexts both populate
   * `drivers: DriverImpact[]`; this method is a function of the
   * `ProseContext` entry alone, with no per-output branching.
   *
   * @param {string} key
   * @param {object} context
   * @returns {string}
   */
  #buildPrompt(key, context) {
    const drivers = context.drivers || [];
    const top = drivers[0];
    const driverContext = drivers
      .map(
        (d) => `- ${d.driver_id}: ${d.trajectory} (magnitude: ${d.magnitude})`,
      )
      .join("\n");

    return this.promptLoader.render("prose-user", {
      topic: context.topic || key.replace(/_/g, " ").replace(/-/g, " "),
      tone: context.tone || "technical",
      length: context.length || "2-3 paragraphs",
      domain: context.domain,
      orgName: context.orgName,
      role: context.role,
      audience: context.audience,
      scenario: context.scenario,
      driver: top?.driver_id,
      direction: top
        ? top.trajectory === "declining"
          ? "declining"
          : "improving"
        : undefined,
      magnitude: top?.magnitude,
      driverContext: driverContext || undefined,
    });
  }
}
