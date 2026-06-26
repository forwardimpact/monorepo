/**
 * Tool hints — pure one-line formatters for tool-call arguments and
 * tool-result previews.
 *
 * `hintForCall(name, input)` renders the human-meaningful field for each
 * tool (file path, command, pattern, …) sanitized to strip JSON punctuation
 * (`{`, `}`, `"`) and collapsed to a single line ≤ 80 chars.
 *
 * MCP-prefixed tools (`mcp__*`) are an intentional carve-out: their hint is
 * the full input rendered as compact single-line JSON, so `{` and `"` do
 * appear on those lines. Readers of GitHub workflow logs need the full MCP
 * payload to know what was actually sent across the protocol.
 *
 * `previewForResult(content, isError)` collapses a tool result to a single
 * line ≤ 80 chars and flags errors so the renderer can apply the reserved
 * error color and the `Error:` label.
 */

const MAX_HINT_CHARS = 80;

/**
 * Strip `{`, `}`, `"`, collapse whitespace, and truncate to MAX_HINT_CHARS.
 * First line only — anything past a newline is dropped. Always returns a
 * string, never null/undefined.
 * @param {unknown} raw
 * @returns {string}
 */
function sanitize(raw) {
  if (raw === null || raw === undefined) return "";
  const str = String(raw);
  const firstLine = str.split(/\r?\n/)[0] ?? "";
  const stripped = firstLine.replace(/[{}"]/g, "");
  const collapsed = stripped.replace(/\s+/g, " ").trim();
  if (collapsed.length <= MAX_HINT_CHARS) return collapsed;
  return collapsed.slice(0, MAX_HINT_CHARS - 3) + "...";
}

/**
 * Truncate an already-sanitized string to MAX_HINT_CHARS with a trailing
 * ellipsis when it overflows. Shared by the few handlers that concatenate
 * multiple sanitized pieces before deciding on truncation.
 * @param {string} str
 * @returns {string}
 */
function truncate(str) {
  return str.length <= MAX_HINT_CHARS
    ? str
    : str.slice(0, MAX_HINT_CHARS - 3) + "...";
}

/**
 * Per-tool hint handlers. Each entry takes the sanitized input object
 * (never null) and returns the hint string. Kept as a flat table so adding
 * a new tool is one entry, not a new branch in a growing switch.
 */
const HINT_HANDLERS = {
  Bash: (i) => sanitize(i.command),
  Read: (i) => sanitize(i.file_path),
  Write: (i) => sanitize(i.file_path),
  Edit: (i) => {
    const base = sanitize(i.file_path);
    return i.replace_all
      ? (base + " (replace_all)").slice(0, MAX_HINT_CHARS)
      : base;
  },
  Glob: (i) => sanitize(i.pattern),
  Grep: (i) => {
    const pattern = sanitize(i.pattern);
    return i.path ? truncate(`${pattern} in ${sanitize(i.path)}`) : pattern;
  },
  WebFetch: (i) => sanitize(i.url),
  WebSearch: (i) => sanitize(i.query),
  ToolSearch: (i) => sanitize(i.query),
  TodoWrite: (i) => {
    const count = Array.isArray(i.todos) ? i.todos.length : 0;
    return `${count} todos`;
  },
  NotebookEdit: (i) => sanitize(i.notebook_path),
  Skill: (i) => sanitize(i.skill),
  Agent: (i) => sanitize(i.prompt ?? i.description),
  Task: (i) => sanitize(i.prompt ?? i.description),
};

/**
 * Strip the `mcp__<server>__` prefix from MCP-namespaced tool names so logs
 * show the bare method (e.g. `mcp__orchestration__Ask` → `Ask`). Non-MCP
 * names and malformed inputs pass through unchanged.
 * @param {string} name
 * @returns {string}
 */
export function simplifyToolName(name) {
  if (!name) return "";
  if (!name.startsWith("mcp__")) return name;
  const parts = name.split("__");
  if (parts.length < 3) return name;
  return parts.slice(2).join("__");
}

/**
 * Map a tool name and input to a one-line human hint.
 *
 * Three branches, in priority order:
 *  - A built-in tool with an entry in `HINT_HANDLERS` → sanitized hint, no
 *    `{` / `"` from the input (built-in tool hints stay free of JSON
 *    punctuation so readers see clean one-liners).
 *  - An MCP-prefixed tool (`mcp__*`) → full input rendered as compact
 *    single-line JSON; `{` and `"` intentionally appear so readers see
 *    the actual MCP payload.
 *  - Anything else → "" (the caller still shows the bare tool name).
 *
 * @param {string} name - Tool name (e.g. "Bash", "Read", "mcp__orchestration__Ask")
 * @param {object|null|undefined} input - Raw tool input object from the trace
 * @returns {string} One-line hint, or "" when no rule matches
 */
export function hintForCall(name, input) {
  if (!name) return "";
  const safeInput = input && typeof input === "object" ? input : {};

  const handler = HINT_HANDLERS[name];
  if (handler) return handler(safeInput);

  if (name.startsWith("mcp__")) return JSON.stringify(safeInput);

  return "";
}

/**
 * Render a tool result as a single preview line plus an `isError` flag.
 * The flag lets the line-renderer pick the reserved error color without
 * re-inspecting the content.
 *
 * @param {string|object|null|undefined} content - Tool result content
 * @param {boolean} isError - Whether the tool call failed
 * @returns {{text: string, isError: boolean}}
 */
export function previewForResult(content, isError) {
  const normalized =
    content === null || content === undefined
      ? ""
      : typeof content === "string"
        ? content
        : JSON.stringify(content);
  const firstNonBlank =
    normalized
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.length > 0) ?? "";

  const fallback = isError ? "(no output)" : "(ok)";
  return {
    text: truncate(firstNonBlank || fallback),
    isError,
  };
}
