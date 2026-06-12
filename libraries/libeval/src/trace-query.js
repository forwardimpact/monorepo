/**
 * Query engine for structured trace documents produced by TraceCollector.
 *
 * Loads a structured JSON trace into memory and provides methods for
 * paging, searching, filtering, and summarizing turns — the operations
 * agents need to analyze large traces efficiently.
 */
export class TraceQuery {
  /**
   * @param {object} trace - Structured trace document (output of TraceCollector.toJSON())
   */
  constructor(trace) {
    this.trace = trace;
    this.metadata = trace.metadata ?? {};
    this.turns = trace.turns ?? [];
    this.summary = trace.summary ?? {};
  }

  /**
   * High-level overview: metadata, summary, turn count, tool frequency,
   * and the first user message text (taskPrompt) when present.
   * @returns {object}
   */
  overview() {
    const firstUser = this.turns.find((t) => t.role === "user");
    const taskPrompt = firstUser
      ? firstUser.content
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("\n")
      : null;
    return {
      metadata: this.metadata,
      summary: this.summary,
      turnCount: this.turns.length,
      tools: this.toolFrequency(),
      taskPrompt,
    };
  }

  /**
   * Full system/init event — the single most diagnostic message for
   * root-cause analysis. Returns null for traces collected before this
   * field existed.
   * @returns {object|null}
   */
  init() {
    return this.trace.initEvent ?? null;
  }

  /**
   * Retrieve a single turn by its index.
   * @param {number} index
   * @returns {object|null}
   */
  turn(index) {
    return this.turns.find((t) => t.index === index) ?? null;
  }

  /**
   * Filter turns by composable structural criteria. All criteria are
   * combined as AND. `tool()` and `errors()` remain as convenience
   * shortcuts for pre-existing workflows.
   *
   * `toolName` matches assistant turns only. Applying `toolName` without
   * `role: "assistant"` still drops every non-assistant turn, because
   * resolving tool_use → tool_result pairs requires the `tool()` method.
   * `isError` matches tool_result turns only. Combining `toolName` with
   * `isError` therefore always returns `[]` (no turn is both assistant
   * and tool_result) — use `tool(name)` for "errors from Bash"–shaped
   * queries.
   *
   * @param {object} [opts]
   * @param {string} [opts.role] - Exact role match (system | user |
   *   assistant | tool_result).
   * @param {string} [opts.toolName] - Matches assistant turns with a
   *   tool_use block of this name. Drops all non-assistant turns.
   * @param {boolean} [opts.isError] - Matches tool_result turns by
   *   `isError` value. Drops all non-tool_result turns.
   * @returns {object[]}
   */
  filter(opts = {}) {
    const { role, toolName, isError } = opts;
    return this.turns.filter(
      (turn) =>
        matchesRole(turn, role) &&
        matchesError(turn, isError) &&
        matchesToolName(turn, toolName),
    );
  }

  /** @returns {number} */
  count() {
    return this.turns.length;
  }

  /**
   * Return turns in range [from, to) (zero-indexed).
   * @param {number} from
   * @param {number} to
   * @returns {object[]}
   */
  batch(from, to) {
    return this.turns.slice(from, to);
  }

  /**
   * First N turns.
   * @param {number} [n=10]
   * @returns {object[]}
   */
  head(n = 10) {
    return this.turns.slice(0, n);
  }

  /**
   * Last N turns.
   * @param {number} [n=10]
   * @returns {object[]}
   */
  tail(n = 10) {
    return this.turns.slice(-n);
  }

  /**
   * Search all turn content for a regex pattern.  Returns matching turns
   * with the matched text highlighted by context.
   *
   * Searches: assistant text blocks, tool_use names and stringified input,
   * and tool_result content.
   *
   * @param {string} pattern - Regex pattern (case-insensitive)
   * @param {object} [opts]
   * @param {number} [opts.context=0] - Number of surrounding turns to include
   * @param {number} [opts.limit=50] - Max results
   * @param {boolean} [opts.full=false] - Emit full content block text in
   *   match descriptions instead of the default narrow excerpt window.
   * @returns {object[]} Array of {turn, matches, context?}
   */
  search(pattern, opts = {}) {
    const { context = 0, limit = 50, full = false } = opts;
    const re = new RegExp(pattern, "gi");
    const hits = [];

    for (const turn of this.turns) {
      const matches = matchTurn(turn, re, full);
      if (matches.length > 0) {
        const entry = { turn, matches };
        if (context > 0) {
          const idx = turn.index;
          entry.context = this.turns.filter(
            (t) =>
              t.index !== idx &&
              t.index >= idx - context &&
              t.index <= idx + context,
          );
        }
        hits.push(entry);
        if (hits.length >= limit) break;
      }
    }
    return hits;
  }

  /**
   * Tool usage frequency, sorted descending.
   * @returns {Array<{tool: string, count: number}>}
   */
  toolFrequency() {
    const counts = {};
    for (const turn of this.turns) {
      if (turn.role !== "assistant") continue;
      for (const block of turn.content) {
        if (block.type === "tool_use") {
          counts[block.name] = (counts[block.name] ?? 0) + 1;
        }
      }
    }
    return Object.entries(counts)
      .map(([tool, count]) => ({ tool, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Filter turns involving a specific tool (both the tool_use and its result).
   * @param {string} name - Tool name
   * @returns {object[]}
   */
  tool(name) {
    const toolUseIds = collectToolUseIds(this.turns, name);
    const assistantTurns = this.turns.filter(
      (t) =>
        t.role === "assistant" &&
        t.content.some((b) => b.type === "tool_use" && b.name === name),
    );
    const resultTurns = this.turns.filter(
      (t) => t.role === "tool_result" && toolUseIds.has(t.toolUseId),
    );
    return [...assistantTurns, ...resultTurns].sort(
      (a, b) => a.index - b.index,
    );
  }

  /**
   * All error turns (tool results with isError=true).
   * @returns {object[]}
   */
  errors() {
    return this.turns.filter(
      (t) => t.role === "tool_result" && t.isError === true,
    );
  }

  /**
   * Extract just the reasoning text from assistant turns.
   * @param {object} [opts]
   * @param {number} [opts.from] - Start turn index
   * @param {number} [opts.to] - End turn index (exclusive)
   * @returns {Array<{index: number, text: string}>}
   */
  reasoning(opts = {}) {
    const { from, to } = opts;
    const results = [];
    for (const turn of this.turns) {
      if (turn.role !== "assistant") continue;
      if (from !== undefined && turn.index < from) continue;
      if (to !== undefined && turn.index >= to) continue;
      const texts = turn.content
        .filter((b) => b.type === "text")
        .map((b) => b.text);
      if (texts.length > 0) {
        results.push({ index: turn.index, text: texts.join("\n") });
      }
    }
    return results;
  }

  /**
   * Compact one-line-per-assistant-turn timeline showing tool names,
   * reasoning snippet, and token usage.  Thinking-only turns are marked
   * as such and their content is omitted (it is model-internal).
   * @returns {string[]}
   */
  timeline() {
    const lines = [];
    for (const turn of this.turns) {
      if (turn.role !== "assistant") continue;

      const tools = turn.content
        .filter((b) => b.type === "tool_use")
        .map((b) => b.name);

      const textBlocks = turn.content
        .filter((b) => b.type === "text")
        .map((b) => b.text);

      const hasThinking = turn.content.some((b) => b.type === "thinking");

      // Skip thinking-only turns (no user-visible content).
      if (hasThinking && tools.length === 0 && textBlocks.length === 0)
        continue;

      const snippet = textBlocks.join(" ").slice(0, 80).replace(/\n/g, " ");

      const input = turn.usage?.inputTokens ?? 0;
      const output = turn.usage?.outputTokens ?? 0;
      const cacheRead = turn.usage?.cacheReadInputTokens ?? 0;

      const toolStr = tools.length > 0 ? tools.join(", ") : "(text only)";
      const tokenStr = `in:${fmtK(input + cacheRead)} out:${fmtK(output)}`;

      lines.push(
        `[${turn.index}] ${toolStr.padEnd(30)} ${tokenStr.padEnd(18)} ${snippet}`,
      );
    }
    return lines;
  }

  /**
   * Token usage and cost breakdown per assistant turn, plus totals.
   *
   * Token totals prefer the summary's result-event usage — the SDK's
   * authoritative ledger, accumulated across every result event in the
   * trace — over per-turn sums, whose stream-time snapshots double-count
   * re-emitted messages. Traces without a result event (truncated or
   * in-flight) fall back to the per-turn sums.
   * @returns {object}
   */
  stats() {
    const { perTurn, totals: turnTotals } = perTurnUsage(this.turns);
    const tokenTotals = this.summary.tokenUsage ?? turnTotals;
    return {
      totals: {
        ...tokenTotals,
        totalCostUsd: this.summary.totalCostUsd ?? 0,
        durationMs: this.summary.durationMs ?? 0,
      },
      perTurn,
    };
  }
}

/**
 * Sum per-turn assistant usage and build the per-turn breakdown rows.
 * @param {object[]} turns
 * @returns {{perTurn: object[], totals: object}}
 */
function perTurnUsage(turns) {
  const totals = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
  };
  const perTurn = [];

  for (const turn of turns) {
    if (turn.role !== "assistant" || !turn.usage) continue;
    const row = {
      index: turn.index,
      inputTokens: turn.usage.inputTokens ?? 0,
      outputTokens: turn.usage.outputTokens ?? 0,
      cacheReadInputTokens: turn.usage.cacheReadInputTokens ?? 0,
      cacheCreationInputTokens: turn.usage.cacheCreationInputTokens ?? 0,
    };
    totals.inputTokens += row.inputTokens;
    totals.outputTokens += row.outputTokens;
    totals.cacheReadInputTokens += row.cacheReadInputTokens;
    totals.cacheCreationInputTokens += row.cacheCreationInputTokens;
    perTurn.push(row);
  }
  return { perTurn, totals };
}

/**
 * @param {object} turn
 * @param {string|undefined} role
 * @returns {boolean}
 */
function matchesRole(turn, role) {
  return role === undefined || turn.role === role;
}

/**
 * @param {object} turn
 * @param {boolean|undefined} isError
 * @returns {boolean}
 */
function matchesError(turn, isError) {
  if (isError === undefined) return true;
  return turn.role === "tool_result" && turn.isError === isError;
}

/**
 * @param {object} turn
 * @param {string|undefined} toolName
 * @returns {boolean}
 */
function matchesToolName(turn, toolName) {
  if (toolName === undefined) return true;
  return (
    turn.role === "assistant" &&
    turn.content.some((b) => b.type === "tool_use" && b.name === toolName)
  );
}

/**
 * Collect all toolUseIds for a given tool name from assistant turns.
 * @param {object[]} turns
 * @param {string} name
 * @returns {Set<string>}
 */
function collectToolUseIds(turns, name) {
  const ids = new Set();
  for (const turn of turns) {
    if (turn.role !== "assistant") continue;
    for (const b of turn.content) {
      if (b.type === "tool_use" && b.name === name && b.toolUseId) {
        ids.add(b.toolUseId);
      }
    }
  }
  return ids;
}

/**
 * Search a single turn for regex matches. Returns array of match descriptions.
 * @param {object} turn
 * @param {RegExp} re
 * @param {boolean} [full=false] - Emit full block text instead of an excerpt.
 * @returns {string[]}
 */
function matchTurn(turn, re, full = false) {
  if (turn.role === "assistant") return matchAssistantTurn(turn, re, full);
  if (turn.role === "tool_result") return matchToolResultTurn(turn, re, full);
  if (turn.role === "user") return matchUserTurn(turn, re, full);
  return [];
}

function matchAssistantTurn(turn, re, full) {
  const matches = [];
  for (const block of turn.content) {
    if (block.type === "text") {
      const desc = describeText(block.text, re, "text", full);
      if (desc) matches.push(desc);
    } else if (block.type === "tool_use") {
      matches.push(...matchToolUseBlock(block, re, full));
    }
  }
  return matches;
}

function matchToolUseBlock(block, re, full) {
  const matches = [];
  if (re.test(block.name)) {
    re.lastIndex = 0;
    matches.push(`tool_name: ${block.name}`);
  }
  const inputStr = JSON.stringify(block.input);
  const inputDesc = describeText(
    inputStr,
    re,
    `tool_input(${block.name})`,
    full,
  );
  if (inputDesc) matches.push(inputDesc);
  return matches;
}

function matchToolResultTurn(turn, re, full) {
  const content = turn.content ?? "";
  const desc = describeText(content, re, "result", full);
  return desc ? [desc] : [];
}

function matchUserTurn(turn, re, full) {
  const matches = [];
  for (const block of turn.content ?? []) {
    if (block.type === "text") {
      const desc = describeText(block.text, re, "user_text", full);
      if (desc) matches.push(desc);
    }
  }
  return matches;
}

/**
 * Return a `<prefix>: <text-or-excerpt>` description when `text` matches
 * the regex, or null when it does not. Centralises the full-vs-excerpt
 * choice so each call site just supplies its prefix.
 * @param {string} text
 * @param {RegExp} re
 * @param {string} prefix
 * @param {boolean} full
 * @returns {string|null}
 */
function describeText(text, re, prefix, full) {
  if (!re.test(text)) return null;
  re.lastIndex = 0;
  return `${prefix}: ${full ? text : excerptAround(text, re)}`;
}

/**
 * Extract a short excerpt around the first regex match in text.
 * @param {string} text
 * @param {RegExp} re
 * @returns {string}
 */
function excerptAround(text, re) {
  re.lastIndex = 0;
  const m = re.exec(text);
  if (!m) return text.slice(0, 100);
  const start = Math.max(0, m.index - 40);
  const end = Math.min(text.length, m.index + m[0].length + 40);
  let excerpt = text.slice(start, end);
  if (start > 0) excerpt = "..." + excerpt;
  if (end < text.length) excerpt = excerpt + "...";
  return excerpt;
}

/**
 * Format a token count as compact K notation.
 * @param {number} n
 * @returns {string}
 */
function fmtK(n) {
  if (n < 1000) return String(n);
  return (n / 1000).toFixed(1) + "K";
}

/**
 * Load a structured trace from a JSON string.
 * @param {string} json
 * @returns {TraceQuery}
 */
export function createTraceQuery(json) {
  const trace = typeof json === "string" ? JSON.parse(json) : json;
  return new TraceQuery(trace);
}
