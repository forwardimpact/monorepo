/**
 * TranscriptRecorder — a per-participant in-memory record of the composed
 * system prompt, the delivered prompts, and the session messages. The
 * recorder renders that record into the context text an advisor consult
 * forwards. The harness constructs it only when a session runs with an
 * advisor model. Otherwise the harness keeps no per-participant record.
 * Session lines then go straight to the trace stream.
 *
 * The redaction path splits. The message tap arrives already redacted from
 * `AgentRunner.#recordLine`. The seeded system prompt and the prompt tap
 * are raw. The recorder redacts those two itself through the injected
 * redactor.
 */

/**
 * Normalize whatever the harness composed as a system prompt into plain
 * text. In practice it is always a
 * `{type:"preset", preset:"claude_code", append}` object. Every recorded
 * participant is an agent. The spec excludes leads. The function also
 * accepts a plain string. It accepts `undefined` too.
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
 *   composed for the participant, exactly as it goes to the runner. The
 *   value arrives raw. The recorder redacts it at construction.
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
     * Record a delivered (amend-applied) prompt. The text arrives raw.
     * This method redacts it.
     * @param {string} text
     */
    recordPrompt(text) {
      prompts.push(redactor.redactValue(text));
    },
    /**
     * Record one NDJSON session line as-is. It arrives already redacted
     * from the runner's line path.
     * @param {string} line
     */
    recordMessage(line) {
      messages.push(line);
    },
    /**
     * Render the record as the advisor's context text. Blank lines join
     * three tagged sections. Each section appears only when it is
     * non-empty. The NDJSON lines stay verbatim. The forwarded context is
     * uncurated by construction, because the spec excludes context-size
     * curation.
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
