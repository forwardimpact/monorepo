/**
 * AgentRunner — runs a single Claude Agent SDK session and emits raw
 * NDJSON events to an output stream. `gemba-harness run`,
 * `gemba-harness supervise`, `gemba-harness facilitate`, and
 * `gemba-harness discuss` build on it.
 *
 * Follows OO+DI: constructor injection, factory function, tests bypass factory.
 */

import { AGENT_MODEL } from "@forwardimpact/libutil/models";
import { resolveClaudeCodeExecutable } from "./claude-code-executable.js";

const DEFAULT_ALLOWED_TOOLS = ["Bash", "Read", "Glob", "Grep", "Write", "Edit"];

/**
 * Report whether the session invoked the model. A genuine run always bills
 * tokens (the system prompt alone is thousands of input tokens) and costs
 * more than zero. A `result` message can carry `subtype: "success"` with
 * zero token usage and zero cost. That combination means the run never
 * reached the model. It is the canonical signature of a Claude Code init or
 * auth failure (e.g. an invalid `ANTHROPIC_API_KEY`). The SDK otherwise
 * reports that failure as a clean success.
 *
 * If the SDK gave us neither a `usage` object nor `total_cost_usd`, don't
 * second-guess the subtype. Trust the reported success.
 * @param {object|null} result - The SDK `result` message, or null.
 * @returns {boolean}
 */
function modelDidWork(result) {
  if (!result) return false;
  const { usage, total_cost_usd: cost } = result;
  if (usage == null && cost == null) return true;
  const tokens = usage
    ? (usage.input_tokens ?? 0) +
      (usage.output_tokens ?? 0) +
      (usage.cache_creation_input_tokens ?? 0) +
      (usage.cache_read_input_tokens ?? 0)
    : 0;
  return tokens > 0 || (cost ?? 0) > 0;
}

// gemba-harness and kata-action run headless in CI/CD with no human to answer
// permission prompts. The runner always launches the SDK in bypass mode. No
// caller can override that mode, so a future caller can't accidentally
// reduce permissions.
const PERMISSION_MODE = "bypassPermissions";

/** Run a single Claude Agent SDK session and emit raw NDJSON events to an output stream. */
export class AgentRunner {
  /**
   * @param {object} deps
   * @param {string} deps.cwd - Agent working directory
   * @param {function} deps.query - SDK query function (tests inject it)
   * @param {import("stream").Writable} deps.output - Stream to emit NDJSON to
   * @param {string} [deps.model] - Claude model identifier
   * @param {number} [deps.maxTurns] - Maximum agentic turns. 0 means unlimited
   * @param {string[]} [deps.allowedTools] - Tools the agent may use
   * @param {function} [deps.onLine] - Callback that receives each NDJSON line as the runner produces it
   * @param {function} [deps.onPrompt] - Callback that receives the effective (amend-applied) prompt of each run/resume
   * @param {string[]} [deps.settingSources] - SDK setting sources (e.g. ['project'] to load CLAUDE.md)
   * @param {string|object} [deps.systemPrompt] - SDK system prompt. A string replaces the default. The preset form {type:'preset', preset:'claude_code', append} appends
   * @param {string[]} [deps.disallowedTools] - Tools to explicitly remove from the model's context
   * @param {Record<string, object>} [deps.mcpServers] - MCP server configs to pass to the SDK query
   * @param {string} [deps.pathToClaudeCodeExecutable] - Absolute path to the
   *   native `claude` CLI the SDK should spawn. Set it for compiled fit-*
   *   binaries, which can't self-resolve the SDK's platform optional
   *   dependency. Omit it from source runs so the SDK resolves its own
   *   version-matched binary.
   * @param {object} deps.redactor
   * @param {import("@forwardimpact/libutil/runtime").Runtime} [deps.runtime] -
   *   Ambient collaborators. The runner reads only `proc.env`, to record Skill
   *   invocations into `LIBHARNESS_SKILL`. When `runtime` is absent, the
   *   runner skips the write.
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
    this.model = deps.model ?? AGENT_MODEL;
    this.maxTurns = deps.maxTurns ?? 50;
    this.allowedTools = deps.allowedTools ?? DEFAULT_ALLOWED_TOOLS;
    this.onLine = deps.onLine ?? null;
    // Optional. The code reads it only through a truthy guard in
    // run()/resume(), so an absent value stays undefined and needs no
    // `?? null` default.
    this.onPrompt = deps.onPrompt;
    this.settingSources = deps.settingSources ?? [];
    this.systemPrompt = deps.systemPrompt ?? null;
    this.disallowedTools = deps.disallowedTools ?? [];
    this.mcpServers = deps.mcpServers ?? null;
    // Optional. The code reads it only through a truthy guard in
    // #callOptions, so an absent value stays undefined and needs no
    // `?? null` default.
    this.pathToClaudeCodeExecutable = deps.pathToClaudeCodeExecutable;
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
    if (this.onPrompt) this.onPrompt(effectiveTask);
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
    if (this.onPrompt) this.onPrompt(prompt);
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
   * Build the options for every SDK query() call. run() and resume()
   * share this method, so the agent's configuration stays identical
   * across the session's lifetime. That configuration is the cwd, the
   * tools, the prompt, the setting sources, and the turn budget. Only
   * resume() layers `resume: this.sessionId` on top.
   *
   * SDK options attach to the call. They do not attach to the session.
   * The resumed call loads the prior conversation. It otherwise uses
   * whatever options this call passes. If you omit the tool, prompt, or
   * setting options on resume, the agent silently loses its restrictions
   * and persona between turns.
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
      ...(this.pathToClaudeCodeExecutable && {
        pathToClaudeCodeExecutable: this.pathToClaudeCodeExecutable,
      }),
    };
  }

  /**
   * Iterate the SDK query iterator. Mirror every message to the output
   * stream and to the `onLine` callback. Capture `sessionId` from the
   * SDK's `system/init` message. Track Skill invocations into
   * `LIBHARNESS_SKILL` for downstream metrics.
   *
   * If the iterator throws and we triggered the abort ourselves
   * (`currentAbortController.signal.aborted`), we report `aborted:
   * true`. Otherwise the error propagates as `error`.
   */
  async #consumeQuery(iterator) {
    let text = "";
    let stopReason = null;
    let resultMessage = null;
    let error = null;
    let aborted = false;

    try {
      for await (const message of iterator) {
        this.#recordLine(message);
        if (message.type === "result") {
          text = message.result ?? "";
          stopReason = message.subtype;
          resultMessage = message;
        }
      }
    } catch (err) {
      if (this.currentAbortController?.signal.aborted) {
        aborted = true;
      } else {
        error = err;
      }
    }

    // A "success" subtype is necessary. It is not sufficient. The SDK reports
    // a failed init (e.g. an invalid API key) as success with zero model work.
    // Require evidence that the model ran. Surface a clear error when it did
    // not, so nobody reports the masked failure as a green run.
    const reportedSuccess = stopReason === "success";
    const success =
      reportedSuccess &&
      resultMessage?.is_error !== true &&
      modelDidWork(resultMessage);
    if (reportedSuccess && !success && !error) {
      error = new Error(
        "agent reported success but did no model work (zero token usage), which is likely a Claude Code init or authentication failure",
      );
    }

    return {
      success,
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
    // The runner records the Skill metric into the env map. Without a
    // runtime there is no env surface to write to, so the code simply skips
    // the side-effect.
    const env = this.runtime?.proc?.env ?? null;
    if (!env) return;
    for (const block of content) {
      if (
        block.type === "tool_use" &&
        block.name === "Skill" &&
        block.input?.skill
      ) {
        env.LIBHARNESS_SKILL = block.input.skill;
      }
    }
  }
}

/**
 * Factory function — wires real dependencies. It resolves the native
 * `claude` executable for compiled fit-* binaries, so the SDK doesn't fail
 * to find its own platform optional dependency. An explicit `deps` value
 * overrides it.
 */
export function createAgentRunner(deps) {
  return new AgentRunner({
    pathToClaudeCodeExecutable: resolveClaudeCodeExecutable(),
    ...deps,
  });
}
