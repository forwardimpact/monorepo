/**
 * Collects Claude Code stream-json NDJSON events into structured traces.
 *
 * Accepts one NDJSON line at a time via addLine(), then produces either a
 * structured JSON trace (toJSON) or human-readable text (toText).
 *
 * Human text rendering is delegated to the pure modules under `./render/`
 * so the live `TeeWriter` stream and the offline `toText()` replay share
 * one formatting path.
 */

import { isoTimestamp } from "@forwardimpact/libutil";

import { renderTurnLines } from "./render/turn-renderer.js";
import { isSuppressedOrchestratorEvent } from "./render/orchestrator-filter.js";

/** Accumulate Claude Code NDJSON stream events into structured traces for analysis or text replay. */
export class TraceCollector {
  /**
   * @param {object} [deps]
   * @param {function} [deps.now] - Returns an ISO timestamp string. Injected
   *   so the collector never reads the wall clock directly; construct it as
   *   `() => isoTimestamp(runtime.clock.now())`. When omitted (pure
   *   structural/replay use where every event already carries a `timestamp`),
   *   the fallback formats the epoch — a deterministic sentinel, not a clock
   *   read.
   */
  constructor(deps = {}) {
    /** @type {function} */
    this.now = deps.now ?? (() => isoTimestamp(0));
    /** @type {object|null} */
    this.metadata = null;
    /** @type {Array<object>} */
    this.turns = [];
    /** @type {object|null} */
    this.result = null;
    /** @type {{verdict?: string, summary?: string, turns?: number}|null} */
    this.orchestratorSummary = null;
    /** @type {number} */
    this.turnIndex = 0;
    /** @type {object|null} */
    this.initEvent = null;
  }

  /**
   * Parse one NDJSON line and accumulate state.
   * Malformed lines are silently skipped.
   * @param {string} line - A single JSON line from stream-json output
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: NDJSON envelope unwrap + orchestrator/system/assistant/user dispatch
  addLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return;

    let event;
    try {
      event = JSON.parse(trimmed);
    } catch {
      return;
    }

    // Unwrap combined supervised trace format {source, seq, event}. The
    // Supervisor / Facilitator emits this wrapper; when replayed through
    // addLine the inner event is the one we care about. Carry the envelope
    // `source` onto each new turn so the renderer can color it correctly.
    let source = null;
    if (event.event && !event.type && typeof event.source === "string") {
      source = event.source;
      event = event.event;
    }

    // Orchestrator lifecycle events carry no content and are suppressed
    // from turns entirely — the NDJSON artifact keeps them separately.
    if (source === "orchestrator" && isSuppressedOrchestratorEvent(event)) {
      // The summary event carries the supervisor/facilitator verdict —
      // capture it before dropping the event, so the result footer can
      // surface verdict="failure" instead of the SDK's per-runner status.
      if (event.type === "summary") {
        this.orchestratorSummary = {
          ...(event.verdict && { verdict: event.verdict }),
          ...(typeof event.summary === "string" && { summary: event.summary }),
          ...(typeof event.turns === "number" && { turns: event.turns }),
        };
      }
      if (event.type === "meta" && typeof event.discussion_id === "string") {
        this.discussionId = event.discussion_id;
      }
      return;
    }

    switch (event.type) {
      case "system":
        this.handleSystem(event, source);
        break;
      case "assistant":
        this.handleAssistant(event, source);
        break;
      case "user":
        this.handleUser(event, source);
        break;
      case "result":
        this.handleResult(event);
        break;
      default:
        break;
    }
  }

  /**
   * @param {object} event
   * @param {string|null} source
   */
  handleSystem(event, source) {
    const { type: _type, ...payload } = event;

    if (event.subtype === "init") {
      this.metadata = {
        timestamp: event.timestamp ?? this.now(),
        sessionId: event.session_id ?? null,
        model: event.model ?? null,
        claudeCodeVersion: event.claude_code_version ?? null,
        tools: event.tools ?? [],
        permissionMode: event.permissionMode ?? null,
      };
      this.initEvent = payload;
    }

    this.turns.push({
      index: this.turnIndex++,
      role: "system",
      source,
      subtype: event.subtype ?? null,
      data: payload,
    });
  }

  /**
   * @param {object} event
   * @param {string|null} source
   */
  handleAssistant(event, source) {
    const message = event.message;
    if (!message) return;

    const content = (message.content ?? []).map((block) => {
      if (block.type === "text") {
        return { type: "text", text: block.text };
      }
      if (block.type === "tool_use") {
        return {
          type: "tool_use",
          toolUseId: block.id ?? null,
          name: block.name,
          input: block.input,
        };
      }
      return block;
    });

    const usage = message.usage
      ? {
          inputTokens: message.usage.input_tokens ?? 0,
          outputTokens: message.usage.output_tokens ?? 0,
          cacheReadInputTokens: message.usage.cache_read_input_tokens ?? 0,
          cacheCreationInputTokens:
            message.usage.cache_creation_input_tokens ?? 0,
        }
      : null;

    this.turns.push({
      index: this.turnIndex++,
      role: "assistant",
      source,
      content,
      usage,
    });
  }

  /**
   * @param {object} event
   * @param {string|null} source
   */
  handleUser(event, source) {
    const message = event.message;
    if (!message) return;

    const contentItems = message.content;
    if (!Array.isArray(contentItems)) return;

    const textBlocks = contentItems
      .filter((item) => item.type === "text")
      .map((item) => ({ type: "text", text: item.text }));

    if (textBlocks.length > 0) {
      this.turns.push({
        index: this.turnIndex++,
        role: "user",
        source,
        content: textBlocks,
      });
    }

    for (const item of contentItems) {
      if (item.type === "tool_result") {
        this.turns.push({
          index: this.turnIndex++,
          role: "tool_result",
          source,
          toolUseId: item.tool_use_id ?? null,
          content:
            typeof item.content === "string"
              ? item.content
              : JSON.stringify(item.content),
          isError: item.is_error ?? false,
        });
      }
    }
  }

  /**
   * @param {object} event
   */
  handleResult(event) {
    this.result = {
      result: event.subtype ?? "unknown",
      isError: event.is_error ?? false,
      totalCostUsd: event.total_cost_usd ?? 0,
      durationMs: event.duration_ms ?? 0,
      numTurns: event.num_turns ?? 0,
      tokenUsage: event.usage
        ? {
            inputTokens: event.usage.input_tokens ?? 0,
            outputTokens: event.usage.output_tokens ?? 0,
            cacheReadInputTokens: event.usage.cache_read_input_tokens ?? 0,
            cacheCreationInputTokens:
              event.usage.cache_creation_input_tokens ?? 0,
          }
        : null,
      modelUsage: event.modelUsage ?? null,
    };
  }

  /**
   * Return a structured trace object for offline analysis.
   * @returns {object} Structured trace document
   */
  toJSON() {
    return {
      version: "1.1.0",
      metadata: this.metadata ?? {
        timestamp: this.now(),
        sessionId: null,
        model: null,
        claudeCodeVersion: null,
        tools: [],
        permissionMode: null,
      },
      initEvent: this.initEvent ?? null,
      turns: this.turns,
      summary: this.result ?? {
        result: "unknown",
        isError: false,
        totalCostUsd: 0,
        durationMs: 0,
        numTurns: 0,
        tokenUsage: null,
        modelUsage: null,
      },
    };
  }

  /**
   * Render the accumulated turns as human-readable text — the same path the
   * live `TeeWriter` stream uses, so `fit-eval output --format=text` over a
   * captured trace reproduces what the live workflow log showed.
   *
   * Source prefixes are emitted whenever at least one turn has a non-null
   * source (supervised / facilitated traces). A pure `run` trace has no
   * envelope, all turn sources are null, and the renderer drops the prefix.
   *
   * @returns {string} Formatted text output including ANSI escapes
   */
  toText() {
    const withPrefix = this.turns.some((t) => t.source);
    const out = [];

    for (const turn of this.turns) {
      out.push(...renderTurnLines(turn, withPrefix));
    }

    const tail = this.#formatResultTail();

    // Each rendered line already ends with `\n`; concatenate, drop the
    // trailing newline, then append the tail so the output shape stays
    // compatible with existing consumers (no double-blank line before
    // the result footer when there are turns, no leading blank when there
    // are not).
    const body = out.join("").replace(/\n$/, "");
    return body + tail;
  }

  /**
   * Format the trailing result summary line. When an orchestrator
   * summary is present (supervised / facilitated mode), the headline word is
   * the supervisor's verdict ("success" / "failure") rather than the SDK's
   * per-runner subtype, so the footer aligns with the CI exit code.
   * @returns {string}
   */
  #formatResultTail() {
    if (!this.result) return "";
    const duration = formatDuration(this.result.durationMs);
    const cost = Number(this.result.totalCostUsd).toFixed(4);
    const headline = this.orchestratorSummary?.verdict ?? this.result.result;
    return (
      "\n" +
      `--- Result: ${headline} | Turns: ${this.result.numTurns} | Cost: $${cost} | Duration: ${duration} ---`
    );
  }
}

/**
 * Format milliseconds into a human-readable duration.
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration
 */
function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Factory function for TraceCollector.
 * @param {object} [deps]
 * @param {function} [deps.now] - Returns ISO timestamp string
 * @returns {TraceCollector}
 */
export function createTraceCollector(deps) {
  return new TraceCollector(deps);
}
