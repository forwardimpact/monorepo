/**
 * Spec 820 — `ProseActivity` contract tests.
 *
 * Asserts the contract's behavior against the success criteria in
 * `specs/820-synthetic-pipeline-activity-interface/spec.md`:
 * #1 single source of truth · #2 no per-output names at the call sites
 * · #3 multi-driver context for snapshot comments · #5 per-output unit
 * coverage including multi-driver-declining input.
 */
import { describe, test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tokenize } from "../src/dsl/tokenizer.js";
import { parse } from "../src/dsl/parser.js";
import { createSeededRNG } from "../src/engine/rng.js";
import { buildEntities } from "../src/engine/entities.js";
import { generateActivity } from "../src/engine/activity.js";
import { collectProseKeys } from "../src/engine/prose-keys.js";
import { PROSE_ACTIVITIES } from "../src/activity/index.js";
import { commentActivity } from "../src/activity/comment.js";
import { webhookActivity } from "../src/activity/webhook.js";
import { MINI_TERRAIN } from "./fixtures/mini-terrain.fixture.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadFromDsl() {
  const ast = parse(tokenize(MINI_TERRAIN));
  const rng = createSeededRNG(ast.seed);
  const built = buildEntities(ast, rng);
  const entities = { ...built, content: [], domain: "test.example" };
  entities.activity = generateActivity(ast, rng, built.people, built.teams);
  return { ast, entities, rng };
}

describe("PROSE_ACTIVITIES registration (criterion #1)", () => {
  test("registration is the single source of truth", () => {
    assert.deepStrictEqual(PROSE_ACTIVITIES.map((p) => p.id).sort(), [
      "comment",
      "webhook",
    ]);
  });

  test("each registration entry exposes generate, proseKeys, render", () => {
    for (const pa of PROSE_ACTIVITIES) {
      assert.strictEqual(typeof pa.id, "string", `${pa.id}: id is string`);
      assert.strictEqual(
        typeof pa.generate,
        "function",
        `${pa.id}: generate is function`,
      );
      assert.strictEqual(
        typeof pa.proseKeys,
        "function",
        `${pa.id}: proseKeys is function`,
      );
      assert.strictEqual(
        typeof pa.render,
        "function",
        `${pa.id}: render is function`,
      );
    }
  });
});

describe("call sites do not name prose-bearing outputs (criterion #2)", () => {
  // Static-source check: the three pipeline call sites must not name the
  // in-scope prose-bearing output identifiers in their own bodies.
  // Identifiers and per-output helper names appear only inside the
  // PROSE_ACTIVITIES registration in libsyntheticgen/src/activity/.
  const PER_OUTPUT_NAMES =
    /\b(commentKeys|webhookKeys|addSnapshotCommentKeys|addWebhookProseKeys)\b/;

  test("engine/activity.js does not name per-output identifiers", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../src/engine/activity.js"),
      "utf8",
    );
    assert.ok(
      !PER_OUTPUT_NAMES.test(src),
      "engine/activity.js must not reference per-output names",
    );
  });

  test("engine/prose-keys.js does not name per-output identifiers", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../src/engine/prose-keys.js"),
      "utf8",
    );
    assert.ok(
      !PER_OUTPUT_NAMES.test(src),
      "engine/prose-keys.js must not reference per-output names",
    );
  });

  test("render/raw.js does not name per-output identifiers", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../libsyntheticrender/src/render/raw.js"),
      "utf8",
    );
    assert.ok(
      !PER_OUTPUT_NAMES.test(src),
      "libsyntheticrender/src/render/raw.js must not reference per-output names",
    );
    assert.ok(
      !/renderGetDXComments|renderGitHubWebhooks|injectWebhookProse/.test(src),
      "deleted helper names must not reappear",
    );
  });
});

describe("comment proseKeys carries multi-driver array (criterion #3)", () => {
  test("alpha team comment-keys expose drivers array of length 2", () => {
    const { entities } = loadFromDsl();
    const alphaComments = entities.activity.comment.keys.filter(
      (ck) => ck.team_id === "alpha",
    );
    assert.ok(
      alphaComments.length > 0,
      "MINI_TERRAIN must produce at least one alpha-team comment-key",
    );

    // Build a map from prose-key → context for the entire comment
    // output, then look up the context for each alpha-team key directly.
    const tuples = new Map(
      commentActivity.proseKeys(entities.activity.comment, {
        domain: entities.domain,
        orgName: "BioNova",
      }),
    );

    let asserted = 0;
    for (const ck of alphaComments) {
      const proseKey = `snapshot_comment_${ck.snapshot_id}_${ck.email.replace(/[@.]/g, "_")}`;
      const ctx = tuples.get(proseKey);
      assert.ok(ctx, `prose-context entry for ${proseKey} exists`);
      assert.ok(Array.isArray(ctx.drivers), "ProseContext.drivers is an array");
      assert.strictEqual(
        ctx.drivers.length,
        2,
        "alpha team has two declining drivers — context must carry both",
      );
      const ids = ctx.drivers.map((d) => d.driver_id).sort();
      assert.deepStrictEqual(
        ids,
        ["deep_work", "ease_of_release"].sort(),
        "both declining driver_ids present",
      );
      // Magnitudes preserved (sorted by |magnitude| descending in generate).
      assert.strictEqual(ctx.drivers[0].driver_id, "deep_work");
      assert.strictEqual(ctx.drivers[0].magnitude, -6);
      assert.strictEqual(ctx.drivers[1].driver_id, "ease_of_release");
      assert.strictEqual(ctx.drivers[1].magnitude, -4);
      asserted++;
    }
    assert.ok(
      asserted > 0,
      "at least one alpha-team comment must have been asserted",
    );
  });

  test("collectProseKeys snapshot-comment entries carry full drivers array", () => {
    const { entities } = loadFromDsl();
    const allKeys = collectProseKeys(entities);
    const commentEntries = Array.from(allKeys.entries()).filter(([k]) =>
      k.startsWith("snapshot_comment_"),
    );
    assert.ok(commentEntries.length > 0, "snapshot-comment entries exist");
    for (const [, ctx] of commentEntries) {
      assert.ok(Array.isArray(ctx.drivers));
      assert.ok(ctx.drivers.length >= 1);
    }
  });
});

describe("commentActivity per-output coverage (criterion #5)", () => {
  test("snapshot-comment generation under multi-driver-declining input", () => {
    const { entities } = loadFromDsl();
    const output = entities.activity.comment;
    assert.ok(output.keys.length > 0, "comment-keys non-empty");
    for (const ck of output.keys) {
      assert.ok(
        Array.isArray(ck.drivers) && ck.drivers.length >= 1,
        "every comment-key carries a non-empty drivers array",
      );
      assert.ok(ck.driver_name, "render-time driver_name preserved");
      assert.ok(ck.topic_driver_id, "topic_driver_id preserved");
      assert.ok(ck.topic_trajectory, "topic_trajectory preserved");
    }
  });
});

describe("webhookActivity contract (criteria #1, #5)", () => {
  test("webhookActivity.generate returns { events, keys }", () => {
    const { ast, entities, rng } = loadFromDsl();
    const output = webhookActivity.generate({
      ast,
      rng,
      entities: { people: entities.people, teams: entities.teams },
    });
    assert.ok(Array.isArray(output.events), "events is array");
    assert.ok(Array.isArray(output.keys), "keys is array");
    assert.ok(output.events.length > 0, "events non-empty");
    for (const ev of output.events) {
      assert.ok(ev.delivery_id, "every event has delivery_id");
      assert.ok(ev.event_type, "every event has event_type");
    }
  });

  test("webhook proseKeys yields PR + review entries with drivers", () => {
    const { entities } = loadFromDsl();
    const output = entities.activity.webhook;
    const tuples = Array.from(
      webhookActivity.proseKeys(output, {
        domain: entities.domain,
        orgName: "BioNova",
      }),
    );
    const prs = tuples.filter(([k]) => k.startsWith("pr_body_"));
    const reviews = tuples.filter(([k]) => k.startsWith("review_body_"));
    assert.ok(prs.length > 0, "at least one pr_body entry");
    assert.ok(reviews.length > 0, "at least one review_body entry");
    for (const [, ctx] of [...prs, ...reviews]) {
      assert.ok(
        Array.isArray(ctx.drivers) && ctx.drivers.length > 0,
        "every webhook prose-context entry carries drivers",
      );
    }
  });
});
