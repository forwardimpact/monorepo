/**
 * AgentRunner — runs a single Claude Agent SDK session and emits raw
 * NDJSON events to an output stream. Building block for `fit-eval run`,
 * `fit-eval supervise`, `fit-eval facilitate`, and `fit-eval discuss`.
 *
 * Follows OO+DI: constructor injection, factory function, tests bypass factory.
 */

const DEFAULT_ALLOWED_TOOLS = ["Bash", "Read", "Glob", "Grep", "Write", "Edit"];

// fit-eval and kata-action run headless in CI/CD with no human to answer
// permission prompts. The SDK is always launched in bypass mode — not
// overridable — so a future caller can't accidentally reduce permissions.
const PERMISSION_MODE = "bypassPermissions";

/** Run a single Claude Agent SDK session and emit raw NDJSON events to an output stream. */
export class AgentRunner {
  /**
   * @param {object} deps
   * @param {string} deps.cwd - Agent working directory
   * @param {function} deps.query - SDK query function (injected for testing)
   * @param {import("stream").Writable} deps.output - Stream to emit NDJSON to
   * @param {string} [deps.model] - Claude model identifier
   * @param {number} [deps.maxTurns] - Maximum agentic turns; 0 means unlimited
   * @param {string[]} [deps.allowedTools] - Tools the agent may use
   * @param {function} [deps.onLine] - Callback invoked with each NDJSON line as it's produced
   * @param {string[]} [deps.settingSources] - SDK setting sources (e.g. ['project'] to load CLAUDE.md)
   * @param {string|object} [deps.systemPrompt] - SDK system prompt (string replaces default; {type:'preset', preset:'claude_code', append} appends)
   * @param {string[]} [deps.disallowedTools] - Tools to explicitly remove from the model's context
   * @param {Record<string, object>} [deps.mcpServers] - MCP server configs to pass to the SDK query
   * @param {object} deps.redactor
   * @param {import("@forwardimpact/libutil/runtime").Runtime} [deps.runtime] -
   *   Ambient collaborators. Only `proc.env` is read (to record Skill
   *   invocations into `LIBEVAL_SKILL`); when absent the write is skipped.
   */
  constructor(deps) {
    if (!deps.cwd) throw new Error("cwd is required");
    if (!deps.query) throw new Error("query is required");
    if (!deps.output) throw new Error("output is required");
    if (!deps.redactor) throw new Error("redactor is required");
    this.runtime = deps.runtime ?? null;
    this.cwd = deps.cwd;
    this.query = deps.query;
    this.output = deps.output;
    this.redactor = deps.redactor;
    this.model = deps.model ?? "claude-opus-4-7[1m]";
    this.maxTurns = deps.maxTurns ?? 50;
    this.allowedTools = deps.allowedTools ?? DEFAULT_ALLOWED_TOOLS;
    this.onLine = deps.onLine ?? null;
    this.settingSources = deps.settingSources ?? [];
    this.systemPrompt = deps.systemPrompt ?? null;
    this.disallowedTools = deps.disallowedTools ?? [];
    this.mcpServers = deps.mcpServers ?? null;
    this.taskAmend = deps.taskAmend ?? null;
    this.sessionId = null;
    /** @type {AbortController|null} */
    this.currentAbortController = null;
  }

  /**
   * Run a new agent session with the given task.
   * @param {string} task
   * @returns {Promise<{success: boolean, text: string, sessionId: string|null, error: Error|null, aborted: boolean}>}
   */
  async run(task) {
    const abortController = new AbortController();
    this.currentAbortController = abortController;
    const effectiveTask = this.taskAmend
      ? task
        ? `${task}\n\n${this.taskAmend}`
        : this.taskAmend
      : task;
    try {
      const iterator = this.query({
        prompt: effectiveTask,
        options: this.#callOptions(abortController),
      });
      return await this.#consumeQuery(iterator);
    } finally {
      this.currentAbortController = null;
    }
  }

  /**
   * Resume an existing session with a follow-up prompt.
   * @param {string} prompt
   * @returns {Promise<{success: boolean, text: string, sessionId: string|null, error: Error|null, aborted: boolean}>}
   */
  async resume(prompt) {
    const abortController = new AbortController();
    this.currentAbortController = abortController;
    try {
      const iterator = this.query({
        prompt,
        options: {
          ...this.#callOptions(abortController),
          resume: this.sessionId,
        },
      });
      return await this.#consumeQuery(iterator);
    } finally {
      this.currentAbortController = null;
    }
  }

  /**
   * Build the options passed to every SDK query() call. Shared by run()
   * and resume() so the agent's configuration — cwd, tools, prompt,
   * setting sources, turn budget — is identical across the session's
   * lifetime. Only resume() layers `resume: this.sessionId` on top.
   *
   * SDK options are call-attached, not session-attached: the resumed
   * call loads the prior conversation but otherwise uses whatever
   * options this call passes. Omitting tool/prompt/setting options on
   * resume causes the agent to silently lose its restrictions and
   * persona between turns.
   */
  #callOptions(abortController) {
    return {
      cwd: this.cwd,
      allowedTools: this.allowedTools,
      maxTurns: this.maxTurns === 0 ? Number.MAX_SAFE_INTEGER : this.maxTurns,
      model: this.model,
      permissionMode: PERMISSION_MODE,
      allowDangerouslySkipPermissions: true,
      settingSources: this.settingSources,
      abortController,
      ...(this.disallowedTools.length > 0 && {
        disallowedTools: this.disallowedTools,
      }),
      ...(this.systemPrompt && { systemPrompt: this.systemPrompt }),
      ...(this.mcpServers && { mcpServers: this.mcpServers }),
    };
  }

  /**
   * Iterate the SDK query iterator, mirroring every message to the
   * output stream and the `onLine` callback. Captures `sessionId` from
   * the SDK's `system/init` message and tracks Skill invocations into
   * `LIBEVAL_SKILL` for downstream metrics.
   *
   * If the iterator throws and we triggered the abort ourselves
   * (`currentAbortController.signal.aborted`), we report `aborted:
   * true`; otherwise the error propagates as `error`.
   */
  async #consumeQuery(iterator) {
    let text = "";
    let stopReason = null;
    let error = null;
    let aborted = false;

    try {
      for await (const message of iterator) {
        this.#recordLine(message);
        if (message.type === "result") {
          text = message.result ?? "";
          stopReason = message.subtype;
        }
      }
    } catch (err) {
      if (this.currentAbortController?.signal.aborted) {
        aborted = true;
      } else {
        error = err;
      }
    }

    return {
      success: stopReason === "success",
      text,
      sessionId: this.sessionId,
      error,
      aborted,
    };
  }

  #recordLine(message) {
    const redacted = this.redactor.redactValue(message);
    const line = JSON.stringify(redacted);
    this.output.write(line + "\n");
    if (this.onLine) this.onLine(line);

    if (message.type === "system" && message.subtype === "init") {
      this.sessionId = message.session_id;
    }
    if (message.type === "assistant") this.#trackSkillInvocation(message);
  }

  #trackSkillInvocation(message) {
    const content = message.message?.content ?? message.content;
    if (!Array.isArray(content)) return;
    // Skill metric is recorded into the env map; without a runtime there is
    // no env surface to write to, so the side-effect is simply skipped.
    const env = this.runtime?.proc?.env ?? null;
    if (!env) return;
    for (const block of content) {
      if (
        block.type === "tool_use" &&
        block.name === "Skill" &&
        block.input?.skill
      ) {
        env.LIBEVAL_SKILL = block.input.skill;
      }
    }
  }
}

/** Factory function — wires real dependencies. */
export function createAgentRunner(deps) {
  return new AgentRunner(deps);
}
