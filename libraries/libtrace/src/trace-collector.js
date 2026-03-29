/**
 * Collects Claude Code stream-json NDJSON events into structured traces.
 *
 * Accepts one NDJSON line at a time via addLine(), then produces either a
 * structured JSON trace (toJSON) or human-readable text (toText).
 */
export class TraceCollector {
  constructor() {
    /** @type {object|null} */
    this.metadata = null;
    /** @type {Array<object>} */
    this.turns = [];
    /** @type {object|null} */
    this.result = null;
    /** @type {number} */
    this.turnIndex = 0;
  }

  /**
   * Parse one NDJSON line and accumulate state.
   * Malformed lines are silently skipped.
   * @param {string} line - A single JSON line from stream-json output
   */
  addLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return;

    let event;
    try {
      event = JSON.parse(trimmed);
    } catch {
      return;
    }

    switch (event.type) {
      case "system":
        this.handleSystem(event);
        break;
      case "assistant":
        this.handleAssistant(event);
        break;
      case "user":
        this.handleUser(event);
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
   */
  handleSystem(event) {
    if (event.subtype === "init") {
      this.metadata = {
        timestamp: new Date().toISOString(),
        sessionId: event.session_id ?? null,
        model: event.model ?? null,
        claudeCodeVersion: event.claude_code_version ?? null,
        tools: event.tools ?? [],
        permissionMode: event.permissionMode ?? null,
      };
    }
  }

  /**
   * @param {object} event
   */
  handleAssistant(event) {
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
      content,
      usage,
    });
  }

  /**
   * @param {object} event
   */
  handleUser(event) {
    const message = event.message;
    if (!message) return;

    const contentItems = message.content;
    if (!Array.isArray(contentItems)) return;

    for (const item of contentItems) {
      if (item.type === "tool_result") {
        this.turns.push({
          index: this.turnIndex++,
          role: "tool_result",
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
      version: "1.0.0",
      metadata: this.metadata ?? {
        timestamp: new Date().toISOString(),
        sessionId: null,
        model: null,
        claudeCodeVersion: null,
        tools: [],
        permissionMode: null,
      },
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
   * Return human-readable text for workflow logs.
   * @returns {string} Formatted text output
   */
  toText() {
    const lines = [];

    for (const turn of this.turns) {
      if (turn.role === "assistant") {
        for (const block of turn.content) {
          if (block.type === "text") {
            lines.push(block.text);
          } else if (block.type === "tool_use") {
            const inputSummary = summarizeInput(block.input);
            lines.push(`> Tool: ${block.name} ${inputSummary}`);
          }
        }
      }
    }

    if (this.result) {
      const duration = formatDuration(this.result.durationMs);
      const cost = this.result.totalCostUsd.toFixed(4);
      lines.push("");
      lines.push(
        `--- Result: ${this.result.result} | Turns: ${this.result.numTurns} | Cost: $${cost} | Duration: ${duration} ---`,
      );
    }

    return lines.join("\n");
  }
}

/**
 * Summarize tool input for text display, truncated to keep logs readable.
 * @param {object} input - Tool input object
 * @returns {string} Truncated summary
 */
function summarizeInput(input) {
  if (!input || typeof input !== "object") return "";
  const json = JSON.stringify(input);
  if (json.length <= 200) return json;
  return json.slice(0, 197) + "...";
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
 * @returns {TraceCollector}
 */
export function createTraceCollector() {
  return new TraceCollector();
}
