import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { runClaimCommand, runReleaseCommand } from "../src/commands/claim.js";
import { makeRuntime, ctxFor } from "./helpers.js";

const EMPTY_CLAIMS =
  "## Active Claims\n\n| agent | target | branch | pr | claimed_at | expires_at |\n| --- | --- | --- | --- | --- | --- |\n| *None* | — | — | — | — | — |\n";

describe("fit-wiki claim/release CLI (in-process)", () => {
  let dir;
  let wikiRoot;
  let memoryPath;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "claim-cli-"));
    wikiRoot = join(dir, "wiki");
    mkdirSync(wikiRoot, { recursive: true });
    memoryPath = join(wikiRoot, "MEMORY.md");
    writeFileSync(memoryPath, EMPTY_CLAIMS);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function ctx(options) {
    const harness = makeRuntime({ cwd: dir });
    return {
      harness,
      ctx: ctxFor({
        runtime: harness.runtime,
        options: { "wiki-root": wikiRoot, ...options },
      }),
    };
  }

  test("claim inserts a row", async () => {
    const { ctx: c } = ctx({
      agent: "staff-engineer",
      target: "spec-NNNN",
      branch: "feat/x",
      today: "2026-05-19",
    });
    const result = await runClaimCommand(c);
    assert.equal(result.ok, true);
    assert.match(
      readFileSync(memoryPath, "utf-8"),
      /staff-engineer \| spec-NNNN \| feat\/x/,
    );
  });

  test("claim refuses duplicates with exit 2", async () => {
    const first = ctx({
      agent: "staff-engineer",
      target: "spec-NNNN",
      branch: "feat/x",
    });
    await runClaimCommand(first.ctx);
    const second = ctx({
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
    await runClaimCommand(
      ctx({ agent: "staff-engineer", target: "spec-NNNN", branch: "feat/x" })
        .ctx,
    );
    await runReleaseCommand(
      ctx({ agent: "staff-engineer", target: "spec-NNNN" }).ctx,
    );
    assert.doesNotMatch(
      readFileSync(memoryPath, "utf-8"),
      /staff-engineer \| spec-NNNN/,
    );
  });

  test("release --expired clears expired rows", async () => {
    writeFileSync(
      memoryPath,
      "## Active Claims\n\n| agent | target | branch | pr | claimed_at | expires_at |\n| --- | --- | --- | --- | --- | --- |\n| staff-engineer | old | feat/o | — | 2026-04-01 | 2026-04-08 |\n| staff-engineer | new | feat/n | — | 2026-05-19 | 2026-05-26 |\n",
    );
    await runReleaseCommand(ctx({ expired: true, today: "2026-05-19" }).ctx);
    const text = readFileSync(memoryPath, "utf-8");
    assert.doesNotMatch(text, /\| old \|/);
    assert.match(text, /\| new \|/);
  });

  test("claim missing --agent returns a usage envelope", async () => {
    const result = await runClaimCommand(ctx({ target: "x", branch: "b" }).ctx);
    assert.deepEqual(result, {
      ok: false,
      code: 2,
      error: "claim requires --agent or LIBEVAL_AGENT_PROFILE",
    });
  });

  test("claim succeeds locally when the wiki push fails", async () => {
    const harness = makeRuntime({ cwd: dir });
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
          "wiki-root": wikiRoot,
          agent: "staff-engineer",
          target: "spec-NNNN",
          branch: "feat/x",
          today: "2099-01-01",
        },
      }),
    );
    assert.equal(result.ok, true);
    assert.match(
      readFileSync(memoryPath, "utf-8"),
      /staff-engineer \| spec-NNNN/,
    );
    assert.match(harness.stderr, /push failed.*network down/);
  });
});
