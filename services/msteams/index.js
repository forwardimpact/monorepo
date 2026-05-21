import { randomUUID } from "node:crypto";

import botbuilder from "botbuilder";
import express from "express";

const { CloudAdapter, ConfigurationBotFrameworkAuthentication, TurnContext } =
  botbuilder;

const HISTORY_MAX_EXCHANGES = 5;
const PROMPT_CHAR_CAP = 4000;
const GITHUB_WORKFLOW_FILE = "agent-react.yml";
const GITHUB_REF = "main";
const PENDING_CALLBACK_TTL_MS = 2 * 60 * 60 * 1000;
const CONVERSATION_TTL_MS = 24 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 5;
const MAX_FIELD_LENGTH = 2000;
const TYPING_INTERVAL_MS = 12_000;
const TYPING_VERBS = [
  "Moonwalking",
  "Unravelling",
  "Tempering",
  "Crafting",
  "Simmering",
  "Percolating",
  "Decoding",
];

/**
 * Build a facilitator prompt from the current message text and a rolling
 * conversation history. History is bounded to the last 5 exchanges (10
 * entries) and the total prompt size is capped at ~4000 characters by
 * dropping the oldest history entries until it fits.
 *
 * @param {string} text - The current user message
 * @param {Array<{role: "user"|"assistant", text: string}>} history - Prior
 *   exchanges in chronological order. Most recent last.
 * @returns {string}
 */
export function buildPrompt(text, history) {
  const trimmed = history.slice(-HISTORY_MAX_EXCHANGES * 2);
  while (trimmed.length > 0) {
    const block = trimmed
      .map((h) => `${h.role === "user" ? "User" : "Agent"}: ${h.text}`)
      .join("\n\n");
    const composed = `Prior conversation:\n${block}\n\nCurrent message: ${text}`;
    if (composed.length <= PROMPT_CHAR_CAP) return composed;
    trimmed.shift();
  }
  return text;
}

/**
 * @param {string} url
 * @returns {boolean}
 */
export function isValidRunUrl(url) {
  if (typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === "github.com";
  } catch {
    return false;
  }
}

/**
 * Format the verdict and summary as a Teams reply.
 *
 * @param {{verdict: string, summary: string, run_url?: string}} payload
 * @returns {string}
 */
export function formatReply(payload) {
  return payload.summary ?? "";
}

/**
 * Validate and sanitize the callback payload. Returns a clean object or null.
 *
 * @param {unknown} body
 * @returns {{correlation_id: string, verdict: string, summary: string, run_url?: string} | null}
 */
export function validateCallbackPayload(body) {
  if (!body || typeof body !== "object") return null;

  const cid = body.correlation_id;
  if (typeof cid !== "string" || !cid) return null;

  const verdict =
    typeof body.verdict === "string"
      ? body.verdict.slice(0, MAX_FIELD_LENGTH)
      : "unknown";
  const summary =
    typeof body.summary === "string"
      ? body.summary.slice(0, MAX_FIELD_LENGTH)
      : "";
  const run_url =
    typeof body.run_url === "string" && isValidRunUrl(body.run_url)
      ? body.run_url
      : undefined;

  return { correlation_id: cid, verdict, summary, run_url };
}

/**
 * Append a message to a bounded history, dropping the oldest entries when
 * the cap is exceeded.
 *
 * @param {Array<{role: "user"|"assistant", text: string}>} history
 * @param {{role: "user"|"assistant", text: string}} entry
 */
export function appendHistory(history, entry) {
  history.push(entry);
  const max = HISTORY_MAX_EXCHANGES * 2;
  while (history.length > max) history.shift();
}

function normalizeBaseUrl(url) {
  return (url ?? "").replace(/\/+$/, "");
}

/**
 * Microsoft Teams bridge service. Receives messages from Teams via the Bot
 * Framework, dispatches agent-react workflows on GitHub, and delivers the
 * callback reply back into the Teams conversation.
 */
export class MsTeamsService {
  #logger;
  #tracer;
  #conversations = new Map();
  #pendingCallbacks = new Map();
  #adapter;
  #app;
  #server;
  #sweepTimer;
  #callbackBaseUrl;

  /**
   * @param {import("@forwardimpact/libconfig").ServiceConfig} config
   * @param {object} deps
   * @param {import("@forwardimpact/libtelemetry").Logger} deps.logger
   * @param {import("@forwardimpact/libtelemetry").Tracer} deps.tracer
   */
  constructor(config, { logger, tracer }) {
    if (!logger) throw new Error("logger is required");
    if (!tracer) throw new Error("tracer is required");
    this.config = config;
    this.#logger = logger;
    this.#tracer = tracer;
    this.#callbackBaseUrl = normalizeBaseUrl(config.callback_base_url);

    const auth = new ConfigurationBotFrameworkAuthentication({
      MicrosoftAppId: config.msAppId(),
      MicrosoftAppPassword: config.msAppPassword(),
      MicrosoftAppTenantId: config.msAppTenantId(),
      MicrosoftAppType: "SingleTenant",
    });
    this.#adapter = new CloudAdapter(auth);

    this.#adapter.onTurnError = async (context, error) => {
      this.#logger.error("onTurnError", error);
      try {
        await context.sendActivity("Sorry, something went wrong.");
      } catch (sendError) {
        this.#logger.error("onTurnError", "failed to send error notice", {
          original: error?.message,
          send_error: sendError?.message,
        });
      }
    };

    this.#app = express();
    this.#app.use(express.json());

    this.#app.options("/api/messages", (_req, res) => {
      res.status(200).end();
    });

    this.#app.post("/api/messages", async (req, res) => {
      this.#logger.debug("messages", "activity received");
      try {
        await this.#adapter.process(req, res, (context) =>
          this.#handleMessage(context),
        );
      } catch (err) {
        this.#logger.error("messages", err);
        if (!res.headersSent)
          res.status(400).json({ error: "Invalid activity" });
      }
    });

    this.#app.post("/api/callback/:token", async (req, res) => {
      await this.#handleCallback(req, res);
    });
  }

  /** @returns {Map<string, {ref: object, history: Array, lastActiveAt: number, dispatches: number[]}>} */
  get conversations() {
    return this.#conversations;
  }

  /** @returns {Map<string, {correlationId: string, threadId: string, createdAt: number}>} */
  get pendingCallbacks() {
    return this.#pendingCallbacks;
  }

  /** @returns {import("express").Express} */
  get app() {
    return this.#app;
  }

  /** @returns {Promise<void>} */
  async start() {
    const { host, port } = this.config;
    await new Promise((resolve) => {
      this.#server = this.#app.listen(port, host, () => {
        this.#logger.info("server", "listening", {
          url: this.config.url,
          callback_base_url: this.#callbackBaseUrl,
          repo: this.config.github_repo,
        });
        resolve();
      });
    });
    this.#sweepTimer = setInterval(() => this.#sweep(), SWEEP_INTERVAL_MS);
    this.#sweepTimer.unref();
  }

  /** @returns {Promise<void>} */
  async stop() {
    if (this.#sweepTimer) {
      clearInterval(this.#sweepTimer);
      this.#sweepTimer = null;
    }
    if (!this.#server) return;
    this.#logger.info("server", "shutting down", {
      conversations: this.#conversations.size,
      pending_callbacks: this.#pendingCallbacks.size,
    });
    await new Promise((resolve) => this.#server.close(() => resolve()));
    this.#server = null;
  }

  async #handleMessage(context) {
    const activity = context.activity;

    if (activity.type !== "message") {
      this.#logger.debug("handleActivity", "ignoring non-message activity", {
        type: activity.type,
      });
      return;
    }

    const threadId = activity.conversation?.id;
    if (!threadId) {
      this.#logger.debug(
        "handleMessage",
        "ignoring activity without thread ID",
      );
      return;
    }

    const text = (activity.text ?? "").trim();
    if (!text) {
      this.#logger.debug("handleMessage", "ignoring empty message", {
        thread_id: threadId,
      });
      return;
    }

    const from = activity.from?.name ?? activity.from?.id ?? "unknown";
    this.#logger.debug("handleMessage", "received", {
      thread_id: threadId,
      from,
      text_length: text.length,
    });

    const span = this.#tracer.startSpan("MsTeams.HandleMessage", {
      kind: "SERVER",
      attributes: { thread_id: threadId },
    });

    try {
      const now = Date.now();
      const isNew = !this.#conversations.has(threadId);
      let state = this.#conversations.get(threadId);
      if (!state) {
        state = { ref: null, history: [], lastActiveAt: now, dispatches: [] };
        this.#conversations.set(threadId, state);
      }
      state.ref = TurnContext.getConversationReference(activity);
      state.lastActiveAt = now;

      if (isNew) {
        this.#logger.info("handleMessage", "new conversation", {
          thread_id: threadId,
          from,
          conversations_total: this.#conversations.size,
        });
      } else {
        this.#logger.debug("handleMessage", "continuing conversation", {
          thread_id: threadId,
          history_size: state.history.length,
        });
      }

      if (this.#isRateLimited(state)) {
        this.#logger.info("handleMessage", "rate limited", {
          thread_id: threadId,
        });
        span.addEvent("rate_limited");
        span.setOk();
        await context.sendActivity(
          "You're sending messages too quickly. Please wait a moment before trying again.",
        );
        return;
      }

      const historyBefore = state.history.length;
      const prompt = buildPrompt(text, state.history);
      this.#logger.debug("handleMessage", "prompt built", {
        thread_id: threadId,
        history_entries_used: Math.min(
          historyBefore,
          HISTORY_MAX_EXCHANGES * 2,
        ),
        prompt_length: prompt.length,
        prompt_capped: prompt.length >= PROMPT_CHAR_CAP,
        history_included: prompt !== text,
      });

      const correlationId = randomUUID();
      const callbackToken = randomUUID();
      const callbackUrl = `${this.#callbackBaseUrl}/api/callback/${callbackToken}`;

      this.#pendingCallbacks.set(callbackToken, {
        correlationId,
        threadId,
        createdAt: Date.now(),
      });
      this.#logger.debug("handleMessage", "callback registered", {
        correlation_id: correlationId,
        pending_total: this.#pendingCallbacks.size,
      });

      const verb =
        TYPING_VERBS[Math.floor(Math.random() * TYPING_VERBS.length)];
      await context.sendActivity(`${verb}...`);
      this.#logger.debug("handleMessage", "acknowledgement sent", {
        thread_id: threadId,
      });

      this.#logger.info("handleMessage", "dispatching workflow", {
        thread_id: threadId,
        correlation_id: correlationId,
        repo: this.config.github_repo,
        prompt_length: prompt.length,
        history_size: historyBefore,
      });

      try {
        await this.#dispatchWorkflow(prompt, callbackUrl, correlationId);
        this.#logger.info("handleMessage", "workflow dispatched", {
          thread_id: threadId,
          correlation_id: correlationId,
        });
        this.#startTypingTicker(callbackToken, state);
        appendHistory(state.history, { role: "user", text });
        state.dispatches.push(Date.now());
        this.#logger.debug("handleMessage", "history updated", {
          thread_id: threadId,
          history_size: state.history.length,
        });
        span.addEvent("workflow_dispatched", {
          correlation_id: correlationId,
        });
        span.setOk();
      } catch (err) {
        this.#pendingCallbacks.delete(callbackToken);
        this.#logger.error("handleMessage", err, {
          thread_id: threadId,
          correlation_id: correlationId,
          pending_total: this.#pendingCallbacks.size,
        });
        span.setError(err);
        await context.sendActivity(
          "Failed to reach the agent team. Please try again later.",
        );
      }
    } finally {
      await span.end();
    }
  }

  async #handleCallback(req, res) {
    const { token } = req.params;
    const pending = this.#pendingCallbacks.get(token);
    if (!pending) {
      this.#logger.debug("callback", "unknown token");
      res.status(404).json({ error: "Unknown callback token" });
      return;
    }

    this.#logger.info("callback", "received", {
      correlation_id: pending.correlationId,
      thread_id: pending.threadId,
    });

    const span = this.#tracer.startSpan("MsTeams.HandleCallback", {
      kind: "SERVER",
      attributes: { correlation_id: pending.correlationId },
    });

    try {
      const payload = validateCallbackPayload(req.body);
      if (!payload) {
        this.#logger.error("callback", "invalid payload", {
          correlation_id: pending.correlationId,
        });
        span.setError(new Error("Invalid callback payload"));
        res.status(400).json({ error: "Invalid payload" });
        return;
      }

      if (payload.correlation_id !== pending.correlationId) {
        this.#logger.error("callback", "correlation ID mismatch", {
          expected: pending.correlationId,
          received: payload.correlation_id,
        });
        span.setError(new Error("Correlation ID mismatch"));
        res.status(400).json({ error: "Correlation ID mismatch" });
        return;
      }
      this.#stopTypingTicker(token);
      this.#pendingCallbacks.delete(token);
      this.#logger.debug("callback", "token consumed", {
        correlation_id: pending.correlationId,
        pending_total: this.#pendingCallbacks.size,
      });

      const state = this.#conversations.get(pending.threadId);
      if (!state || !state.ref) {
        this.#logger.error("callback", "conversation reference missing", {
          thread_id: pending.threadId,
          conversation_exists: this.#conversations.has(pending.threadId),
          ref_exists: !!state?.ref,
        });
        span.setError(new Error("Conversation reference missing"));
        res.status(410).json({ error: "Conversation reference missing" });
        return;
      }

      const replyText = formatReply(payload);

      this.#logger.info("callback", "delivering reply", {
        thread_id: pending.threadId,
        correlation_id: pending.correlationId,
        verdict: payload.verdict,
        summary_length: payload.summary.length,
        has_run_url: !!payload.run_url,
      });

      await this.#adapter.continueConversationAsync(
        this.config.msAppId(),
        state.ref,
        async (context) => {
          await context.sendActivity(replyText);
        },
      );
      appendHistory(state.history, {
        role: "assistant",
        text: payload.summary,
      });
      this.#logger.info("callback", "reply delivered", {
        thread_id: pending.threadId,
        correlation_id: pending.correlationId,
        verdict: payload.verdict,
        history_size: state.history.length,
      });
      span.addEvent("reply_delivered", { verdict: payload.verdict });
      span.setOk();
      res.status(200).json({ ok: true });
    } catch (err) {
      this.#logger.error("callback", err, {
        thread_id: pending.threadId,
        correlation_id: pending.correlationId,
      });
      span.setError(err);
      if (!res.headersSent)
        res.status(500).json({ error: "Failed to deliver reply" });
    } finally {
      await span.end();
    }
  }

  #startTypingTicker(callbackToken, state) {
    const pending = this.#pendingCallbacks.get(callbackToken);
    if (!pending || !state.ref) return;
    pending.typingTimer = setInterval(async () => {
      try {
        const verb =
          TYPING_VERBS[Math.floor(Math.random() * TYPING_VERBS.length)];
        await this.#adapter.continueConversationAsync(
          this.config.msAppId(),
          state.ref,
          async (context) => {
            await context.sendActivity(`${verb}...`);
          },
        );
      } catch {
        this.#stopTypingTicker(callbackToken);
      }
    }, TYPING_INTERVAL_MS);
    pending.typingTimer.unref();
  }

  #stopTypingTicker(callbackToken) {
    const pending = this.#pendingCallbacks.get(callbackToken);
    if (pending?.typingTimer) {
      clearInterval(pending.typingTimer);
      pending.typingTimer = null;
    }
  }

  #isRateLimited(state) {
    const now = Date.now();
    state.dispatches = state.dispatches.filter(
      (t) => now - t < RATE_LIMIT_WINDOW_MS,
    );
    return state.dispatches.length >= RATE_LIMIT_MAX;
  }

  #sweep() {
    const now = Date.now();
    let conversationsEvicted = 0;
    let callbacksEvicted = 0;

    for (const [threadId, state] of this.#conversations) {
      if (now - state.lastActiveAt > CONVERSATION_TTL_MS) {
        this.#conversations.delete(threadId);
        conversationsEvicted++;
      }
    }

    for (const [token, pending] of this.#pendingCallbacks) {
      if (now - pending.createdAt > PENDING_CALLBACK_TTL_MS) {
        this.#stopTypingTicker(token);
        this.#pendingCallbacks.delete(token);
        callbacksEvicted++;
      }
    }

    if (conversationsEvicted > 0 || callbacksEvicted > 0) {
      this.#logger.debug("sweep", "evicted stale entries", {
        conversations_evicted: conversationsEvicted,
        callbacks_evicted: callbacksEvicted,
        conversations_remaining: this.#conversations.size,
        callbacks_remaining: this.#pendingCallbacks.size,
      });
    }
  }

  async #dispatchWorkflow(prompt, callbackUrl, correlationId) {
    const url = `https://api.github.com/repos/${this.config.github_repo}/actions/workflows/${GITHUB_WORKFLOW_FILE}/dispatches`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.ghToken()}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: GITHUB_REF,
        inputs: {
          prompt,
          callback_url: callbackUrl,
          correlation_id: correlationId,
        },
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `workflow_dispatch failed: ${res.status} ${res.statusText} ${body}`,
      );
    }
  }
}
