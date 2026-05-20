/**
 * Facilitator — N agent sessions + one facilitator LLM session. The Ask/Answer
 * contract is enforced at turn boundaries via checkPendingAsk: one synthetic
 * reminder, then a `protocol_violation` event plus a null-answer injection so
 * the session advances instead of deadlocking.
 */

import { Writable } from "node:stream";
import { resolve } from "node:path";
import { createAgentRunner } from "./agent-runner.js";
import { composeProfilePrompt } from "./profile-prompt.js";
import { SequenceCounter } from "./sequence-counter.js";
import { createMessageBus } from "./message-bus.js";
import {
  createOrchestrationContext,
  createFacilitatorToolServer,
  createFacilitatedAgentToolServer,
  checkPendingAsk,
} from "./orchestration-toolkit.js";
import { createAsyncQueue, formatMessages } from "./orchestrator-helpers.js";

/** System prompt appended for the facilitator runner. */
export const FACILITATOR_SYSTEM_PROMPT =
  "You coordinate multiple participants via these tools: " +
  "Ask delivers a question to one named participant — or broadcasts when no addressee is named — and blocks until that participant answers. " +
  "Announce delivers a message with no reply obligation. " +
  "Redirect interrupts an in-progress participant with replacement instructions. " +
  "RollCall returns the participant roster. " +
  "Conclude ends the session with a verdict ('success' or 'failure') and a summary. " +
  "Ask and Announce calls issued in the same turn dispatch in parallel.";

/** System prompt appended for facilitated agent runners. */
export const FACILITATED_AGENT_SYSTEM_PROMPT =
  "You participate in a coordinated session. " +
  "Answer replies to an ask addressed to you. " +
  "Ask sends a question to another participant. " +
  "Announce broadcasts a message. " +
  "RollCall lists participants.";

/** Orchestrate N agent sessions coordinated by a single facilitator LLM session. */
export class Facilitator {
  /**
   * @param {object} deps
   * @param {import("./agent-runner.js").AgentRunner} deps.facilitatorRunner
   * @param {Array<{name: string, role: string, runner: import("./agent-runner.js").AgentRunner}>} deps.agents
   * @param {import("./message-bus.js").MessageBus} deps.messageBus
   * @param {import("stream").Writable} deps.output
   * @param {number} [deps.maxTurns]
   * @param {object} [deps.ctx]
   * @param {object} [deps.eventQueue]
   * @param {string} [deps.taskAmend] - Opaque addendum appended to the task before delivery.
   */
  constructor({
    facilitatorRunner,
    agents,
    messageBus,
    output,
    maxTurns,
    ctx,
    eventQueue,
    taskAmend,
    redactor,
  }) {
    if (!redactor) throw new Error("redactor is required");
    this.redactor = redactor;
    this.facilitatorRunner = facilitatorRunner;
    this.agents = agents;
    this.messageBus = messageBus;
    this.output = output;
    this.maxTurns = maxTurns ?? 20;
    this.ctx = ctx ?? createOrchestrationContext();
    this.counter = new SequenceCounter();
    this.eventQueue = eventQueue ?? createAsyncQueue();
    this.facilitatorTurns = 0;
    this.taskAmend = taskAmend ?? null;

    let resolve;
    const promise = new Promise((r) => {
      resolve = r;
    });
    this.concludePromise = promise;
    this.concludeResolve = resolve;
  }

  /**
   * Run the full facilitated session.
   * @param {string} task
   * @returns {Promise<{success: boolean, turns: number}>}
   */
  async run(task) {
    this.emitOrchestratorEvent({ type: "session_start" });

    const initialTask = this.taskAmend ? `${task}\n\n${this.taskAmend}` : task;

    // Launch agent loops first — they wait for messages via messageBus.
    // This lets agents process Ask/Announce messages that arrive during
    // the facilitator's initial run, rather than after it completes.
    const agentPromises = this.agents.map((a) => this.#runAgent(a));

    // Turn 0: facilitator receives the task
    this.facilitatorTurns++;
    await this.facilitatorRunner.run(initialTask);

    // Handle redirect after turn 0
    await this.#processRedirect();

    if (this.ctx.concluded) {
      // Facilitator concluded during its initial run. Let agents finish any
      // in-progress work before returning — they may have received Ask/Answer
      // messages and started processing concurrently.
      this.concludeResolve();
      await Promise.allSettled(agentPromises);
      const success = this.ctx.verdict === "success";
      this.emitSummary({
        success,
        verdict: this.ctx.verdict,
        turns: this.facilitatorTurns,
        summary: this.ctx.summary,
      });
      return { success, turns: this.facilitatorTurns };
    }

    // Abort agents promptly when Conclude is called during the event loop
    this.concludePromise.then(() => {
      for (const agent of this.agents) {
        agent.runner.currentAbortController?.abort();
      }
    });

    // Concurrent phase: facilitator event loop + already-running agent loops
    const facilitatorPromise = this.#facilitatorLoop();

    try {
      await Promise.all([...agentPromises, facilitatorPromise]);
    } catch (err) {
      for (const agent of this.agents) {
        agent.runner.currentAbortController?.abort();
      }
      this.facilitatorRunner.currentAbortController?.abort();
      throw err;
    }

    const success = this.ctx.concluded && this.ctx.verdict === "success";
    const result = {
      success,
      turns: this.facilitatorTurns,
    };
    this.emitSummary({
      success,
      verdict: this.ctx.verdict,
      turns: result.turns,
      summary: this.ctx.summary,
    });
    return result;
  }

  #checkAsk(name) {
    return checkPendingAsk({
      ctx: this.ctx,
      messageBus: this.messageBus,
      addresseeName: name,
      mode: "facilitated",
      emitViolation: (e) => this.emitOrchestratorEvent(e),
    });
  }

  async #enforcePendingAsk(agent) {
    if (this.#checkAsk(agent.name) !== "recheck") return;
    if (this.ctx.concluded) return;
    const reminders = this.messageBus.drain(agent.name);
    if (reminders.length === 0) return;
    await agent.runner.resume(formatMessages(reminders));
    if (this.ctx.concluded) return;
    this.#checkAsk(agent.name);
  }

  /**
   * Agent outer loop — waits for messages, runs/resumes the agent.
   * @param {{name: string, role: string, runner: import("./agent-runner.js").AgentRunner}} agent
   */
  async #runAgent(agent) {
    // Wait for first message (lazy start)
    await Promise.race([
      this.messageBus.waitForMessages(agent.name),
      this.concludePromise,
    ]);
    if (this.ctx.concluded) return;

    let messages = this.messageBus.drain(agent.name);
    if (messages.length === 0) return;

    this.emitOrchestratorEvent({ type: "agent_start", agent: agent.name });
    await agent.runner.run(formatMessages(messages));
    if (await this.#settleAgentTurn(agent)) return;

    // Loop: check for new messages, resume if any
    while (!this.ctx.concluded) {
      messages = await this.#awaitAgentMessages(agent.name);
      if (messages.length === 0) break;
      await agent.runner.resume(formatMessages(messages));
      if (await this.#settleAgentTurn(agent)) break;
    }
  }

  /**
   * Enforce pending-ask and emit turn_complete. Returns true when the
   * session has concluded and the caller should stop.
   */
  async #settleAgentTurn(agent) {
    if (this.ctx.concluded) return true;
    await this.#enforcePendingAsk(agent);
    if (this.ctx.concluded) return true;
    this.eventQueue.enqueue({
      type: "lifecycle",
      agent: agent.name,
      status: "turn_complete",
    });
    return false;
  }

  /**
   * Wait for messages addressed to `name`, returning an empty array when
   * the session concludes first.
   */
  async #awaitAgentMessages(name) {
    const messages = this.messageBus.drain(name);
    if (messages.length > 0) return messages;
    await Promise.race([
      this.messageBus.waitForMessages(name),
      this.concludePromise,
    ]);
    if (this.ctx.concluded) return [];
    return this.messageBus.drain(name);
  }

  /**
   * Facilitator event loop — only runs when input arrives.
   */
  async #facilitatorLoop() {
    while (!this.ctx.concluded) {
      const event = await this.eventQueue.dequeue();
      if (this.ctx.concluded || event === null) break;
      await this.#handleEvent(event);
    }
  }

  async #handleEvent(event) {
    switch (event.type) {
      case "messages":
      case "lifecycle": {
        const msgs = this.messageBus.drain("facilitator");
        if (msgs.length === 0) break;
        this.facilitatorTurns++;
        await this.facilitatorRunner.resume(formatMessages(msgs));
        await this.#processRedirect();
        if (!this.ctx.concluded) await this.#enforceFacilitatorPendingAsk();
        break;
      }
    }

    if (this.ctx.concluded) {
      this.concludeResolve();
      this.eventQueue.close();
    }
  }

  async #enforceFacilitatorPendingAsk() {
    if (this.#checkAsk("facilitator") !== "recheck") return;
    if (this.ctx.concluded) return;
    const reminders = this.messageBus.drain("facilitator");
    if (reminders.length === 0) return;
    this.facilitatorTurns++;
    await this.facilitatorRunner.resume(formatMessages(reminders));
    await this.#processRedirect();
    if (this.ctx.concluded) return;
    this.#checkAsk("facilitator");
  }

  /**
   * Process a pending redirect after a facilitator turn.
   */
  async #processRedirect() {
    if (!this.ctx.redirect) return;
    const redirect = this.ctx.redirect;
    this.ctx.redirect = null;

    this.emitOrchestratorEvent({
      type: "redirect",
      to: redirect.to,
    });

    if (redirect.to === "all") {
      // Abort all agents and deliver redirect via broadcast
      for (const agent of this.agents) {
        agent.runner.currentAbortController?.abort();
      }
      this.messageBus.announce("facilitator", redirect.message);
    } else if (redirect.to) {
      // Abort specific agent and deliver via direct message
      const target = this.agents.find((a) => a.name === redirect.to);
      if (target) {
        target.runner.currentAbortController?.abort();
      }
      this.messageBus.direct("facilitator", redirect.to, redirect.message);
    }
  }

  /** Return the last assistant text block from a runner's buffer, or the fallback if none exists. */
  extractLastText(runner, fallback) {
    const lines = runner.buffer;
    for (let i = lines.length - 1; i >= 0; i--) {
      const event = JSON.parse(lines[i]);
      if (event.type !== "assistant") continue;
      const content = event.message?.content ?? event.content;
      if (!Array.isArray(content)) continue;
      for (let j = content.length - 1; j >= 0; j--) {
        if (content[j].type === "text" && content[j].text) {
          return content[j].text;
        }
      }
    }
    return fallback;
  }

  /**
   * Emit a single NDJSON line tagged with source and seq.
   * @param {string} source - Participant name
   * @param {string} line - Raw NDJSON line
   */
  emitLine(source, line) {
    const event = JSON.parse(line);
    this.output.write(
      JSON.stringify(
        this.redactor.redactValue({
          source,
          seq: this.counter.next(),
          event,
        }),
      ) + "\n",
    );
  }

  /**
   * @param {{type: string}} event
   */
  emitOrchestratorEvent(event) {
    this.output.write(
      JSON.stringify(
        this.redactor.redactValue({
          source: "orchestrator",
          seq: this.counter.next(),
          event,
        }),
      ) + "\n",
    );
  }

  /**
   * @param {{success: boolean, verdict?: string|null, turns: number, summary?: string}} result
   */
  emitSummary(result) {
    this.output.write(
      JSON.stringify(
        this.redactor.redactValue({
          source: "orchestrator",
          seq: this.counter.next(),
          event: {
            type: "summary",
            success: result.success,
            ...(result.verdict && { verdict: result.verdict }),
            turns: result.turns,
            ...(result.summary && { summary: result.summary }),
          },
        }),
      ) + "\n",
    );
  }
}

const devNull = new Writable({
  write(_chunk, _enc, cb) {
    cb();
  },
});

/**
 * Factory function — wires all participants with MCP servers.
 * @param {object} deps
 * @param {string} deps.facilitatorCwd
 * @param {Array<{name: string, role: string, cwd?: string, maxTurns?: number, allowedTools?: string[], agentProfile?: string, systemPromptAmend?: string}>} deps.agentConfigs
 * @param {function} deps.query
 * @param {import("stream").Writable} deps.output
 * @param {string} [deps.model] - Default model for all participants.
 * @param {string} [deps.agentModel] - Agent model override (falls back to `model`).
 * @param {string} [deps.facilitatorModel] - Facilitator model override (falls back to `model`).
 * @param {number} [deps.maxTurns] - Facilitator's own per-invocation turn budget (default 20). Each participating agent's budget is taken from `config.maxTurns` on its entry in `agentConfigs` (default 50 when unset). The CLI command (`commands/facilitate.js`) threads `--max-turns` into both this parameter and every agent config so a single CLI value bounds all participants uniformly.
 * @param {string[]} [deps.facilitatorAllowedTools] - Tools the facilitator may use; defaults to a read/write file-edit set.
 * @param {string[]} [deps.facilitatorDisallowedTools] - Additional tools to block on the facilitator; merged with the sub-agent spawn defaults (Agent/Task/TaskOutput/TaskStop).
 * @param {string} [deps.facilitatorProfile] - Facilitator profile name; resolved into the main-thread system prompt via `composeProfilePrompt`.
 * @param {string} [deps.profilesDir] - Directory containing `<name>.md` profile files. Defaults to `<facilitatorCwd>/.claude/agents`. Resolved once from the facilitator's cwd so profiles travel with the project, not with per-agent sandboxes.
 * @param {string} [deps.taskAmend] - Opaque addendum appended to the task before delivery.
 * @returns {Facilitator}
 */
export function createFacilitator({
  facilitatorCwd,
  agentConfigs,
  query,
  output,
  model,
  agentModel,
  facilitatorModel,
  maxTurns,
  facilitatorAllowedTools,
  facilitatorDisallowedTools,
  facilitatorProfile,
  profilesDir,
  taskAmend,
  redactor,
}) {
  if (!redactor) throw new Error("redactor is required");
  const resolvedProfilesDir =
    profilesDir ?? resolve(facilitatorCwd, ".claude/agents");
  const systemPromptFor = (profile, trailer) => {
    if (!trailer) throw new Error("trailer is required");
    return profile
      ? composeProfilePrompt(profile, {
          profilesDir: resolvedProfilesDir,
          trailer,
        })
      : { type: "preset", preset: "claude_code", append: trailer };
  };
  const ctx = createOrchestrationContext();
  const messageBus = createMessageBus({
    participants: ["facilitator", ...agentConfigs.map((a) => a.name)],
  });
  ctx.messageBus = messageBus;
  ctx.participants = [
    { name: "facilitator", role: "facilitator" },
    ...agentConfigs.map((a) => ({ name: a.name, role: a.role })),
  ];

  let facilitator;

  const eventQueue = createAsyncQueue();

  const facilitatorServer = createFacilitatorToolServer(ctx);

  const agents = agentConfigs.map((config) => {
    const agentServer = createFacilitatedAgentToolServer(ctx, {
      from: config.name,
    });

    const agentTrailer = config.systemPromptAmend
      ? `${FACILITATED_AGENT_SYSTEM_PROMPT}\n\n${config.systemPromptAmend}`
      : FACILITATED_AGENT_SYSTEM_PROMPT;

    const runner = createAgentRunner({
      cwd: config.cwd ?? facilitatorCwd,
      query,
      output: devNull,
      model: agentModel ?? model,
      maxTurns: config.maxTurns ?? 50,
      allowedTools: config.allowedTools,
      onLine: (line) => facilitator.emitLine(config.name, line),
      mcpServers: { orchestration: agentServer },
      settingSources: ["project"],
      systemPrompt: systemPromptFor(config.agentProfile, agentTrailer),
      redactor,
    });

    return { name: config.name, role: config.role, runner };
  });

  // Block the SDK's sub-agent spawn tools on the facilitator: its job is to
  // coordinate participants through the libeval orchestration harness, not
  // to fan work out to ad-hoc Claude Code sub-agents. Mirrors the supervisor.
  const defaultDisallowed = ["Agent", "Task", "TaskOutput", "TaskStop"];
  const disallowedTools = facilitatorDisallowedTools
    ? [...new Set([...defaultDisallowed, ...facilitatorDisallowedTools])]
    : defaultDisallowed;

  const facilitatorRunner = createAgentRunner({
    cwd: facilitatorCwd,
    query,
    output: devNull,
    model: facilitatorModel ?? model,
    maxTurns: maxTurns ?? 20,
    allowedTools: facilitatorAllowedTools ?? [
      "Bash",
      "Read",
      "Glob",
      "Grep",
      "Write",
      "Edit",
    ],
    disallowedTools,
    onLine: (line) => facilitator.emitLine("facilitator", line),
    mcpServers: { orchestration: facilitatorServer },
    settingSources: ["project"],
    systemPrompt: systemPromptFor(
      facilitatorProfile,
      FACILITATOR_SYSTEM_PROMPT,
    ),
    redactor,
  });

  facilitator = new Facilitator({
    facilitatorRunner,
    agents,
    messageBus,
    output,
    maxTurns,
    ctx,
    eventQueue,
    taskAmend,
    redactor,
  });
  return facilitator;
}
