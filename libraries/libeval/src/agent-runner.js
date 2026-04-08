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
   * @param {function} [deps.onBatch] - Async callback invoked with a batch of NDJSON lines at flush boundaries (assistant text blocks and result messages). Receives `(lines, { abort })` where calling `abort()` stops the in-flight SDK session via the AbortController. Optional; assignable at runtime so the Supervisor can swap it per turn.
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
    this.maxTurns = maxTurns ?? 50;
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
          maxTurns: this.maxTurns,
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
   * at natural boundaries (assistant messages with text blocks, and the
   * terminal `result` message).
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
   * @param {AsyncIterable<object>} iterator
   * @returns {Promise<{success: boolean, text: string, sessionId: string|null, error: Error|null, aborted: boolean}>}
   */
  async #consumeQuery(iterator) {
    let text = "";
    let stopReason = null;
    let error = null;
    let aborted = false;
    const pendingBatch = [];

    try {
      for await (const message of iterator) {
        const line = JSON.stringify(message);
        this.output.write(line + "\n");
        this.buffer.push(line);
        if (this.onLine) this.onLine(line);
        if (this.onBatch) pendingBatch.push(line);

        if (message.type === "system" && message.subtype === "init") {
          this.sessionId = message.session_id;
        }
        if (message.type === "result") {
          text = message.result ?? "";
          stopReason = message.subtype;
        }

        const shouldFlush =
          this.onBatch &&
          (message.type === "result" ||
            (message.type === "assistant" && hasTextBlock(message)));
        if (shouldFlush) {
          const batchLines = pendingBatch.splice(0, pendingBatch.length);
          await this.onBatch(batchLines, {
            abort: () => this.currentAbortController?.abort(),
          });
        }
      }
    } catch (err) {
      if (this.currentAbortController?.signal.aborted) {
        aborted = true;
      } else {
        error = err;
      }
    }

    const success = stopReason === "success";
    return { success, text, sessionId: this.sessionId, error, aborted };
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
 * Tool-only assistant messages return false so they accumulate into the
 * pending batch and flush with the next text block (or with the terminal
 * `result` message), keeping supervisor LLM cost bounded.
 * @param {object} message
 * @returns {boolean}
 */
function hasTextBlock(message) {
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
