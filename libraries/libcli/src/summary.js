/**
 * Numeric severity in syslog order. This mirrors the LOG_LEVEL contract that
 * libtelemetry uses. The constant lives here so libcli stays free of
 * telemetry deps.
 */
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3, trace: 3 };
const DEFAULT_LEVEL = "info";

/**
 * Render post-run summary blocks to stdout. The renderer suppresses a
 * successful block only when the environment explicitly sets LOG_LEVEL=error.
 * The default level is "info", and it renders all blocks.
 */
export class SummaryRenderer {
  #proc;
  #level;

  /**
   * Initialize the renderer and read LOG_LEVEL from the environment. The level
   * defaults to "info" when LOG_LEVEL is absent or unrecognized. At that level
   * the renderer renders all blocks.
   */
  constructor({ process }) {
    this.#proc = process;
    const raw = (process.env?.LOG_LEVEL || "").toLowerCase().trim();
    this.#level = LEVELS[raw] ?? LEVELS[DEFAULT_LEVEL];
  }

  /**
   * Report whether the renderer would render a block for a run with the given
   * `ok` under the current LOG_LEVEL. This method centralizes the suppression
   * rule. A caller that gates richer output (tables, multi-line blocks) on the
   * same policy does not reimplement the level check.
   *
   * @param {boolean} ok
   * @returns {boolean}
   */
  shouldRender(ok) {
    if (typeof ok !== "boolean") {
      throw new TypeError(
        "SummaryRenderer.shouldRender requires an explicit `ok` boolean",
      );
    }
    return !(ok && this.#level <= LEVELS.error);
  }

  /**
   * Render a summary block. **A block is atomic, and it includes its top
   * margin.** `render` prepends a single blank line before the title, so a
   * block separates visually from the output before it. `render` suppresses
   * the whole unit (margin + title + items + extras) together when
   * LOG_LEVEL=error and the caller reports success (`ok: true`). A run that
   * fails still prints, so the user sees the diagnostic context at any
   * verbosity.
   *
   * The block owns the margin, so callers MUST NOT print their own `\n`
   * before `render`. A caller that prints one leaks a stray blank line when
   * `render` suppresses the block. It also double-spaces the block when
   * `render` renders it.
   *
   * @param {object}   params
   * @param {string}   params.title       Block title. `render` writes it after the leading blank line.
   * @param {Array<{label: string, description: string}>} params.items  Rows.
   * @param {boolean}  params.ok          Whether the run this summary describes succeeded.
   * @param {string}   [params.extras]    Free-form content that `render` writes after the items. The same suppression applies to it.
   * @param {{ write: (s: string) => void }} [stream]  Defaults to process.stdout.
   */
  render({ title, items, ok, extras }, stream = this.#proc.stdout) {
    if (!this.shouldRender(ok)) return;

    stream.write("\n" + title + "\n");

    if (items && items.length > 0) {
      const maxLabel = Math.max(...items.map((item) => item.label.length));
      for (const item of items) {
        stream.write(
          `  ${item.label.padEnd(maxLabel)}  — ${item.description}\n`,
        );
      }
    }

    if (extras) {
      stream.write(extras.endsWith("\n") ? extras : extras + "\n");
    }
  }
}
