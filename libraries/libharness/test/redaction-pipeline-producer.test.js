import { describe, test } from "node:test";
import assert from "node:assert";
import { Writable } from "node:stream";

import { AgentRunner } from "@forwardimpact/libharness";
import { createRedactor } from "../src/redaction.js";
import { TraceCollector } from "../src/trace-collector.js";
import { createTeeWriter } from "../src/tee-writer.js";
import {
  rt as _rt,
  captureSink,
  ANTH_SENT,
  GH_SENT,
  GITHUB_SENT,
} from "./redaction-pipeline-helpers.js";

describe("Producer pipeline — sentinel sweep (criterion 1)", () => {
  test("sentinels in every carrier shape are redacted before reaching fileStream", async () => {
    const SESSION_PAYLOAD = `boot ${GITHUB_SENT}`;
    const sink = captureSink();

    const redactor = createRedactor({
      runtime: _rt,
      env: {
        ANTHROPIC_API_KEY: ANTH_SENT,
        GH_TOKEN: GH_SENT,
        GITHUB_TOKEN: GITHUB_SENT,
      },
    });

    // Real AgentRunner driven by a scripted async-generator query that
    // yields messages with the sentinels embedded in each carrier shape.
    const scripted = [
      {
        type: "system",
        subtype: "init",
        session_id: "sess-1",
        boot_payload: SESSION_PAYLOAD,
      },
      {
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              id: "tu_1",
              name: "Bash",
              input: { command: `echo ${ANTH_SENT}`, description: "leak" },
            },
          ],
        },
      },
      {
        type: "user",
        message: {
          content: [
            {
              type: "tool_result",
              tool_use_id: "tu_1",
              content: `stdout: ${GH_SENT}\nstderr:`,
            },
          ],
        },
      },
      {
        type: "user",
        message: {
          content: [
            {
              type: "tool_result",
              tool_use_id: "tu_2",
              content: JSON.stringify({ stdout: `embed ${ANTH_SENT}` }),
            },
          ],
        },
      },
      {
        type: "assistant",
        message: {
          content: [{ type: "text", text: `assistant leaked ${GH_SENT}` }],
        },
      },
      { type: "result", subtype: "success", result: `final ${GITHUB_SENT}` },
    ];

    const runner = new AgentRunner({
      cwd: "/tmp",
      query: async function* () {
        for (const m of scripted) yield m;
      },
      output: sink.stream,
      redactor,
    });

    await runner.run("Task");

    const out = sink.text;
    assert.ok(!out.includes(ANTH_SENT), "ANTH sentinel leaked to fileStream");
    assert.ok(!out.includes(GH_SENT), "GH sentinel leaked to fileStream");
    assert.ok(
      !out.includes(GITHUB_SENT),
      "GITHUB sentinel leaked to fileStream",
    );
    assert.ok(out.includes("[REDACTED:env:ANTHROPIC_API_KEY]"));
    assert.ok(out.includes("[REDACTED:env:GH_TOKEN]"));
    assert.ok(out.includes("[REDACTED:env:GITHUB_TOKEN]"));
  });
});

describe("Producer pipeline — patterns (criterion 2)", () => {
  test("pattern hits redact when no env vars are configured", async () => {
    const sink = captureSink();
    const redactor = createRedactor({ runtime: _rt, env: {} });

    const anth = "sk-ant-" + "a".repeat(95);
    const ghp = "ghp_" + "A".repeat(36);
    const ghs = "ghs_" + "B".repeat(36);
    const gho = "gho_" + "C".repeat(36);
    const ghfg = "github_pat_" + "x".repeat(82);

    const scripted = [
      {
        type: "assistant",
        message: {
          content: [
            { type: "text", text: `anth=${anth}` },
            { type: "text", text: `ghp=${ghp}` },
            { type: "text", text: `ghs=${ghs}` },
            { type: "text", text: `gho=${gho}` },
            { type: "text", text: `ghfg=${ghfg}` },
          ],
        },
      },
      { type: "result", subtype: "success", result: "ok" },
    ];

    const runner = new AgentRunner({
      cwd: "/tmp",
      query: async function* () {
        for (const m of scripted) yield m;
      },
      output: sink.stream,
      redactor,
    });
    await runner.run("task");

    const out = sink.text;
    for (const secret of [anth, ghp, ghs, gho, ghfg]) {
      assert.ok(
        !out.includes(secret),
        `pattern secret leaked: ${secret.slice(0, 12)}…`,
      );
    }
    assert.ok(out.includes("[REDACTED:pattern:anthropic]"));
    assert.ok(out.includes("[REDACTED:pattern:gh-pat]"));
    assert.ok(out.includes("[REDACTED:pattern:gh-installation]"));
    assert.ok(out.includes("[REDACTED:pattern:gh-oauth]"));
    assert.ok(out.includes("[REDACTED:pattern:gh-fine-grained]"));
  });
});

describe("Producer pipeline — opt-out warning (criterion 4)", () => {
  test("LIBHARNESS_REDACTION_DISABLED=1 emits stderr warning; sentinels reach fileStream unredacted", async () => {
    const sink = captureSink();

    // Construct the redactor under test. Capture stderr from this site
    // only — avoid mutating process.env (other tests run in parallel).
    let redactor;
    let stderrCaptured;
    stderrCaptured = "";
    const orig = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk) => {
      stderrCaptured += String(chunk);
      return true;
    };
    try {
      redactor = createRedactor({
        runtime: _rt,
        env: {
          LIBHARNESS_REDACTION_DISABLED: "1",
          ANTHROPIC_API_KEY: ANTH_SENT,
        },
      });
    } finally {
      process.stderr.write = orig;
    }

    assert.match(stderrCaptured, /libharness: trace redaction DISABLED/);
    assert.strictEqual(
      (stderrCaptured.match(/redaction DISABLED/g) ?? []).length,
      1,
      "warning must fire exactly once per construction",
    );

    const scripted = [
      {
        type: "assistant",
        message: {
          content: [{ type: "text", text: `leak ${ANTH_SENT}` }],
        },
      },
      { type: "result", subtype: "success", result: "ok" },
    ];

    const runner = new AgentRunner({
      cwd: "/tmp",
      query: async function* () {
        for (const m of scripted) yield m;
      },
      output: sink.stream,
      redactor,
    });
    await runner.run("task");

    // Opt-out: sentinel reaches fileStream unredacted.
    assert.ok(sink.text.includes(ANTH_SENT));
    assert.ok(!sink.text.includes("[REDACTED:env:ANTHROPIC_API_KEY]"));
  });
});

describe("Producer pipeline — toText() byte-for-byte placeholder fidelity (criterion 5)", () => {
  test("captured NDJSON replays placeholders identically through TraceCollector.toText()", async () => {
    const sink = captureSink();
    const redactor = createRedactor({
      runtime: _rt,
      env: { ANTHROPIC_API_KEY: ANTH_SENT, GH_TOKEN: GH_SENT },
    });

    const anth = "sk-ant-" + "a".repeat(85);

    const scripted = [
      { type: "system", subtype: "init", session_id: "sess-fid" },
      {
        type: "assistant",
        message: {
          content: [
            { type: "text", text: `the env value is ${ANTH_SENT}` },
            { type: "text", text: `pattern hit ${anth}` },
            { type: "text", text: `gh ${GH_SENT}` },
          ],
        },
      },
      { type: "result", subtype: "success", result: "done" },
    ];

    const runner = new AgentRunner({
      cwd: "/tmp",
      query: async function* () {
        for (const m of scripted) yield m;
      },
      output: sink.stream,
      redactor,
    });
    await runner.run("task");

    const ndjsonText = sink.text;
    const collector = new TraceCollector();
    for (const line of ndjsonText.split("\n")) {
      if (line.trim()) collector.addLine(line);
    }
    const replayed = collector.toText();

    // Both placeholder forms must appear in the rendered output identically.
    assert.ok(
      replayed.includes("[REDACTED:env:ANTHROPIC_API_KEY]"),
      "env placeholder missing from replay",
    );
    assert.ok(
      replayed.includes("[REDACTED:env:GH_TOKEN]"),
      "env placeholder missing from replay",
    );
    assert.ok(
      replayed.includes("[REDACTED:pattern:anthropic]"),
      "pattern placeholder missing from replay",
    );
    // And no sentinel survives the replay.
    assert.ok(!replayed.includes(ANTH_SENT));
    assert.ok(!replayed.includes(GH_SENT));
    assert.ok(!replayed.includes(anth));
  });

  test("TeeWriter file path delivers redacted bytes to fileStream", async () => {
    const fileSink = captureSink();
    const textSink = captureSink();
    const tee = createTeeWriter({
      fileStream: fileSink.stream,
      textStream: textSink.stream,
      mode: "raw",
    });

    const redactor = createRedactor({
      runtime: _rt,
      env: { GH_TOKEN: GH_SENT },
    });

    const scripted = [
      {
        type: "assistant",
        message: {
          content: [{ type: "text", text: `gh ${GH_SENT}` }],
        },
      },
      { type: "result", subtype: "success", result: "ok" },
    ];

    // Drive a small command-style pipeline: a real runner emits to devNull,
    // and an envelope-redacting onLine writes the tagged event to the tee.
    const devNull = new Writable({
      write(_c, _e, cb) {
        cb();
      },
    });
    const runner = new AgentRunner({
      cwd: "/tmp",
      query: async function* () {
        for (const m of scripted) yield m;
      },
      output: devNull,
      redactor,
      onLine: (line) => {
        const event = JSON.parse(line);
        const tagged = { source: "agent", seq: 0, event };
        tee.write(JSON.stringify(redactor.redactValue(tagged)) + "\n");
      },
    });
    await runner.run("task");
    await new Promise((r) => tee.end(r));

    assert.ok(!fileSink.text.includes(GH_SENT));
    assert.ok(fileSink.text.includes("[REDACTED:env:GH_TOKEN]"));
  });
});
