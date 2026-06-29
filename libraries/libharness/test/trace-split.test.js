import { describe, test } from "node:test";
import assert from "node:assert";
import path from "node:path";

import { createMockFs } from "@forwardimpact/libmock";

import { runSplitCommand } from "../src/commands/trace.js";

const DIR = "/traces";

/**
 * Invoke the split handler with an InvocationContext-shaped object backed by an
 * in-memory fs. `values` are the parsed flags; `file` is the positional;
 * `fsSync` is the seeded fs the command reads and writes through.
 */
function split(values, [file], fsSync) {
  return runSplitCommand({
    options: values,
    args: { file },
    deps: { runtime: { fsSync } },
  });
}

/**
 * Seed combined NDJSON lines for `envelopes` in an in-memory fs and return the
 * fs plus the dir/file it lives in. `runSplitCommand` reads the input and
 * writes the per-source split files back through the same fs.
 * @param {object[]} envelopes - Array of envelope objects { source, seq, event }
 * @returns {{ fs: object, dir: string, file: string }}
 */
function setupTrace(envelopes) {
  const dir = DIR;
  const file = path.join(dir, "trace--demo.raw.ndjson");
  const content = envelopes.map((e) => JSON.stringify(e)).join("\n") + "\n";
  return { fs: createMockFs({ [file]: content }), dir, file };
}

/**
 * Read an NDJSON output file from `fsSync` and return parsed lines.
 * @param {object} fsSync
 * @param {string} filePath
 * @returns {object[]}
 */
function readNdjson(fsSync, filePath) {
  return fsSync
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

      const { fs, dir, file } = setupTrace([
        { source: "agent", seq: 0, event: agentEvent },
        { source: "supervisor", seq: 1, event: supervisorEvent },
      ]);

      split({ mode: "supervise", case: "demo" }, [file], fs);

      const agentLines = readNdjson(
        fs,
        path.join(dir, "trace--demo--agent.agent.ndjson"),
      );
      assert.strictEqual(agentLines.length, 1);
      assert.deepStrictEqual(agentLines[0], agentEvent);

      const supervisorLines = readNdjson(
        fs,
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

      const { fs, dir, file } = setupTrace([
        { source: "facilitator", seq: 0, event: facEvent },
        { source: "staff-engineer", seq: 1, event: eng1Event },
        { source: "security-engineer", seq: 2, event: eng2Event },
      ]);

      split({ mode: "facilitate", case: "demo" }, [file], fs);

      const facLines = readNdjson(
        fs,
        path.join(dir, "trace--demo--facilitator.facilitator.ndjson"),
      );
      assert.strictEqual(facLines.length, 1);
      assert.deepStrictEqual(facLines[0], facEvent);

      const eng1Lines = readNdjson(
        fs,
        path.join(dir, "trace--demo--staff-engineer.agent.ndjson"),
      );
      assert.strictEqual(eng1Lines.length, 1);
      assert.deepStrictEqual(eng1Lines[0], eng1Event);

      const eng2Lines = readNdjson(
        fs,
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
      const { fs, dir, file } = setupTrace([
        { source: "agent", seq: 0, event },
      ]);

      split({ mode: "run", case: "demo" }, [file], fs);

      const agentLines = readNdjson(
        fs,
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
      const { fs, dir, file } = setupTrace([
        { source: "agent", seq: 0, event },
      ]);

      split({ mode: "run" }, [file], fs);

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

      const { fs, dir, file } = setupTrace([
        { source: "facilitator", seq: 0, event: validEvent },
        { source: "valid-agent", seq: 1, event: validEvent },
        { source: "123-bad-name", seq: 2, event: invalidEvent },
        { source: "UPPER_CASE", seq: 3, event: invalidEvent },
        { source: "-starts-hyphen", seq: 4, event: invalidEvent },
      ]);

      split({ mode: "facilitate", case: "demo" }, [file], fs);

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

      const dir = DIR;
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
      const fs = createMockFs({ [file]: content });

      split({ mode: "supervise", case: "demo" }, [file], fs);

      const agentLines = readNdjson(
        fs,
        path.join(dir, "trace--demo--agent.agent.ndjson"),
      );
      assert.strictEqual(agentLines.length, 1);
      assert.deepStrictEqual(agentLines[0], event);

      const supervisorLines = readNdjson(
        fs,
        path.join(dir, "trace--demo--supervisor.supervisor.ndjson"),
      );
      assert.strictEqual(supervisorLines.length, 1);
    });

    test("lines without envelope format are skipped", () => {
      const dir = DIR;
      const file = path.join(dir, "trace--demo.raw.ndjson");
      const content = [
        JSON.stringify({ type: "assistant", message: { content: [] } }),
        JSON.stringify({
          source: "agent",
          seq: 0,
          event: { type: "assistant", message: { content: [] } },
        }),
      ].join("\n");
      const fs = createMockFs({ [file]: content });

      split({ mode: "supervise", case: "demo" }, [file], fs);

      const agentLines = readNdjson(
        fs,
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

      const { fs, dir, file } = setupTrace([
        { source: "agent", seq: 0, event: agentEvent },
        { source: "orchestrator", seq: 1, event: orchEvent },
        { source: "supervisor", seq: 2, event: agentEvent },
      ]);

      split({ mode: "supervise", case: "demo" }, [file], fs);

      assert.ok(
        !fs.existsSync(
          path.join(dir, "trace--demo--orchestrator.agent.ndjson"),
        ),
      );

      const agentLines = readNdjson(
        fs,
        path.join(dir, "trace--demo--agent.agent.ndjson"),
      );
      assert.strictEqual(agentLines.length, 1);
    });
  });

  describe("output-dir option", () => {
    test("writes files to specified directory instead of input directory", () => {
      const { fs, file } = setupTrace([
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

      const outDir = "/trace-out";

      split(
        { mode: "supervise", case: "demo", "output-dir": outDir },
        [file],
        fs,
      );

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
      const { fs, file } = setupTrace([
        {
          source: "agent",
          seq: 0,
          event: {
            type: "assistant",
            message: { content: [{ type: "text", text: "hi" }] },
          },
        },
      ]);

      const outDir = path.join("/trace-nonexistent", "nested");

      split(
        { mode: "supervise", case: "demo", "output-dir": outDir },
        [file],
        fs,
      );

      assert.ok(
        fs.existsSync(path.join(outDir, "trace--demo--agent.agent.ndjson")),
      );
    });
  });

  describe("discuss mode", () => {
    test("is accepted and buckets by source like facilitate", () => {
      const event = {
        type: "assistant",
        message: { content: [{ type: "text", text: "hi" }] },
      };
      const { fs, dir, file } = setupTrace([
        { source: "facilitator", seq: 0, event },
        { source: "staff-engineer", seq: 1, event },
      ]);

      const result = split({ mode: "discuss", case: "demo" }, [file], fs);
      assert.notStrictEqual(result?.ok, false);
      assert.ok(
        fs.existsSync(
          path.join(dir, "trace--demo--facilitator.facilitator.ndjson"),
        ),
      );
      assert.ok(
        fs.existsSync(
          path.join(dir, "trace--demo--staff-engineer.agent.ndjson"),
        ),
      );
    });
  });

  describe("invalid mode", () => {
    test("rejects unknown --mode values", async () => {
      const { fs, file } = setupTrace([
        {
          source: "agent",
          seq: 0,
          event: { type: "assistant", message: { content: [] } },
        },
      ]);

      const result = await split({ mode: "bogus", case: "demo" }, [file], fs);
      assert.strictEqual(result.ok, false);
      assert.match(result.error, /invalid --mode/);
    });
  });
});
