/**
 * TeeWriter — a Writable stream that writes raw NDJSON to a file. At the
 * same time it sends human-readable text to a separate stream (e.g.
 * process.stdout).
 *
 * All modes emit the same { source, seq, event } envelope. The `mode`
 * parameter controls the display format. Multi-participant modes show
 * source labels on content lines.
 *
 * The pure modules under `./render/` render the human text, so the live
 * stream and the offline `TraceCollector.toText()` replay share one format
 * path. The NDJSON that goes to `fileStream` stays untouched. Only what
 * reaches `textStream` changes.
 *
 * Follows OO+DI: constructor injection, factory function, tests bypass factory.
 */

import { Writable } from "node:stream";
import { TraceCollector } from "./trace-collector.js";
import { renderTurnLines } from "./render/turn-renderer.js";
import { isSuppressedOrchestratorEvent } from "./render/orchestrator-filter.js";

/** Writable stream that saves raw NDJSON to a file and sends human-readable text to a display stream. */
export class TeeWriter extends Writable {
  /**
   * @param {object} deps
   * @param {import("stream").Writable} deps.fileStream - Stream to write raw NDJSON to
   * @param {import("stream").Writable} deps.textStream - Stream to write human-readable text to
   * @param {"raw"|"supervised"} [deps.mode] - Display mode: "raw" (no source labels) or "supervised" (source labels) (default: "raw")
   * @param {function} [deps.now] - Injected ISO-timestamp source. The class
   *   threads it into the internal `TraceCollector`
   *   (`() => isoTimestamp(runtime.clock.now())`).
   */
  constructor({ fileStream, textStream, mode, now }) {
    super();
    if (!fileStream) throw new Error("fileStream is required");
    if (!textStream) throw new Error("textStream is required");
    this.fileStream = fileStream;
    this.textStream = textStream;
    this.mode = mode ?? "raw";
    this.collector = new TraceCollector({ now });
    this.turnsEmitted = 0;
  }

  /**
   * @param {Buffer|string} chunk
   * @param {string} encoding
   * @param {function} callback
   */
  _write(chunk, encoding, callback) {
    const str = (this.partial ?? "") + chunk.toString();
    const lines = str.split("\n");
    this.partial = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      this.fileStream.write(line + "\n");
      this.processLine(line);
    }
    callback();
  }

  /**
   * @param {function} callback
   */
  _final(callback) {
    if (this.partial && this.partial.trim()) {
      this.fileStream.write(this.partial + "\n");
      this.processLine(this.partial);
    }

    // Emit the trailing `--- Result: ... ---` footer. It is the one summary
    // line humans want. TraceCollector.toText() appends the same tail, so
    // the live stream and the offline replay stay in sync. No mode emits
    // the superseded `--- Evaluation ... ---` footer.
    if (this.collector.result) {
      const text = this.collector.toText();
      const idx = text.lastIndexOf("\n---");
      if (idx !== -1) {
        // Slice past the leading `\n`. The body that already streamed
        // ended with its own newline. A second `\n---` here would add a
        // blank line before the footer and desync from the offline replay.
        this.textStream.write(text.slice(idx + 1) + "\n");
      }
    }

    callback();
  }

  /**
   * Process a single NDJSON line. The same envelope logic covers all modes.
   * @param {string} line
   */
  processLine(line) {
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      return;
    }

    // Universal envelope: { source, seq, event }
    if (parsed.event) {
      // Always forward to the collector so it can capture orchestrator
      // metadata (e.g. the summary verdict for the result footer). The
      // collector adds no turn for suppressed events. So flushTurns stays
      // a no-op when we skip it below.
      this.collector.addLine(line);

      // The text stream drops orchestrator lifecycle events entirely.
      // Humans only want agent-visible content. These events still reached
      // fileStream above.
      if (
        parsed.source === "orchestrator" &&
        isSuppressedOrchestratorEvent(parsed.event)
      ) {
        return;
      }
      this.flushTurns();
      return;
    }

    // Bare event (unwrapped run mode line or direct feed)
    this.collector.addLine(line);
    this.flushTurns();
  }

  /**
   * Emit text for any new turns the collector accumulated.
   */
  flushTurns() {
    const turns = this.collector.turns;
    const withPrefix = this.mode !== "raw";
    while (this.turnsEmitted < turns.length) {
      const turn = turns[this.turnsEmitted++];
      for (const line of renderTurnLines(turn, withPrefix)) {
        this.textStream.write(line);
      }
    }
  }
}

/**
 * Factory function — wires a TeeWriter with the given streams.
 * @param {object} deps - Same as TeeWriter constructor
 * @returns {TeeWriter}
 */
export function createTeeWriter(deps) {
  return new TeeWriter(deps);
}
