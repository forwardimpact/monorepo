import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createMockFs } from "@forwardimpact/libmock";

import { runClaimCommand, runReleaseCommand } from "../src/commands/claim.js";
import { WikiPushFailure, PUSH_REASONS } from "../src/wiki-sync.js";
import { makeRuntime, ctxFor } from "./helpers.js";

const WIKI_ROOT = "/wiki";
const MEMORY_PATH = `${WIKI_ROOT}/MEMORY.md`;
const EMPTY_CLAIMS =
  "## Active Claims\n\n| agent | target | branch | pr | claimed_at | expires_at |\n| --- | --- | --- | --- | --- | --- |\n| *None* | — | — | — | — | — |\n";

describe("fit-wiki claim/release CLI (in-process)", () => {
  // One in-memory wiki shared across a test's commands so claim → release see
  // the same MEMORY.md; the command reads and rewrites it via runtime.fsSync.
  function makeWiki(memory = EMPTY_CLAIMS) {
    const fsSync = createMockFs({ [MEMORY_PATH]: memory });
    const make = (options) => {
      const harness = makeRuntime({ fsSync });
      return {
        harness,
        ctx: ctxFor({
          runtime: harness.runtime,
          options: { "wiki-root": WIKI_ROOT, ...options },
        }),
      };
    };
    return { fsSync, make };
  }

  test("claim inserts a row", async () => {
    const { fsSync, make } = makeWiki();
    const result = await runClaimCommand(
      make({
        agent: "staff-engineer",
        target: "spec-NNNN",
        branch: "feat/x",
        today: "2026-05-19",
      }).ctx,
    );
    assert.equal(result.ok, true);
    assert.match(
      fsSync.readFileSync(MEMORY_PATH, "utf-8"),
      /staff-engineer \| spec-NNNN \| feat\/x/,
    );
  });

  test("claim defaults expiry to claimed_at + 1 day", async () => {
    const { fsSync, make } = makeWiki();
    const result = await runClaimCommand(
      make({
        agent: "staff-engineer",
        target: "spec-NNNN",
        branch: "feat/x",
        today: "2026-05-19",
      }).ctx,
    );
    assert.equal(result.ok, true);
    assert.match(
      fsSync.readFileSync(MEMORY_PATH, "utf-8"),
      /\| 2026-05-19 \| 2026-05-20 \|/,
    );
  });

  test("claim refuses duplicates with exit 2", async () => {
    const { make } = makeWiki();
    await runClaimCommand(
      make({ agent: "staff-engineer", target: "spec-NNNN", branch: "feat/x" })
        .ctx,
    );
    const second = make({
      agent: "staff-engineer",
      target: "spec-NNNN",
      branch: "feat/y",
    });
    const result = await runClaimCommand(second.ctx);
    assert.equal(result.ok, false);
    assert.equal(result.code, 2);
    assert.match(second.harness.stderr, /claim already exists/);
  });

  test("release removes a row", async () => {
    const { fsSync, make } = makeWiki();
    await runClaimCommand(
      make({ agent: "staff-engineer", target: "spec-NNNN", branch: "feat/x" })
        .ctx,
    );
    await runReleaseCommand(
      make({ agent: "staff-engineer", target: "spec-NNNN" }).ctx,
    );
    assert.doesNotMatch(
      fsSync.readFileSync(MEMORY_PATH, "utf-8"),
      /staff-engineer \| spec-NNNN/,
    );
  });

  test("release --target without --agent fails closed", async () => {
    const { make } = makeWiki();
    const result = await runReleaseCommand(make({ target: "spec-NNNN" }).ctx);
    assert.equal(result.ok, false);
    assert.equal(result.code, 2);
    assert.match(result.error, /^release requires --agent <name>; e\.g\. /);
    assert.doesNotMatch(result.error, /LIBEVAL_AGENT_PROFILE/);
  });

  test("release --expired clears expired rows agent-less", async () => {
    const { fsSync, make } = makeWiki(
      "## Active Claims\n\n| agent | target | branch | pr | claimed_at | expires_at |\n| --- | --- | --- | --- | --- | --- |\n| staff-engineer | old | feat/o | — | 2026-04-01 | 2026-04-08 |\n| staff-engineer | new | feat/n | — | 2026-05-19 | 2026-05-26 |\n",
    );
    await runReleaseCommand(make({ expired: true, today: "2026-05-19" }).ctx);
    const text = fsSync.readFileSync(MEMORY_PATH, "utf-8");
    assert.doesNotMatch(text, /\| old \|/);
    assert.match(text, /\| new \|/);
  });

  test("claim missing --agent fails closed, naming the flag and an example", async () => {
    const { make } = makeWiki();
    const result = await runClaimCommand(
      make({ target: "x", branch: "b" }).ctx,
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, 2);
    assert.match(result.error, /^claim requires --agent <name>; e\.g\. /);
    assert.doesNotMatch(result.error, /LIBEVAL_AGENT_PROFILE/);
  });

  test("claim and release push with a MEMORY.md pathspec only", async () => {
    const fsSync = createMockFs({ [MEMORY_PATH]: EMPTY_CLAIMS });
    const pushes = [];
    const wikiSync = {
      async inheritIdentity() {},
      async commitAndPush(message, paths) {
        pushes.push({ message, paths });
        return { landed: true, reason: "landed" };
      },
    };
    const ctxWith = (options) =>
      ctxFor({
        runtime: makeRuntime({ fsSync }).runtime,
        wikiSync,
        options: { "wiki-root": WIKI_ROOT, ...options },
      });
    await runClaimCommand(
      ctxWith({
        agent: "staff-engineer",
        target: "spec-NNNN",
        branch: "feat/x",
        today: "2099-01-01",
      }),
    );
    await runReleaseCommand(
      ctxWith({ agent: "staff-engineer", target: "spec-NNNN" }),
    );
    await runReleaseCommand(ctxWith({ expired: true, today: "2099-01-01" }));
    assert.equal(pushes.length, 3);
    for (const push of pushes) {
      assert.deepEqual(push.paths, ["MEMORY.md"]);
    }
  });

  test("claim and release fail closed when the gate detects a secret", async () => {
    const fsSync = createMockFs({ [MEMORY_PATH]: EMPTY_CLAIMS });
    const wikiSync = {
      async inheritIdentity() {},
      async commitAndPush() {
        return {
          pushed: false,
          reason: "secret-detected",
          findings: [{ file: "MEMORY.md", line: 7, rule: "github-pat" }],
        };
      },
    };
    const runClaim = (options) => {
      const harness = makeRuntime({ fsSync });
      return {
        harness,
        promise: runClaimCommand(
          ctxFor({
            runtime: harness.runtime,
            wikiSync,
            options: { "wiki-root": WIKI_ROOT, ...options },
          }),
        ),
      };
    };
    const claim = runClaim({
      agent: "staff-engineer",
      target: "spec-NNNN",
      branch: "feat/x",
      today: "2099-01-01",
    });
    const claimResult = await claim.promise;
    assert.deepEqual(claimResult, { ok: false, code: 1 });
    assert.match(claim.harness.stderr, /secret detected/);
    assert.match(claim.harness.stderr, /MEMORY\.md:7:github-pat/);
    assert.doesNotMatch(claim.harness.stdout, /pushed|saved locally/);

    // The local MEMORY.md edit still landed (claim row written) — the block is
    // on the push, not the local write.
    const releaseHarness = makeRuntime({ fsSync });
    const releaseResult = await runReleaseCommand(
      ctxFor({
        runtime: releaseHarness.runtime,
        wikiSync,
        options: {
          "wiki-root": WIKI_ROOT,
          agent: "staff-engineer",
          target: "spec-NNNN",
        },
      }),
    );
    assert.deepEqual(releaseResult, { ok: false, code: 1 });
    assert.match(releaseHarness.stderr, /secret detected/);
  });

  test("claim fails closed when the scanner is unavailable", async () => {
    const fsSync = createMockFs({ [MEMORY_PATH]: EMPTY_CLAIMS });
    const harness = makeRuntime({ fsSync });
    const wikiSync = {
      async inheritIdentity() {},
      async commitAndPush() {
        return { pushed: false, reason: "scanner-unavailable" };
      },
    };
    const result = await runClaimCommand(
      ctxFor({
        runtime: harness.runtime,
        wikiSync,
        options: {
          "wiki-root": WIKI_ROOT,
          agent: "staff-engineer",
          target: "spec-NNNN",
          branch: "feat/x",
          today: "2099-01-01",
        },
      }),
    );
    assert.deepEqual(result, { ok: false, code: 1 });
    assert.match(harness.stderr, /scanner.*unavailable|gitleaks/i);
    assert.match(harness.stderr, /FIT_WIKI_SCANNER_ABSENT_OK/);
  });

  test("claim succeeds locally when the wiki push fails", async () => {
    const fsSync = createMockFs({ [MEMORY_PATH]: EMPTY_CLAIMS });
    const harness = makeRuntime({ fsSync });
    const wikiSync = {
      async inheritIdentity() {},
      async commitAndPush() {
        throw new Error("network down");
      },
    };
    const result = await runClaimCommand(
      ctxFor({
        runtime: harness.runtime,
        wikiSync,
        options: {
          "wiki-root": WIKI_ROOT,
          agent: "staff-engineer",
          target: "spec-NNNN",
          branch: "feat/x",
          today: "2099-01-01",
        },
      }),
    );
    assert.equal(result.ok, true);
    assert.match(
      fsSync.readFileSync(MEMORY_PATH, "utf-8"),
      /staff-engineer \| spec-NNNN/,
    );
    assert.match(harness.stderr, /push failed.*network down/);
  });

  test("claim keeps zero exit + saved-locally warning on a rejected push (D1)", async () => {
    const fsSync = createMockFs({ [MEMORY_PATH]: EMPTY_CLAIMS });
    const harness = makeRuntime({ fsSync });
    const wikiSync = {
      async inheritIdentity() {},
      async commitAndPush() {
        throw new WikiPushFailure(
          PUSH_REASONS.REJECTED,
          "fit-wiki: push rejected — the remote advanced.",
        );
      },
    };
    const result = await runClaimCommand(
      ctxFor({
        runtime: harness.runtime,
        wikiSync,
        options: {
          "wiki-root": WIKI_ROOT,
          agent: "staff-engineer",
          target: "spec-RRRR",
          branch: "feat/x",
          today: "2099-01-01",
        },
      }),
    );
    assert.equal(
      result.ok,
      true,
      "rejected push keeps zero exit (landed locally)",
    );
    assert.match(harness.stderr, /saved locally/i);
    assert.match(harness.stderr, /rejected/);
    assert.doesNotMatch(harness.stdout, /committed and pushed/);
  });

  test("claim exits non-zero on a conservation refusal (unsafe-state, D5)", async () => {
    const fsSync = createMockFs({ [MEMORY_PATH]: EMPTY_CLAIMS });
    const harness = makeRuntime({ fsSync });
    const wikiSync = {
      async inheritIdentity() {},
      async commitAndPush() {
        throw new WikiPushFailure(
          PUSH_REASONS.CONSERVATION,
          "fit-wiki: refusing to push — it would drop another writer's content.",
        );
      },
    };
    const result = await runClaimCommand(
      ctxFor({
        runtime: harness.runtime,
        wikiSync,
        options: {
          "wiki-root": WIKI_ROOT,
          agent: "staff-engineer",
          target: "spec-CCCC",
          branch: "feat/x",
          today: "2099-01-01",
        },
      }),
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.match(harness.stderr, /drop another writer/);
  });
});
