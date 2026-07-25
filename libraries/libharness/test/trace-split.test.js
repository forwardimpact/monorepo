import { describe, test } from "node:test";
import assert from "node:assert";
import path from "node:path";

import { createMockFs } from "@forwardimpact/libmock";

import { splitTrace } from "../src/trace-split.js";
import { runSplitCommand } from "../src/commands/trace.js";

const DIR = "/traces";

/**
 * Seed combined NDJSON lines for `envelopes` in an in-memory fs and return the
 * fs plus the dir/file it lives in. `createMockFs` exposes both the sync and
 * async surfaces on one object, so the same mock backs `splitTrace`
 * (`runtime.fs` streams) and `runSplitCommand` (`runtime.fsSync` validation).
 * @param {object[]} envelopes - Array of envelope objects { source, seq, event }
 * @returns {{ fs: object, dir: string, file: string }}
 */
function setupTrace(envelopes) {
  const dir = DIR;
  const file = path.join(dir, "trace--demo.raw.ndjson");
  const content = envelopes.map((e) => JSON.stringify(e)).join("\n") + "\n";
  return { fs: createMockFs({ [file]: content }), dir, file };
}

/** Split `file` through the shared module with `fs` as the runtime surface. */
function split(fs, file, caseId = "demo", outputDir = DIR) {
  return splitTrace({ fs }, file, { caseId, outputDir });
}

/**
 * Invoke the split command handler with an InvocationContext-shaped object
 * backed by an in-memory fs (both surfaces).
 */
function splitCommand(values, [file], fs) {
  return runSplitCommand({
    options: values,
    args: { file },
    deps: { runtime: { fs, fsSync: fs } },
  });
}

/**
 * Read an NDJSON output file from the mock fs and return parsed lines.
 * @param {object} fs
 * @param {string} filePath
 * @returns {object[]}
 */
function readNdjson(fs, filePath) {
  return fs
    .readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

describe("splitTrace", () => {
  test("emits agent and supervisor files keyed by case and source", async () => {
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

    const paths = await split(fs, file);

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

    assert.deepStrictEqual(paths.sort(), [
      path.join(dir, "trace--demo--agent.agent.ndjson"),
      path.join(dir, "trace--demo--supervisor.supervisor.ndjson"),
    ]);
  });

  test("emits one file per profile-named agent and one for the facilitator", async () => {
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

    await split(fs, file);

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

    // No merged combined-agents file under the convention.
    assert.ok(
      !fs.existsSync(path.join(dir, "trace--demo--agent.agent.ndjson")),
    );
  });

  test("judge-source envelopes classify into the judge lane (spec criterion 2)", async () => {
    const judgeEvent = {
      type: "assistant",
      message: { content: [{ type: "text", text: "verdict" }] },
    };
    const { fs, dir, file } = setupTrace([
      { source: "agent", seq: 0, event: { type: "assistant" } },
      { source: "judge", seq: 1, event: judgeEvent },
    ]);

    await split(fs, file);

    const judgeLines = readNdjson(
      fs,
      path.join(dir, "trace--demo--judge.judge.ndjson"),
    );
    assert.strictEqual(judgeLines.length, 1);
    assert.deepStrictEqual(judgeLines[0], judgeEvent);
    // Never `judge.agent.ndjson` — one role rule for the judge participant.
    assert.ok(
      !fs.existsSync(path.join(dir, "trace--demo--judge.agent.ndjson")),
    );
  });

  test("sources not matching [a-z][a-z0-9-]* are skipped", async () => {
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

    await split(fs, file);

    assert.ok(
      fs.existsSync(path.join(dir, "trace--demo--valid-agent.agent.ndjson")),
    );
    assert.ok(
      !fs.existsSync(path.join(dir, "trace--demo--123-bad-name.agent.ndjson")),
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

  test("empty lines and parse errors are skipped gracefully", async () => {
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

    await split(fs, file);

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

  test("lines without envelope format are skipped", async () => {
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

    await split(fs, file);

    const agentLines = readNdjson(
      fs,
      path.join(dir, "trace--demo--agent.agent.ndjson"),
    );
    assert.strictEqual(agentLines.length, 1);
  });

  test("source=orchestrator lines are excluded from output", async () => {
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

    await split(fs, file);

    assert.ok(
      !fs.existsSync(path.join(dir, "trace--demo--orchestrator.agent.ndjson")),
    );

    const agentLines = readNdjson(
      fs,
      path.join(dir, "trace--demo--agent.agent.ndjson"),
    );
    assert.strictEqual(agentLines.length, 1);
  });

  test("writes files to the given output directory", async () => {
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
    await split(fs, file, "demo", outDir);

    assert.ok(
      fs.existsSync(path.join(outDir, "trace--demo--agent.agent.ndjson")),
    );
    assert.ok(
      fs.existsSync(
        path.join(outDir, "trace--demo--supervisor.supervisor.ndjson"),
      ),
    );
  });
});

describe("gemba-trace split command", () => {
  test("accepts run, supervise, facilitate, and discuss modes", async () => {
    for (const mode of ["run", "supervise", "facilitate", "discuss"]) {
      const { fs, dir, file } = setupTrace([
        {
          source: "agent",
          seq: 0,
          event: { type: "assistant", message: { content: [] } },
        },
      ]);
      const result = await splitCommand({ mode, case: "demo" }, [file], fs);
      assert.notStrictEqual(result?.ok, false, `mode ${mode}`);
      assert.ok(
        fs.existsSync(path.join(dir, "trace--demo--agent.agent.ndjson")),
        `mode ${mode}`,
      );
    }
  });

  test("uses 'default' as the case when --case is omitted", async () => {
    const event = {
      type: "assistant",
      message: { content: [{ type: "text", text: "hi" }] },
    };
    const { fs, dir, file } = setupTrace([{ source: "agent", seq: 0, event }]);

    await splitCommand({ mode: "run" }, [file], fs);

    assert.ok(
      fs.existsSync(path.join(dir, "trace--default--agent.agent.ndjson")),
    );
  });

  test("creates the output directory if it does not exist", async () => {
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
    await splitCommand(
      { mode: "supervise", case: "demo", "output-dir": outDir },
      [file],
      fs,
    );

    assert.ok(
      fs.existsSync(path.join(outDir, "trace--demo--agent.agent.ndjson")),
    );
  });

  test("rejects unknown --mode values", async () => {
    const { fs, file } = setupTrace([
      {
        source: "agent",
        seq: 0,
        event: { type: "assistant", message: { content: [] } },
      },
    ]);

    const result = await splitCommand(
      { mode: "bogus", case: "demo" },
      [file],
      fs,
    );
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /invalid --mode/);
  });

  test("requires --mode", async () => {
    const { fs, file } = setupTrace([
      {
        source: "agent",
        seq: 0,
        event: { type: "assistant", message: { content: [] } },
      },
    ]);

    const result = await splitCommand({ case: "demo" }, [file], fs);
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /--mode is required/);
  });
});
