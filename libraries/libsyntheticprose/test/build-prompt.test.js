/**
 * Spec 820 criterion #4 — `#buildPrompt` is a function of the
 * `ProseContext` entry alone.
 *
 * Two prose-context entries with identical fields (drivers, scenario,
 * role, topic, tone, length) but different cache keys must produce
 * byte-equal rendered prompts.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { ProseCache } from "../src/engine/cache.js";
import { ProseGenerator } from "../src/engine/generator.js";

function makeLogger() {
  return {
    info: () => {},
    debug: () => {},
    warn: () => {},
    error: () => {},
  };
}

/**
 * A prompt loader stub whose `render` echoes its template + locals
 * deterministically. The exact echo format does not matter — what
 * matters is that two identical (template, locals) calls produce
 * byte-equal outputs and two different ones do not.
 */
function makeEchoPromptLoader() {
  return {
    load: (name) => `system::${name}`,
    render: (template, locals) =>
      `${template}::${JSON.stringify(locals, Object.keys(locals).sort())}`,
  };
}

function makeFixture() {
  const tmpDir = mkdtempSync(join(tmpdir(), "prose-build-prompt-"));
  const cache = new ProseCache({
    cachePath: join(tmpDir, "cache.json"),
    logger: makeLogger(),
  });
  const generator = new ProseGenerator({
    cache,
    mode: "generate",
    promptLoader: makeEchoPromptLoader(),
    logger: makeLogger(),
    llmApi: {
      // The LLM is invoked through generatePlain — we capture the
      // rendered user prompt off the messages array via a spy.
      createCompletions: async ({ messages }) => {
        captured.push(messages.find((m) => m.role === "user").content);
        return { choices: [{ message: { content: "ok" } }] };
      },
    },
  });
  return { tmpDir, generator };
}

const captured = [];

describe("ProseGenerator #buildPrompt (criterion #4)", () => {
  test("identical contexts under different cache keys render byte-equal prompts", async () => {
    captured.length = 0;
    const { tmpDir, generator } = makeFixture();
    try {
      const ctx = {
        topic: "snapshot survey comment about deep work",
        tone: "authentic, first-person developer voice",
        length: "1-2 sentences",
        domain: "test.example",
        orgName: "TestCo",
        role: "L3 software_engineering on the Alpha Team",
        scenario: "Release Pressure",
        drivers: [
          { driver_id: "deep_work", trajectory: "declining", magnitude: -6 },
          {
            driver_id: "ease_of_release",
            trajectory: "declining",
            magnitude: -4,
          },
        ],
      };
      // Spread identical ctx into two distinct objects under different
      // cache keys to prove the rendered prompt does not depend on the
      // key — only on the context fields.
      await generator.generatePlain("snapshot_comment_a", { ...ctx });
      await generator.generatePlain("snapshot_comment_b", { ...ctx });

      assert.strictEqual(
        captured.length,
        2,
        "two prompts captured (one per call)",
      );
      assert.strictEqual(
        captured[0],
        captured[1],
        "identical ProseContext entries must produce byte-equal prompts",
      );
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  test("different drivers produce different prompts", async () => {
    captured.length = 0;
    const { tmpDir, generator } = makeFixture();
    try {
      const base = {
        topic: "snapshot survey comment",
        tone: "authentic",
        length: "1-2 sentences",
      };
      await generator.generatePlain("k1", {
        ...base,
        drivers: [
          { driver_id: "deep_work", trajectory: "declining", magnitude: -6 },
        ],
      });
      await generator.generatePlain("k2", {
        ...base,
        drivers: [
          {
            driver_id: "learning_culture",
            trajectory: "rising",
            magnitude: 5,
          },
        ],
      });
      assert.notStrictEqual(
        captured[0],
        captured[1],
        "different drivers must produce different prompts (sanity)",
      );
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });
});
