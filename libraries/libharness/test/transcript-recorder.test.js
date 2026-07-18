import { describe, test } from "node:test";
import assert from "node:assert";

import { createTranscriptRecorder } from "../src/transcript-recorder.js";
import { createNoopRedactor } from "../src/redaction.js";

/** Redactor stub replacing a fixed needle in every string it walks. */
const needleRedactor = (needle, placeholder) => ({
  redactValue: (value) =>
    typeof value === "string" ? value.split(needle).join(placeholder) : value,
});

describe("createTranscriptRecorder", () => {
  test("throws on missing redactor", () => {
    assert.throws(() => createTranscriptRecorder({}), /redactor is required/);
  });

  test("seeds a preset system prompt with a preset note", () => {
    const recorder = createTranscriptRecorder({
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
        append: "You are a test agent.",
      },
      redactor: createNoopRedactor(),
    });
    const rendered = recorder.render();
    assert.match(rendered, /<caller_system_prompt>/);
    assert.match(rendered, /\(claude_code preset\)\nYou are a test agent\./);
  });

  test("seeds a plain-string system prompt verbatim", () => {
    const recorder = createTranscriptRecorder({
      systemPrompt: "Plain persona.",
      redactor: createNoopRedactor(),
    });
    assert.match(
      recorder.render(),
      /<caller_system_prompt>\nPlain persona\.\n<\/caller_system_prompt>/,
    );
  });

  test("accepts an absent system prompt and omits its section", () => {
    const recorder = createTranscriptRecorder({
      redactor: createNoopRedactor(),
    });
    recorder.recordPrompt("A task");
    assert.ok(!recorder.render().includes("<caller_system_prompt>"));
  });

  test("redacts the seeded system prompt and delivered prompts", () => {
    const recorder = createTranscriptRecorder({
      systemPrompt: "Persona with hunter2 inside.",
      redactor: needleRedactor("hunter2", "[REDACTED]"),
    });
    recorder.recordPrompt("Prompt with hunter2 too.");
    const rendered = recorder.render();
    assert.ok(!rendered.includes("hunter2"));
    assert.match(rendered, /Persona with \[REDACTED\] inside\./);
    assert.match(rendered, /Prompt with \[REDACTED\] too\./);
  });

  test("message lines pass through unredacted by the recorder", () => {
    const recorder = createTranscriptRecorder({
      redactor: needleRedactor("hunter2", "[REDACTED]"),
    });
    recorder.recordMessage('{"type":"assistant","text":"hunter2"}');
    assert.match(recorder.render(), /"hunter2"/);
  });

  test("render() contains all three sections in order", () => {
    const recorder = createTranscriptRecorder({
      systemPrompt: "Persona.",
      redactor: createNoopRedactor(),
    });
    recorder.recordPrompt("First prompt");
    recorder.recordPrompt("Second prompt");
    recorder.recordMessage('{"type":"assistant"}');
    recorder.recordMessage('{"type":"result"}');

    const rendered = recorder.render();
    const sys = rendered.indexOf("<caller_system_prompt>");
    const prompts = rendered.indexOf("<caller_prompts>");
    const transcript = rendered.indexOf("<caller_transcript>");
    assert.ok(sys !== -1 && prompts !== -1 && transcript !== -1);
    assert.ok(sys < prompts && prompts < transcript);
    assert.match(rendered, /First prompt\n\nSecond prompt/);
    assert.match(rendered, /\{"type":"assistant"\}\n\{"type":"result"\}/);
  });

  test("a second render() after more messages reflects the fuller record", () => {
    const recorder = createTranscriptRecorder({
      redactor: createNoopRedactor(),
    });
    recorder.recordMessage('{"seq":1}');
    const first = recorder.render();
    recorder.recordMessage('{"seq":2}');
    const second = recorder.render();
    assert.ok(!first.includes('{"seq":2}'));
    assert.ok(second.includes('{"seq":1}'));
    assert.ok(second.includes('{"seq":2}'));
  });
});
