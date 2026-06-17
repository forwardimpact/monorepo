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
      resultEventTurns: this.summary.numTurns ?? null,
      turnPopulations: {
        turnCount: "rendered-trace-turns",
        resultEventTurns: "result-event-turns",
      },
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
   * Token usage and cost breakdown, accounted once per API message, plus
   * totals that name their population.
   *
   * A structured document collected before this change (version < 1.2.0)
   * carries no message identity, so it reports its carried last-wins summary
   * labeled as such — corrected figures come from re-running the NDJSON source.
   *
   * Otherwise: when the trace carries result events, totals are the SDK's
   * accumulated result-event sums (authoritative); the per-message sums are
   * compared against them and any divergence on input/cacheRead/cacheCreation
   * is surfaced, never silently absorbed. A trace with no result event
   * (truncated or in-flight) falls back to the per-message sums, with output
   * flagged as a streaming-snapshot lower bound and cost/duration/turns
   * reported as unavailable rather than a silent 0.
   * @returns {object}
   */
  stats() {
    if (isPreChangeDoc(this.trace.version)) {
      return this.#carriedDocumentStats();
    }

    const { perMessage, totals: perMessageTotals } = perMessageUsage(
      this.turns,
    );
    const re = this.summary.tokenUsage;

    if (re) {
      return {
        totals: {
          inputTokens: re.inputTokens ?? 0,
          outputTokens: re.outputTokens ?? 0,
          cacheReadInputTokens: re.cacheReadInputTokens ?? 0,
          cacheCreationInputTokens: re.cacheCreationInputTokens ?? 0,
          totalCostUsd: this.summary.totalCostUsd ?? 0,
          durationMs: this.summary.durationMs ?? 0,
          durationLabel: "cumulative invocation time",
          resultEventTurns: this.summary.numTurns ?? 0,
          population: "result-event-sum",
          resultEventsPresent: true,
        },
        perTurn: perMessage,
        modelUsage: this.summary.modelUsage ?? null,
        divergence: computeDivergence(perMessageTotals, re),
      };
    }

    return {
      totals: {
        ...perMessageTotals,
        outputIsStreamingSnapshot: true,
        totalCostUsd: null,
        durationMs: null,
        resultEventTurns: null,
        population: "per-message-fallback",
        resultEventsPresent: false,
      },
      perTurn: perMessage,
      modelUsage: this.summary.modelUsage ?? null,
      divergence: null,
    };
  }

  /**
   * Stats for a pre-change structured document: report the carried last-wins
   * summary and per-stream-event breakdown, each labeled, without claiming
   * result-event parity (the document lacks the message identity it needs).
   * @returns {object}
   */
  #carriedDocumentStats() {
    const re = this.summary.tokenUsage ?? ZERO_USAGE;
    return {
      totals: {
        inputTokens: re.inputTokens ?? 0,
        outputTokens: re.outputTokens ?? 0,
        cacheReadInputTokens: re.cacheReadInputTokens ?? 0,
        cacheCreationInputTokens: re.cacheCreationInputTokens ?? 0,
        totalCostUsd: this.summary.totalCostUsd ?? 0,
        durationMs: this.summary.durationMs ?? 0,
        population: "carried-document-summary",
      },
      perTurn: carriedPerTurn(this.turns),
      modelUsage: this.summary.modelUsage ?? null,
      divergence: null,
    };
  }

  /**
   * One record per `tool_use` block, each paired with its `tool_result`
   * (joined by `toolUseId`) or `result: null` for orphaned calls.
   * @returns {Array<{turnIndex: number, name: string, toolUseId: string, input: object, result: {content: *, isError: boolean}|null}>}
   */
  toolCalls() {
    const blocks = collectToolUseBlocks(this.turns);
    const results = new Map();
    for (const turn of this.turns) {
      if (turn.role === "tool_result" && turn.toolUseId) {
        results.set(turn.toolUseId, {
          content: turn.content ?? null,
          isError: turn.isError ?? false,
        });
      }
    }
    return [...blocks.entries()].map(([toolUseId, b]) => ({
      turnIndex: b.turnIndex,
      name: b.name,
      toolUseId,
      input: b.input,
      result: results.get(toolUseId) ?? null,
    }));
  }

  /**
   * One record per `Bash` `tool_use` block, carrying its command text.
   * @param {string} [re] - Optional regex source tested against `input.command`.
   * @returns {Array<{turnIndex: number, toolUseId: string, command: string}>}
   */
  commands(re) {
    const filter = re === undefined ? null : new RegExp(re);
    const out = [];
    for (const [toolUseId, b] of collectToolUseBlocks(this.turns, "Bash")) {
      const command = b.input?.command ?? "";
      if (filter && !filter.test(command)) continue;
      out.push({ turnIndex: b.turnIndex, toolUseId, command });
    }
    return out;
  }

  /**
   * Distinct `file_path` arguments across `Read`/`Edit`/`Write` tool calls,
   * frequency-sorted (count desc, path asc tiebreak).
   * @param {string} [prefix] - Optional `startsWith` filter.
   * @returns {Array<{path: string, count: number}>}
   */
  paths(prefix) {
    return [...collectFilePaths(this.turns).entries()]
      .filter(([path]) => prefix === undefined || path.startsWith(prefix))
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path));
  }

  /**
   * Side-by-side comparison of this trace against another peer `TraceQuery`.
   * Identity (case name, participant) comes from the caller — the trace
   * carries no filename.
   * @param {TraceQuery} other
   * @param {{aIdentity: {caseName: string, participant: string|null}, bIdentity: {caseName: string, participant: string|null}}} identities
   * @returns {{a: object, b: object, toolDelta: Array, pathDelta: Array}}
   */
  compare(other, { aIdentity, bIdentity } = {}) {
    const a = sideSummary(this, aIdentity);
    const b = sideSummary(other, bIdentity);

    const toolNames = [
      ...new Set([...a.toolFreq.keys(), ...b.toolFreq.keys()]),
    ];
    const toolDelta = toolNames
      .map((tool) => {
        const av = a.toolFreq.get(tool) ?? 0;
        const bv = b.toolFreq.get(tool) ?? 0;
        return { tool, a: av, b: bv, diff: bv - av };
      })
      .sort(
        (x, y) =>
          Math.abs(y.diff) - Math.abs(x.diff) || x.tool.localeCompare(y.tool),
      );

    const pathNames = [
      ...new Set([...a.pathFreq.keys(), ...b.pathFreq.keys()]),
    ];
    const pathDelta = pathNames
      .map((path) => {
        const av = a.pathFreq.get(path) ?? 0;
        const bv = b.pathFreq.get(path) ?? 0;
        return { path, a: av, b: bv, diff: bv - av };
      })
      .sort(
        (x, y) =>
          Math.abs(y.diff) - Math.abs(x.diff) || x.path.localeCompare(y.path),
      );

    return { a: a.surface, b: b.surface, toolDelta, pathDelta };
  }

  /**
   * Per-tool token attribution: each `tool_use` block gets an equal share of
   * its host turn's usage; assistant turns with no `tool_use` block contribute
   * full usage to the `(no-tool)` bucket. `costShare` is total-token
   * proportional and sums to exactly 1.0 (largest bucket absorbs the residual).
   * @returns {{perTool: Array<{tool: string, turns: number, inputTokens: number, outputTokens: number, costShare: number}>, totals: object}}
   */
  statsByTool() {
    const NO_TOOL = "(no-tool)";
    const buckets = new Map();
    const bucketTurns = new Map();

    const ensure = (name) => {
      if (!buckets.has(name)) {
        buckets.set(name, { inputTokens: 0, outputTokens: 0 });
        bucketTurns.set(name, new Set());
      }
      return buckets.get(name);
    };

    for (const turn of this.turns) {
      if (turn.role !== "assistant" || !turn.usage) continue;
      const input = turn.usage.inputTokens ?? 0;
      const output = turn.usage.outputTokens ?? 0;
      const toolBlocks = turn.content.filter((b) => b.type === "tool_use");

      if (toolBlocks.length === 0) {
        const bucket = ensure(NO_TOOL);
        bucket.inputTokens += input;
        bucket.outputTokens += output;
        bucketTurns.get(NO_TOOL).add(turn.index);
        continue;
      }

      const shareIn = input / toolBlocks.length;
      const shareOut = output / toolBlocks.length;
      for (const block of toolBlocks) {
        const bucket = ensure(block.name);
        bucket.inputTokens += shareIn;
        bucket.outputTokens += shareOut;
        bucketTurns.get(block.name).add(turn.index);
      }
    }

    const totalTokens = [...buckets.values()].reduce(
      (sum, b) => sum + b.inputTokens + b.outputTokens,
      0,
    );

    const perTool = [...buckets.entries()].map(([tool, b]) => ({
      tool,
      turns: bucketTurns.get(tool).size,
      inputTokens: b.inputTokens,
      outputTokens: b.outputTokens,
      costShare:
        totalTokens === 0 ? 0 : (b.inputTokens + b.outputTokens) / totalTokens,
    }));

    perTool.sort(
      (x, y) => y.costShare - x.costShare || x.tool.localeCompare(y.tool),
    );

    // Absorb the float residual into the largest-share bucket so the column
    // sums to exactly 1.0 (criterion-6 invariant).
    if (perTool.length > 0) {
      const sum = perTool.reduce((s, r) => s + r.costShare, 0);
      perTool[0].costShare += 1 - sum;
    }

    return { perTool, totals: this.stats().totals };
  }

  /**
   * Totals-only view — `stats().totals` with no per-turn array.
   * @returns {{totals: object}}
   */
  statsSummary() {
    return { totals: this.stats().totals };
  }
}

/** Zero-valued token usage, used as the carried-document fallback. */
const ZERO_USAGE = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
};

/**
 * Per-stream-event breakdown for a pre-change document, labeled as carried —
 * old documents lack message identity, so rows stay keyed by turn index.
 * @param {object[]} turns
 * @returns {object[]}
 */
function carriedPerTurn(turns) {
  const perTurn = [];
  for (const turn of turns) {
    if (turn.role !== "assistant" || !turn.usage) continue;
    perTurn.push({
      index: turn.index,
      inputTokens: turn.usage.inputTokens ?? 0,
      outputTokens: turn.usage.outputTokens ?? 0,
      cacheReadInputTokens: turn.usage.cacheReadInputTokens ?? 0,
      cacheCreationInputTokens: turn.usage.cacheCreationInputTokens ?? 0,
      population: "carried-document-per-turn",
    });
  }
  return perTurn;
}

/**
 * Whether a structured-document version predates per-message accounting
 * (1.2.0). A trace with no version (collected by this build from NDJSON) is
 * not pre-change. Compares numeric version parts so 1.10.0 reads as post-change.
 * @param {string|undefined|null} version
 * @returns {boolean}
 */
function isPreChangeDoc(version) {
  if (typeof version !== "string") return false;
  const [major = 0, minor = 0] = version
    .split(".")
    .map((part) => parseInt(part, 10) || 0);
  if (major !== 1) return major < 1;
  // Per-message accounting arrived in 1.2.0; any 1.2.x is post-change.
  return minor < 2;
}

/**
 * Account assistant usage once per API message. Turns are grouped by
 * `messageId` (a null id is its own singleton message); per message the
 * field-wise max across its snapshots is taken — order-insensitive, equal to
 * the single value when a message's duplicate snapshots are byte-identical
 * (zero residual against result-event sums), and a floor for output (the
 * largest streaming snapshot, never an overstatement).
 * @param {object[]} turns
 * @returns {{perMessage: object[], totals: object}}
 */
function perMessageUsage(turns) {
  const byMessage = new Map();
  let singletonSeq = 0;

  for (const turn of turns) {
    if (turn.role !== "assistant" || !turn.usage) continue;
    const key = turn.messageId ?? `__null__${singletonSeq++}`;
    accumulateMessage(byMessage, key, turn);
  }

  const totals = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
  };
  const perMessage = [];
  for (const row of byMessage.values()) {
    totals.inputTokens += row.inputTokens;
    totals.outputTokens += row.outputTokens;
    totals.cacheReadInputTokens += row.cacheReadInputTokens;
    totals.cacheCreationInputTokens += row.cacheCreationInputTokens;
    perMessage.push({
      ...row,
      outputIsStreamingSnapshot: true,
      population: "api-message",
    });
  }
  return { perMessage, totals };
}

/**
 * Fold one assistant turn's usage into its message bucket by field-wise max.
 * @param {Map<string, object>} byMessage
 * @param {string} key
 * @param {object} turn
 */
function accumulateMessage(byMessage, key, turn) {
  const u = turn.usage;
  const prev = byMessage.get(key);
  if (!prev) {
    byMessage.set(key, {
      messageId: turn.messageId ?? null,
      inputTokens: u.inputTokens ?? 0,
      outputTokens: u.outputTokens ?? 0,
      cacheReadInputTokens: u.cacheReadInputTokens ?? 0,
      cacheCreationInputTokens: u.cacheCreationInputTokens ?? 0,
    });
    return;
  }
  prev.inputTokens = Math.max(prev.inputTokens, u.inputTokens ?? 0);
  prev.outputTokens = Math.max(prev.outputTokens, u.outputTokens ?? 0);
  prev.cacheReadInputTokens = Math.max(
    prev.cacheReadInputTokens,
    u.cacheReadInputTokens ?? 0,
  );
  prev.cacheCreationInputTokens = Math.max(
    prev.cacheCreationInputTokens,
    u.cacheCreationInputTokens ?? 0,
  );
}

/**
 * Compare per-message sums against the result-event sums on the fields the
 * spec guarantees parity for (input, cacheRead, cacheCreation — never output,
 * which always diverges by mechanism 2). Returns the first divergent field as
 * `{field, perMessageSum, resultEventSum}`, or null when all agree.
 * @param {object} perMessageTotals
 * @param {object} resultEventUsage
 * @returns {object|null}
 */
function computeDivergence(perMessageTotals, resultEventUsage) {
  for (const field of [
    "inputTokens",
    "cacheReadInputTokens",
    "cacheCreationInputTokens",
  ]) {
    const perMessageSum = perMessageTotals[field] ?? 0;
    const resultEventSum = resultEventUsage[field] ?? 0;
    if (perMessageSum !== resultEventSum) {
      return { field, perMessageSum, resultEventSum };
    }
  }
  return null;
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
 * Collect every assistant `tool_use` block keyed by `toolUseId`, optionally
 * filtered by tool name. The shared join-key source feeding `toolCalls()`,
 * `commands()`, and `collectToolUseIds()`. Insertion order follows turn order.
 * @param {object[]} turns
 * @param {string} [name] - Optional tool-name filter.
 * @returns {Map<string, {turnIndex: number, name: string, input: object}>}
 */
function collectToolUseBlocks(turns, name) {
  const blocks = new Map();
  for (const turn of turns) {
    if (turn.role !== "assistant") continue;
    for (const b of turn.content) {
      if (b.type !== "tool_use" || !b.toolUseId) continue;
      if (name !== undefined && b.name !== name) continue;
      blocks.set(b.toolUseId, {
        turnIndex: turn.index,
        name: b.name,
        input: b.input,
      });
    }
  }
  return blocks;
}

/**
 * Collect all toolUseIds for a given tool name from assistant turns.
 * @param {object[]} turns
 * @param {string} name
 * @returns {Set<string>}
 */
function collectToolUseIds(turns, name) {
  return new Set(collectToolUseBlocks(turns, name).keys());
}

/** Tool names in `Read`/`Edit`/`Write` that carry a `file_path` argument. */
const PATH_TOOLS = new Set(["Read", "Edit", "Write"]);

/**
 * Frequency map of distinct `file_path` arguments across `Read`/`Edit`/`Write`
 * tool calls, in first-seen insertion order.
 * @param {object[]} turns
 * @returns {Map<string, number>}
 */
function collectFilePaths(turns) {
  const counts = new Map();
  for (const turn of turns) {
    if (turn.role !== "assistant") continue;
    for (const block of turn.content) {
      if (block.type !== "tool_use" || !PATH_TOOLS.has(block.name)) continue;
      const p = block.input?.file_path;
      if (typeof p !== "string") continue;
      counts.set(p, (counts.get(p) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * Build the per-side comparison surface plus the tool/path frequency maps
 * the delta computation consumes. Empty traces emit a `(empty)` marker.
 * @param {TraceQuery} query
 * @param {{caseName: string, participant: string|null}} [identity]
 * @returns {{surface: object, toolFreq: Map<string, number>, pathFreq: Map<string, number>}}
 */
function sideSummary(
  query,
  identity = { caseName: "(unknown)", participant: null },
) {
  const toolFreq = new Map(query.toolFrequency().map((t) => [t.tool, t.count]));
  const pathFreq = collectFilePaths(query.turns);

  const isEmpty = query.turns.length === 0;
  const metadata = {
    caseName: identity.caseName,
    participant: identity.participant ?? null,
  };
  if (isEmpty) metadata.marker = "(empty)";

  const tools = [...toolFreq.keys()].sort();
  const paths = [...pathFreq.keys()].sort();

  return {
    surface: {
      metadata,
      turnCount: query.turns.length,
      tools,
      paths,
      pathCount: paths.length,
      cost: query.stats().totals.totalCostUsd,
    },
    toolFreq,
    pathFreq,
  };
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
