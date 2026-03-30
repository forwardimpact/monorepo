import { createWriteStream } from "fs";
import { createTraceCollector } from "@forwardimpact/libeval";

/**
 * Tee command — stream text output to stdout while optionally saving the raw
 * NDJSON to a file. Processes stdin line-by-line for streaming output.
 *
 * Usage: fit-eval tee [output.ndjson] < trace.ndjson
 *
 * @param {string[]} args - Command arguments (optional output file path)
 */
export async function runTeeCommand(args) {
  const outputPath = args.find((a) => !a.startsWith("-")) ?? null;
  const fileStream = outputPath ? createWriteStream(outputPath) : null;
  const collector = createTraceCollector();
  const turnsEmitted = { count: 0 };

  try {
    let buffer = "";

    for await (const chunk of process.stdin) {
      buffer += chunk.toString("utf8");

      let newlineIdx;
      while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIdx);
        buffer = buffer.slice(newlineIdx + 1);

        if (fileStream) {
          fileStream.write(line + "\n");
        }

        collector.addLine(line);
        flushNewTurns(collector, turnsEmitted);
      }
    }

    // Process any remaining data without a trailing newline
    if (buffer.trim()) {
      if (fileStream) {
        fileStream.write(buffer + "\n");
      }
      collector.addLine(buffer);
      flushNewTurns(collector, turnsEmitted);
    }

    // Emit the result summary at the end
    if (collector.result) {
      const text = collector.toText();
      const lastNewline = text.lastIndexOf("\n---");
      if (lastNewline !== -1) {
        process.stdout.write(text.slice(lastNewline) + "\n");
      }
    }
  } finally {
    if (fileStream) {
      await new Promise((resolve, reject) => {
        fileStream.end(() => resolve());
        fileStream.on("error", reject);
      });
    }
  }
}

/**
 * Write text for any new turns that haven't been emitted yet.
 * @param {import("@forwardimpact/libeval").TraceCollector} collector
 * @param {{ count: number }} turnsEmitted
 */
function flushNewTurns(collector, turnsEmitted) {
  const turns = collector.turns;
  while (turnsEmitted.count < turns.length) {
    const turn = turns[turnsEmitted.count];
    turnsEmitted.count++;

    if (turn.role === "assistant") {
      for (const block of turn.content) {
        if (block.type === "text") {
          process.stdout.write(block.text + "\n");
        } else if (block.type === "tool_use") {
          const inputSummary = summarizeInput(block.input);
          process.stdout.write(`> Tool: ${block.name} ${inputSummary}\n`);
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
