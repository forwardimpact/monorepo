/**
 * AgentRunner — runs a single Claude Agent SDK session and emits raw NDJSON
 * events to an output stream. Building block for both `fit-eval run` and
 * `fit-eval supervise`.
 *
 * Follows OO+DI: constructor injection, factory function, tests bypass factory.
 */

export class AgentRunner {
  /**
   * @param {object} deps
   * @param {string} deps.cwd - Agent working directory
   * @param {function} deps.query - SDK query function (injected for testing)
   * @param {import("stream").Writable} deps.output - Stream to emit NDJSON to
   * @param {string} [deps.model] - Claude model identifier
   * @param {number} [deps.maxTurns] - Maximum agentic turns
   * @param {string[]} [deps.allowedTools] - Tools the agent may use
   * @param {string} [deps.permissionMode] - SDK permission mode
   * @param {function} [deps.onLine] - Callback invoked with each NDJSON line as it's produced
   * @param {function} [deps.onBatch] - Async callback invoked with a batch of NDJSON lines at flush boundaries: every `batchSize` assistant text blocks, the terminal `result` message, and — on iterator crash/abort — once more in a final flush carrying any lines that never reached a boundary. Receives `(lines, { abort })` where calling `abort()` stops the in-flight SDK session via the AbortController. Optional; assignable at runtime so the Supervisor can swap it per turn.
   * @param {number} [deps.batchSize] - Assistant text-block messages to accumulate before firing onBatch. Tool-only assistant messages ride along without counting. Default 3: the supervisor reviews the agent every three text turns instead of every turn. The terminal `result` always flushes regardless of count.
   * @param {string[]} [deps.settingSources] - SDK setting sources (e.g. ['project'] to load CLAUDE.md)
   * @param {string} [deps.agentProfile] - Agent profile name to pass as --agent to the Claude CLI
   * @param {string|object} [deps.systemPrompt] - SDK system prompt (string replaces default; {type:'preset', preset:'claude_code', append} appends)
   * @param {string[]} [deps.disallowedTools] - Tools to explicitly remove from the model's context
   */
  constructor({
    cwd,
    query,
    output,
    model,
    maxTurns,
    allowedTools,
    permissionMode,
    onLine,
    onBatch,
    batchSize,
    settingSources,
    agentProfile,
    systemPrompt,
    disallowedTools,
  }) {
    if (!cwd) throw new Error("cwd is required");
    if (!query) throw new Error("query is required");
    if (!output) throw new Error("output is required");
    this.cwd = cwd;
    this.query = query;
    this.output = output;
    this.model = model ?? "opus";
    this.maxTurns = maxTurns ?? 50; // 0 means unlimited (omit from SDK)
    this.allowedTools = allowedTools ?? [
      "Bash",
      "Read",
      "Glob",
      "Grep",
      "Write",
      "Edit",
    ];
    this.permissionMode = permissionMode ?? "bypassPermissions";
    this.onLine = onLine ?? null;
    this.onBatch = onBatch ?? null;
    this.batchSize = batchSize ?? 3;
    this.settingSources = settingSources ?? [];
    this.agentProfile = agentProfile ?? null;
    this.systemPrompt = systemPrompt ?? null;
    this.disallowedTools = disallowedTools ?? [];
    this.sessionId = null;
    this.buffer = [];
    /** @type {AbortController|null} */
    this.currentAbortController = null;
  }

  /**
   * Run a new agent session with the given task.
   * @param {string} task - The task prompt
   * @returns {Promise<{success: boolean, text: string, sessionId: string|null, error: Error|null, aborted: boolean}>}
   */
  async run(task) {
    const abortController = new AbortController();
    this.currentAbortController = abortController;
    try {
      const iterator = this.query({
        prompt: task,
        options: {
          cwd: this.cwd,
          allowedTools: this.allowedTools,
          ...(this.maxTurns > 0 && { maxTurns: this.maxTurns }),
          model: this.model,
          permissionMode: this.permissionMode,
          allowDangerouslySkipPermissions: true,
          settingSources: this.settingSources,
          abortController,
          ...(this.disallowedTools.length > 0 && {
            disallowedTools: this.disallowedTools,
          }),
          ...(this.systemPrompt && { systemPrompt: this.systemPrompt }),
          ...(this.agentProfile && { extraArgs: { agent: this.agentProfile } }),
        },
      });
      return await this.#consumeQuery(iterator);
    } finally {
      this.currentAbortController = null;
    }
  }

  /**
   * Resume an existing session with a follow-up prompt.
   * @param {string} prompt - The follow-up prompt
   * @returns {Promise<{success: boolean, text: string, sessionId: string|null, error: Error|null, aborted: boolean}>}
   */
  async resume(prompt) {
    const abortController = new AbortController();
    this.currentAbortController = abortController;
    try {
      const iterator = this.query({
        prompt,
        options: {
          resume: this.sessionId,
          permissionMode: this.permissionMode,
          allowDangerouslySkipPermissions: true,
          abortController,
        },
      });
      return await this.#consumeQuery(iterator);
    } finally {
      this.currentAbortController = null;
    }
  }

  /**
   * Shared consumer for both `run()` and `resume()`. Iterates the SDK query
   * iterator, mirroring every line to the output stream / buffer / onLine
   * callback, and — when `onBatch` is set — flushes accumulated lines to it
   * at coarse boundaries: every `batchSize` assistant text-block messages,
   * and the terminal `result` message. Tool-only assistant messages still
   * accumulate in the pending batch and ride along in the next flush, so
   * the supervisor always sees the tool calls that led up to each text
   * block. Raising `batchSize` above 1 is the knob that makes the mid-turn
   * supervisor review less chatty — with the default of 3, the supervisor
   * sees the agent in chunks of three text turns instead of every turn.
   *
   * Corollary: a turn that is *entirely* tool_use with no text blocks and
   * then hits `result` produces exactly one flush at `result` regardless
   * of how many tools ran. That is deliberate — the supervisor only needs
   * to weigh in when the agent surfaces something text-like to react to.
   *
   * INVARIANT: the `await this.onBatch(...)` call below is the ONLY
   * suspension point in this loop. While it is pending, no further lines
   * are pulled from the SDK generator. The Supervisor relies on this — its
   * onBatch callback flips `currentSource` to "supervisor" for the duration
   * of its mid-turn LLM call, and the invariant guarantees no agent line
   * can arrive concurrently and be mis-tagged.
   *
   * If the supervisor calls `abort()` from inside the callback, the next
   * iteration of the for-await loop will throw. We catch the throw, check
   * `currentAbortController.signal.aborted` (avoiding fragility around
   * AbortError vs DOMException shapes), and report `aborted: true` so the
   * caller can distinguish "supervisor asked us to stop" from a real error.
   *
   * If the iterator throws before a flush boundary, any lines still in the
   * pending batch would otherwise vanish without the supervisor seeing
   * them. The `finally` block emits a terminal batch so the supervisor can
   * observe the partial state (e.g. note a crash or react to an external
   * abort). A throw from that final flush becomes the returned `error`
   * only if no earlier error was captured — the original failure wins.
   * @param {AsyncIterable<object>} iterator
   * @returns {Promise<{success: boolean, text: string, sessionId: string|null, error: Error|null, aborted: boolean}>}
   */
  async #consumeQuery(iterator) {
    let text = "";
    let stopReason = null;
    let error = null;
    let aborted = false;
    const state = { pendingBatch: [], assistantTextCount: 0 };

    try {
      for await (const message of iterator) {
        this.#recordLine(message, state);
        if (message.type === "result") {
          text = message.result ?? "";
          stopReason = message.subtype;
        }
        await this.#maybeFlushBatch(message, state);
      }
    } catch (err) {
      if (this.currentAbortController?.signal.aborted) {
        aborted = true;
      } else {
        error = err;
      }
    }

    const flushErr = await this.#terminalFlush(state, { error, aborted });
    if (flushErr && !error) error = flushErr;

    const success = stopReason === "success";
    return { success, text, sessionId: this.sessionId, error, aborted };
  }

  /**
   * Mirror a single SDK message to the output stream, buffer, onLine
   * callback, and (when set) the pending-batch state. Also handles
   * session id capture and text-block counting so `#consumeQuery` can
   * stay within the complexity budget.
   * @param {object} message
   * @param {{pendingBatch: string[], assistantTextCount: number}} state
   */
  #recordLine(message, state) {
    const line = JSON.stringify(message);
    this.output.write(line + "\n");
    this.buffer.push(line);
    if (this.onLine) this.onLine(line);
    if (this.onBatch) state.pendingBatch.push(line);

    if (message.type === "system" && message.subtype === "init") {
      this.sessionId = message.session_id;
    }
    if (message.type === "assistant" && hasTextBlock(message)) {
      state.assistantTextCount++;
    }
  }

  /**
   * Terminal flush — only fires on the abnormal-end paths (iterator
   * threw or was aborted mid-stream). Delivers any pending lines so the
   * supervisor sees the partial state instead of losing the tail of
   * the run. A natural-end iterator that simply ran out of messages
   * without a `result` marker is treated as an incomplete stub (the
   * real SDK always terminates with `result`) and its pending batch is
   * not re-flushed. Returns an error thrown by the flush callback, or
   * `null` if the flush succeeded or did not fire.
   * @param {{pendingBatch: string[], assistantTextCount: number}} state
   * @param {{error: Error|null, aborted: boolean}} outcome
   * @returns {Promise<Error|null>}
   */
  async #terminalFlush(state, { error, aborted }) {
    const loopEndedAbnormally = Boolean(error || aborted);
    if (!loopEndedAbnormally) return null;
    if (!this.onBatch || state.pendingBatch.length === 0) return null;
    try {
      const batchLines = state.pendingBatch.splice(0);
      await this.onBatch(batchLines, {
        abort: () => this.currentAbortController?.abort(),
      });
      return null;
    } catch (flushErr) {
      return flushErr;
    }
  }

  /**
   * Flush the pending batch to `onBatch` if either the batchSize threshold
   * has been reached or the current message is the terminal `result`.
   * Extracted so that `#consumeQuery` stays within the project's complexity
   * budget — the flush is one cohesive unit of logic in its own right.
   * @param {object} message
   * @param {{pendingBatch: string[], assistantTextCount: number}} state
   */
  async #maybeFlushBatch(message, state) {
    if (!this.onBatch) return;
    const shouldFlush =
      message.type === "result" || state.assistantTextCount >= this.batchSize;
    if (!shouldFlush) return;
    state.assistantTextCount = 0;
    const batchLines = state.pendingBatch.splice(0);
    await this.onBatch(batchLines, {
      abort: () => this.currentAbortController?.abort(),
    });
  }

  /**
   * Drain buffered output lines. Used by Supervisor to tag and re-emit lines.
   * @returns {string[]}
   */
  drainOutput() {
    const lines = [...this.buffer];
    this.buffer = [];
    return lines;
  }
}

/**
 * Whether an SDK assistant message contains at least one text block.
 * Only text-block messages count toward the `batchSize` threshold — tool-only
 * assistant messages accumulate silently into the pending batch and ride along
 * in the next flush, keeping supervisor LLM cost bounded. Exported so the mock
 * runner can mirror the real flush predicate without duplicating the logic.
 * @param {object} message
 * @returns {boolean}
 */
export function hasTextBlock(message) {
  const content = message.message?.content ?? message.content;
  if (!Array.isArray(content)) return false;
  for (const block of content) {
    if (block.type === "text" && block.text) return true;
  }
  return false;
}

/**
 * Factory function — wires real dependencies.
 * @param {object} deps - Same as AgentRunner constructor
 * @returns {AgentRunner}
 */
export function createAgentRunner(deps) {
  return new AgentRunner(deps);
}
