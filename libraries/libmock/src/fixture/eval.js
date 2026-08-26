/**
 * Test helpers for libharness-style streams, tool-use messages, and traces.
 *
 * Centralizes concludeMsg / redirectMsg / tellMsg / stripAnsi / collect /
 * writeLines / buildTrace so test files under libraries/libharness/test do not
 * each inline their own copy.
 */

/**
 * Builds a tool-use message envelope in the shape the agent SDK emits.
 * Replaces per-file concludeMsg / redirectMsg / tellMsg / shareMsg helpers.
 *
 * @param {string} name - Tool name, e.g. "Conclude", "Redirect", "Tell", "Share".
 * @param {object} input - Tool input payload.
 * @param {object} [options]
 * @param {string} [options.id] - Explicit tool_use id. Defaults to `${name.toLowerCase()}-1`.
 * @returns {object} Assistant message with a single tool_use content block.
 */
export function createToolUseMsg(name, input, { id } = {}) {
  return {
    type: "assistant",
    message: {
      content: [
        {
          type: "tool_use",
          id: id || `${name.toLowerCase()}-1`,
          name,
          input,
        },
      ],
    },
  };
}

/**
 * Builds an envelope for an assistant text message, in the shape the agent
 * SDK emits.
 * @param {string} text - Text content.
 * @returns {object} Assistant message with a single text content block.
 */
export function createTextBlockMsg(text) {
  return {
    type: "assistant",
    message: {
      content: [{ type: "text", text }],
    },
  };
}

/**
 * Reads a PassThrough / Readable stream to a single string.
 *
 * Drains every buffered chunk. A single `read()` returns only what the
 * runtime happens to hold in one chunk, so it truncates a multi-write
 * stream under bun while it looks complete under node.
 *
 * @param {import("node:stream").Readable} stream
 * @returns {string}
 */
export function collectStream(stream) {
  let out = "";
  for (let chunk = stream.read(); chunk !== null; chunk = stream.read()) {
    out += chunk.toString();
  }
  return out;
}

/**
 * Reads a stream and returns non-empty lines.
 * @param {import("node:stream").Readable} stream
 * @returns {string[]}
 */
export function collectLines(stream) {
  return collectStream(stream).split("\n").filter(Boolean);
}

/**
 * Strips ANSI SGR escape sequences from a string.
 * @param {string} s
 * @returns {string}
 */
export function stripAnsi(s) {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI SGR detection is intentional.
  return s.replace(/\[[0-9;]*m/g, "");
}

/**
 * Writes each line to the writer with a newline after it. Then ends the
 * writer.
 * @param {import("node:stream").Writable} writer
 * @param {string[]} lines
 * @returns {Promise<void>}
 */
export async function writeLines(writer, lines) {
  for (const line of lines) writer.write(line + "\n");
  await new Promise((resolve) => writer.end(resolve));
}

/**
 * Builds a minimal-but-valid trace object for TraceQuery tests.
 * Replaces a 155-line inline buildTrace in trace-query.test.js.
 *
 * @param {object} [overrides]
 * @param {object} [overrides.metadata]
 * @param {object[]} [overrides.turns]
 * @param {object} [overrides.summary]
 * @returns {object} Trace object.
 */
export function createTestTrace(overrides = {}) {
  const { metadata = {}, turns = [], summary = {} } = overrides;
  return {
    schema_version: "1.1",
    metadata: {
      session_id: "sess-test",
      model: "claude-fable-5",
      started_at: "2026-01-01T00:00:00Z",
      ended_at: "2026-01-01T00:00:05Z",
      tools: [],
      ...metadata,
    },
    turns,
    summary: {
      total_turns: turns.length,
      total_tokens: 0,
      tool_calls: 0,
      errors: 0,
      ...summary,
    },
  };
}

/**
 * Creates an async-generator stub for an agent query. The shape of `messages`
 * determines per-call behaviour:
 *  - Flat array of message objects: the stub yields them on every call.
 *  - Array of arrays (batches): the Nth call yields messages from the Nth
 *    batch. Later calls past the last batch repeat the last batch.
 *
 * @param {object[] | object[][]} messages
 * @param {(params: object) => void} [onParams] - Receives the call params.
 * @returns {Function} Async generator that mimics `query({...})`.
 */
export function createMockAgentQuery(messages, onParams) {
  const isBatched = Array.isArray(messages[0]);
  let callIndex = 0;
  return async function* mockQuery(params) {
    if (onParams) onParams(params);
    if (!isBatched) {
      for (const msg of messages) yield msg;
      return;
    }
    const batch = messages[callIndex] ?? messages[messages.length - 1] ?? [];
    callIndex += 1;
    for (const msg of batch) yield msg;
  };
}
