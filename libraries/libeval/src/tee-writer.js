/**
 * TeeWriter — a Writable stream that writes raw NDJSON to a file while
 * simultaneously streaming human-readable text to a separate stream (e.g.
 * process.stdout).
 *
 * Supports two modes:
 * - "raw" (default): expects standard stream-json events from AgentRunner
 * - "supervised": expects tagged events {source, turn, event} from Supervisor
 *
 * Follows OO+DI: constructor injection, factory function, tests bypass factory.
 */

import { Writable } from "node:stream";
import { TraceCollector } from "./trace-collector.js";

export class TeeWriter extends Writable {
  /**
   * @param {object} deps
   * @param {import("stream").Writable} deps.fileStream - Stream to write raw NDJSON to
   * @param {import("stream").Writable} deps.textStream - Stream to write human-readable text to
   * @param {"raw"|"supervised"} [deps.mode] - Event format: "raw" or "supervised" (default: "raw")
   */
  constructor({ fileStream, textStream, mode }) {
    super();
    if (!fileStream) throw new Error("fileStream is required");
    if (!textStream) throw new Error("textStream is required");
    this.fileStream = fileStream;
    this.textStream = textStream;
    this.mode = mode ?? "raw";
    this.collector = new TraceCollector();
    this.turnsEmitted = 0;
    this.lastSource = null;
    this.partial = "";
  }

  /**
   * @param {Buffer|string} chunk
   * @param {string} encoding
   * @param {function} callback
   */
  _write(chunk, encoding, callback) {
    const str = this.partial + chunk.toString();
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
    if (this.partial.trim()) {
      this.fileStream.write(this.partial + "\n");
      this.processLine(this.partial);
    }

    if (this.mode === "raw" && this.collector.result) {
      const text = this.collector.toText();
      const idx = text.lastIndexOf("\n---");
      if (idx !== -1) {
        this.textStream.write(text.slice(idx) + "\n");
      }
    }

    callback();
  }

  /**
   * Process a single NDJSON line — feed to collector and flush text.
   * @param {string} line
   */
  processLine(line) {
    if (this.mode === "supervised") {
      this.processSupervisedLine(line);
    } else {
      this.collector.addLine(line);
      this.flushTurns();
    }
  }

  /**
   * Handle a tagged supervisor line: unwrap event, show source labels.
   * @param {string} line
   */
  processSupervisedLine(line) {
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      return;
    }

    if (parsed.source === "orchestrator" && parsed.type === "summary") {
      const status = parsed.success ? "completed" : "incomplete";
      this.textStream.write(
        `\n--- Evaluation ${status} after ${parsed.turns} turns ---\n`,
      );
      return;
    }

    if (parsed.event) {
      if (parsed.source && parsed.source !== this.lastSource) {
        this.lastSource = parsed.source;
      }
      this.collector.addLine(JSON.stringify(parsed.event));
      this.flushTurns();
    }
  }

  /**
   * Emit text for any new turns accumulated by the collector.
   */
  flushTurns() {
    const turns = this.collector.turns;
    const prefix =
      this.mode === "supervised" && this.lastSource
        ? `[${this.lastSource}] `
        : "";
    while (this.turnsEmitted < turns.length) {
      const turn = turns[this.turnsEmitted++];
      if (turn.role === "assistant") {
        for (const block of turn.content) {
          if (block.type === "text") {
            this.textStream.write(`${prefix}${block.text}\n`);
          } else if (block.type === "tool_use") {
            const input = summarizeInput(block.input);
            this.textStream.write(`${prefix}> Tool: ${block.name} ${input}\n`);
          }
        }
      }
    }
  }
}

/**
 * Summarize tool input for text display, truncated to keep logs readable.
 * @param {object} input - Tool input object
 * @returns {string} Truncated summary
 */
function summarizeInput(input) {
  if (!input || typeof input !== "object") return "";
  const json = JSON.stringify(input);
  if (json.length <= 200) return json;
  return json.slice(0, 197) + "...";
}

/**
 * Factory function — wires a TeeWriter with the given streams.
 * @param {object} deps - Same as TeeWriter constructor
 * @returns {TeeWriter}
 */
export function createTeeWriter(deps) {
  return new TeeWriter(deps);
}
