import { describe, test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { runSplitCommand } from "../src/commands/trace.js";

/**
 * Invoke the split handler with an InvocationContext-shaped object backed by a
 * real-fs runtime. `values` are the parsed flags; `file` is the positional.
 */
function split(values, [file]) {
  return runSplitCommand({
    options: values,
    args: { file },
    deps: { runtime: { fsSync: fs } },
  });
}

/**
 * Create a temp directory and write combined NDJSON lines to a trace file.
 * @param {object[]} envelopes - Array of envelope objects { source, seq, event }
 * @returns {{ dir: string, file: string }}
 */
function setupTrace(envelopes) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trace-split-"));
  const file = path.join(dir, "trace--demo.raw.ndjson");
  const content = envelopes.map((e) => JSON.stringify(e)).join("\n") + "\n";
  fs.writeFileSync(file, content);
  return { dir, file };
}

/**
 * Read an NDJSON output file and return parsed lines.
 * @param {string} filePath
 * @returns {object[]}
 */
function readNdjson(filePath) {
  return fs
    .readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

describe("fit-trace split", () => {
  describe("supervise mode", () => {
    test("emits agent and supervisor files keyed by case and source", () => {
      const agentEvent = {
        type: "assistant",
        message: { content: [{ type: "text", text: "hello" }] },
      };
      const supervisorEvent = {
        type: "assistant",
        message: { content: [{ type: "text", text: "looks good" }] },
      };

      const { dir, file } = setupTrace([
        { source: "agent", seq: 0, event: agentEvent },
        { source: "supervisor", seq: 1, event: supervisorEvent },
      ]);

      split({ mode: "supervise", case: "demo" }, [file]);

      const agentLines = readNdjson(
        path.join(dir, "trace--demo--agent.agent.ndjson"),
      );
      assert.strictEqual(agentLines.length, 1);
      assert.deepStrictEqual(agentLines[0], agentEvent);

      const supervisorLines = readNdjson(
        path.join(dir, "trace--demo--supervisor.supervisor.ndjson"),
      );
      assert.strictEqual(supervisorLines.length, 1);
      assert.deepStrictEqual(supervisorLines[0], supervisorEvent);
    });
  });

  describe("facilitate mode", () => {
    test("emits one file per profile-named agent and one for the facilitator", () => {
      const facEvent = {
        type: "assistant",
        message: { content: [{ type: "text", text: "facilitating" }] },
      };
      const eng1Event = {
        type: "assistant",
        message: { content: [{ type: "text", text: "engineer 1 work" }] },
      };
      const eng2Event = {
        type: "assistant",
        message: { content: [{ type: "text", text: "engineer 2 work" }] },
      };

      const { dir, file } = setupTrace([
        { source: "facilitator", seq: 0, event: facEvent },
        { source: "staff-engineer", seq: 1, event: eng1Event },
        { source: "security-engineer", seq: 2, event: eng2Event },
      ]);

      split({ mode: "facilitate", case: "demo" }, [file]);

      const facLines = readNdjson(
        path.join(dir, "trace--demo--facilitator.facilitator.ndjson"),
      );
      assert.strictEqual(facLines.length, 1);
      assert.deepStrictEqual(facLines[0], facEvent);

      const eng1Lines = readNdjson(
        path.join(dir, "trace--demo--staff-engineer.agent.ndjson"),
      );
      assert.strictEqual(eng1Lines.length, 1);
      assert.deepStrictEqual(eng1Lines[0], eng1Event);

      const eng2Lines = readNdjson(
        path.join(dir, "trace--demo--security-engineer.agent.ndjson"),
      );
      assert.strictEqual(eng2Lines.length, 1);
      assert.deepStrictEqual(eng2Lines[0], eng2Event);

      // No merged combined-agents file under the new convention.
      assert.ok(
        !fs.existsSync(path.join(dir, "trace--demo--agent.agent.ndjson")),
      );
    });
  });

  describe("run mode", () => {
    test("emits a single agent file using the unified convention", () => {
      const event = {
        type: "assistant",
        message: { content: [{ type: "text", text: "hi" }] },
      };
      const { dir, file } = setupTrace([{ source: "agent", seq: 0, event }]);

      split({ mode: "run", case: "demo" }, [file]);

      const agentLines = readNdjson(
        path.join(dir, "trace--demo--agent.agent.ndjson"),
      );
      assert.strictEqual(agentLines.length, 1);
      assert.deepStrictEqual(agentLines[0], event);
    });
  });

  describe("default case", () => {
    test("uses 'default' as the case when --case is omitted", () => {
      const event = {
        type: "assistant",
        message: { content: [{ type: "text", text: "hi" }] },
      };
      const { dir, file } = setupTrace([{ source: "agent", seq: 0, event }]);

      split({ mode: "run" }, [file]);

      assert.ok(
        fs.existsSync(path.join(dir, "trace--default--agent.agent.ndjson")),
      );
    });
  });

  describe("invalid agent names filtered", () => {
    test("sources not matching [a-z][a-z0-9-]* are skipped", () => {
      const validEvent = {
        type: "assistant",
        message: { content: [{ type: "text", text: "valid" }] },
      };
      const invalidEvent = {
        type: "assistant",
        message: { content: [{ type: "text", text: "invalid" }] },
      };

      const { dir, file } = setupTrace([
        { source: "facilitator", seq: 0, event: validEvent },
        { source: "valid-agent", seq: 1, event: validEvent },
        { source: "123-bad-name", seq: 2, event: invalidEvent },
        { source: "UPPER_CASE", seq: 3, event: invalidEvent },
        { source: "-starts-hyphen", seq: 4, event: invalidEvent },
      ]);

      split({ mode: "facilitate", case: "demo" }, [file]);

      assert.ok(
        fs.existsSync(path.join(dir, "trace--demo--valid-agent.agent.ndjson")),
      );
      assert.ok(
        !fs.existsSync(
          path.join(dir, "trace--demo--123-bad-name.agent.ndjson"),
        ),
      );
      assert.ok(
        !fs.existsSync(path.join(dir, "trace--demo--UPPER_CASE.agent.ndjson")),
      );
      assert.ok(
        !fs.existsSync(
          path.join(dir, "trace--demo---starts-hyphen.agent.ndjson"),
        ),
      );
    });
  });

  describe("resilience", () => {
    test("empty lines and parse errors are skipped gracefully", () => {
      const event = {
        type: "assistant",
        message: { content: [{ type: "text", text: "hello" }] },
      };

      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trace-split-"));
      const file = path.join(dir, "trace--demo.raw.ndjson");
      const content = [
        "",
        "   ",
        "not valid json {{{",
        JSON.stringify({ source: "agent", seq: 0, event }),
        "",
        "also bad",
        JSON.stringify({ source: "supervisor", seq: 1, event }),
      ].join("\n");
      fs.writeFileSync(file, content);

      split({ mode: "supervise", case: "demo" }, [file]);

      const agentLines = readNdjson(
        path.join(dir, "trace--demo--agent.agent.ndjson"),
      );
      assert.strictEqual(agentLines.length, 1);
      assert.deepStrictEqual(agentLines[0], event);

      const supervisorLines = readNdjson(
        path.join(dir, "trace--demo--supervisor.supervisor.ndjson"),
      );
      assert.strictEqual(supervisorLines.length, 1);
    });

    test("lines without envelope format are skipped", () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trace-split-"));
      const file = path.join(dir, "trace--demo.raw.ndjson");
      const content = [
        JSON.stringify({ type: "assistant", message: { content: [] } }),
        JSON.stringify({
          source: "agent",
          seq: 0,
          event: { type: "assistant", message: { content: [] } },
        }),
      ].join("\n");
      fs.writeFileSync(file, content);

      split({ mode: "supervise", case: "demo" }, [file]);

      const agentLines = readNdjson(
        path.join(dir, "trace--demo--agent.agent.ndjson"),
      );
      assert.strictEqual(agentLines.length, 1);
    });
  });

  describe("orchestrator events skipped", () => {
    test("source=orchestrator lines are excluded from output", () => {
      const agentEvent = {
        type: "assistant",
        message: { content: [{ type: "text", text: "work" }] },
      };
      const orchEvent = { type: "summary", success: true };

      const { dir, file } = setupTrace([
        { source: "agent", seq: 0, event: agentEvent },
        { source: "orchestrator", seq: 1, event: orchEvent },
        { source: "supervisor", seq: 2, event: agentEvent },
      ]);

      split({ mode: "supervise", case: "demo" }, [file]);

      assert.ok(
        !fs.existsSync(
          path.join(dir, "trace--demo--orchestrator.agent.ndjson"),
        ),
      );

      const agentLines = readNdjson(
        path.join(dir, "trace--demo--agent.agent.ndjson"),
      );
      assert.strictEqual(agentLines.length, 1);
    });
  });

  describe("output-dir option", () => {
    test("writes files to specified directory instead of input directory", () => {
      const { file } = setupTrace([
        {
          source: "agent",
          seq: 0,
          event: {
            type: "assistant",
            message: { content: [{ type: "text", text: "hi" }] },
          },
        },
        {
          source: "supervisor",
          seq: 1,
          event: {
            type: "assistant",
            message: { content: [{ type: "text", text: "ok" }] },
          },
        },
      ]);

      const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "trace-out-"));

      split({ mode: "supervise", case: "demo", "output-dir": outDir }, [file]);

      assert.ok(
        fs.existsSync(path.join(outDir, "trace--demo--agent.agent.ndjson")),
      );
      assert.ok(
        fs.existsSync(
          path.join(outDir, "trace--demo--supervisor.supervisor.ndjson"),
        ),
      );
    });

    test("creates output directory if it does not exist", () => {
      const { file } = setupTrace([
        {
          source: "agent",
          seq: 0,
          event: {
            type: "assistant",
            message: { content: [{ type: "text", text: "hi" }] },
          },
        },
      ]);

      const outDir = path.join(
        os.tmpdir(),
        `trace-nonexistent-${Date.now()}`,
        "nested",
      );

      split({ mode: "supervise", case: "demo", "output-dir": outDir }, [file]);

      assert.ok(
        fs.existsSync(path.join(outDir, "trace--demo--agent.agent.ndjson")),
      );
    });
  });

  describe("invalid mode", () => {
    test("rejects unknown --mode values", async () => {
      const { file } = setupTrace([
        {
          source: "agent",
          seq: 0,
          event: { type: "assistant", message: { content: [] } },
        },
      ]);

      const result = await split({ mode: "bogus", case: "demo" }, [file]);
      assert.strictEqual(result.ok, false);
      assert.match(result.error, /invalid --mode/);
    });
  });
});
