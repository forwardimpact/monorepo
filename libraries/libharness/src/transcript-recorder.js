/**
 * TranscriptRecorder — per-participant in-memory record of the composed
 * system prompt, delivered prompts, and session messages, rendered into the
 * context text an advisor consult forwards. Constructed only when a session
 * runs with an advisor model; the harness otherwise keeps no per-participant
 * record (session lines go straight to the trace stream).
 *
 * Redaction split: the message tap arrives post-redaction (fed from
 * `AgentRunner.#recordLine`), but the seeded system prompt and the prompt
 * tap are raw, so the recorder redacts those itself via the injected
 * redactor.
 */

/**
 * Normalize whatever the harness composed as a system prompt into plain
 * text. In practice always a `{type:"preset", preset:"claude_code", append}`
 * object (every recorded participant is an agent; leads are spec-excluded);
 * a plain string is tolerated and `undefined` accepted.
 * @param {string|{type: string, preset?: string, append?: string}|undefined} systemPrompt
 * @returns {string|undefined}
 */
function normalizeSystemPrompt(systemPrompt) {
  if (!systemPrompt) return undefined;
  if (typeof systemPrompt === "string") return systemPrompt;
  if (systemPrompt.append) {
    return `(claude_code preset)\n${systemPrompt.append}`;
  }
  return undefined;
}

/** Wrap content in a tagged section, each tag on its own line. */
function wrapSection(tag, content) {
  return `<${tag}>\n${content}\n</${tag}>`;
}

/**
 * Create a per-participant transcript recorder.
 *
 * @param {object} deps
 * @param {string|object} [deps.systemPrompt] - The system prompt the harness
 *   composed for the participant, as passed to its runner. Raw — redacted at
 *   construction.
 * @param {import("./redaction.js").Redactor} deps.redactor
 * @returns {{recordPrompt: (text: string) => void, recordMessage: (line: string) => void, render: () => string}}
 */
export function createTranscriptRecorder({ systemPrompt, redactor }) {
  if (!redactor) throw new Error("redactor is required");
  const normalized = normalizeSystemPrompt(systemPrompt);
  const seededPrompt = normalized
    ? redactor.redactValue(normalized)
    : undefined;
  /** @type {string[]} */
  const prompts = [];
  /** @type {string[]} */
  const messages = [];

  return {
    /**
     * Record a delivered (amend-applied) prompt. Raw — redacted here.
     * @param {string} text
     */
    recordPrompt(text) {
      prompts.push(redactor.redactValue(text));
    },
    /**
     * Record one NDJSON session line as-is (it arrives already redacted
     * from the runner's line path).
     * @param {string} line
     */
    recordMessage(line) {
      messages.push(line);
    },
    /**
     * Render the record as the advisor's context text: three tagged
     * sections joined by blank lines, each present only when non-empty.
     * NDJSON lines are verbatim — the forwarded context is uncurated by
     * construction (context-size curation is spec-excluded).
     * @returns {string}
     */
    render() {
      const sections = [];
      if (seededPrompt) {
        sections.push(wrapSection("caller_system_prompt", seededPrompt));
      }
      if (prompts.length > 0) {
        sections.push(wrapSection("caller_prompts", prompts.join("\n\n")));
      }
      if (messages.length > 0) {
        sections.push(wrapSection("caller_transcript", messages.join("\n")));
      }
      return sections.join("\n\n");
    },
  };
}
