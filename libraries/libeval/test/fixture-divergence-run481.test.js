/**
 * Guards the run-481 divergence fixture.
 *
 * The fixture is a release-engineer agent lane from dispatch run
 * 27401632821 — the first wild trace where per-message accounting
 * cannot reach zero residual against the result event: per-message
 * sums exceed it by exactly +2 input / +68,799 cacheRead / +693
 * cacheCreation. Surfacing exactly this kind of divergence is part of
 * the stats contract, so this test pins the fixture's intrinsic
 * property — not any stats behavior — to catch accidental perturbation.
 *
 * The fixture is scrubbed to a skeleton: all message/tool content
 * stripped to structure; message ids, usage blocks, and the result
 * event kept byte-exact. A scrub that perturbs the figures has
 * destroyed the fixture's job.
 */

import { describe, test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const fixturePath = path.join(
  __dirname,
  "fixtures",
  "divergence-run481.ndjson",
);
const events = fs
  .readFileSync(fixturePath, "utf8")
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line));

describe("run-481 divergence fixture integrity", () => {
  test("28 unique message ids with byte-identical usage per duplicate set", () => {
    const usageById = new Map();
    for (const ev of events) {
      if (ev.type !== "assistant") continue;
      const { id } = ev.message;
      const usage = JSON.stringify(ev.message.usage);
      if (!usageById.has(id)) usageById.set(id, []);
      usageById.get(id).push(usage);
    }
    assert.strictEqual(usageById.size, 28);
    for (const [id, usages] of usageById) {
      assert.strictEqual(
        new Set(usages).size,
        1,
        `usage snapshots for ${id} must be byte-identical`,
      );
    }
  });

  test("per-message sums exceed the result event by exactly +2/+68799/+693", () => {
    const seen = new Set();
    const sums = { input: 0, cacheRead: 0, cacheCreation: 0 };
    for (const ev of events) {
      if (ev.type !== "assistant" || seen.has(ev.message.id)) continue;
      seen.add(ev.message.id);
      const u = ev.message.usage;
      sums.input += u.input_tokens;
      sums.cacheRead += u.cache_read_input_tokens;
      sums.cacheCreation += u.cache_creation_input_tokens;
    }

    const results = events.filter((ev) => ev.type === "result");
    assert.strictEqual(results.length, 1);
    const r = results[0].usage;
    assert.strictEqual(r.input_tokens, 7889);
    assert.strictEqual(r.output_tokens, 14917);
    assert.strictEqual(r.cache_read_input_tokens, 1235572);
    assert.strictEqual(r.cache_creation_input_tokens, 99994);
    assert.strictEqual(results[0].num_turns, 33);

    assert.strictEqual(sums.input - r.input_tokens, 2);
    assert.strictEqual(sums.cacheRead - r.cache_read_input_tokens, 68799);
    assert.strictEqual(sums.cacheCreation - r.cache_creation_input_tokens, 693);
  });

  test("fixture is a content-free skeleton", () => {
    const emptyByBlockType = {
      thinking: ["thinking", "signature"],
      text: ["text"],
      tool_result: ["content"],
    };
    const emptySystemKeys = [
      "output",
      "stdout",
      "stderr",
      "description",
      "summary",
    ];
    const nonResult = events.filter((ev) => ev.type !== "result");

    const blocks = nonResult.flatMap((ev) => ev.message?.content ?? []);
    for (const block of blocks) {
      const keys = emptyByBlockType[block.type] ?? [];
      for (const key of keys) assert.strictEqual(block[key], "");
      if (block.type === "tool_use") assert.deepStrictEqual(block.input, {});
    }

    const systemEvents = nonResult.filter((ev) => ev.type === "system");
    for (const ev of systemEvents) {
      const present = emptySystemKeys.filter((key) => key in ev);
      for (const key of present) assert.strictEqual(ev[key], "");
    }
  });
});
