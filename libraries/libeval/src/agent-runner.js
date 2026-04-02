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
    this.settingSources = settingSources ?? [];
    this.agentProfile = agentProfile ?? null;
    this.systemPrompt = systemPrompt ?? null;
    this.disallowedTools = disallowedTools ?? [];
    this.sessionId = null;
    this.buffer = [];
  }

  /**
   * Run a new agent session with the given task.
   * @param {string} task - The task prompt
   * @returns {Promise<{success: boolean, text: string, sessionId: string|null}>}
   */
  async run(task) {
    let text = "";
    let stopReason = null;
    let error = null;

    try {
      for await (const message of this.query({
        prompt: task,
        options: {
          cwd: this.cwd,
          allowedTools: this.allowedTools,
          maxTurns: this.maxTurns,
          model: this.model,
          permissionMode: this.permissionMode,
          allowDangerouslySkipPermissions: true,
          settingSources: this.settingSources,
          ...(this.disallowedTools.length > 0 && { disallowedTools: this.disallowedTools }),
          ...(this.systemPrompt && { systemPrompt: this.systemPrompt }),
          ...(this.agentProfile && { extraArgs: { agent: this.agentProfile } }),
        },
      })) {
        const line = JSON.stringify(message);
        this.output.write(line + "\n");
        this.buffer.push(line);
        if (this.onLine) this.onLine(line);

        if (message.type === "system" && message.subtype === "init") {
          this.sessionId = message.session_id;
        }
        if (message.type === "result") {
          text = message.result ?? "";
          stopReason = message.subtype;
        }
      }
    } catch (err) {
      error = err;
    }

    // If the SDK already emitted a successful result, honour it even when the
    // stream throws afterwards (e.g. "Credit balance is too low" during
    // cleanup). Only treat errors as fatal when no result was received yet.
    const success = stopReason === "success";
    return { success, text, sessionId: this.sessionId, error };
  }

  /**
   * Resume an existing session with a follow-up prompt.
   * @param {string} prompt - The follow-up prompt
   * @returns {Promise<{success: boolean, text: string}>}
   */
  async resume(prompt) {
    let text = "";
    let stopReason = null;
    let error = null;

    try {
      for await (const message of this.query({
        prompt,
        options: {
          resume: this.sessionId,
          permissionMode: this.permissionMode,
          allowDangerouslySkipPermissions: true,
        },
      })) {
        const line = JSON.stringify(message);
        this.output.write(line + "\n");
        this.buffer.push(line);
        if (this.onLine) this.onLine(line);

        if (message.type === "result") {
          text = message.result ?? "";
          stopReason = message.subtype;
        }
      }
    } catch (err) {
      error = err;
    }

    const success = stopReason === "success";
    return { success, text, error };
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
 * Factory function — wires real dependencies.
 * @param {object} deps - Same as AgentRunner constructor
 * @returns {AgentRunner}
 */
export function createAgentRunner(deps) {
  return new AgentRunner(deps);
}
