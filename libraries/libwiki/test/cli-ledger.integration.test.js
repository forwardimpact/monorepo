import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GitClient } from "@forwardimpact/libutil/git-client";
import { createMockGhClient } from "@forwardimpact/libmock";
import { runLedgerCommand } from "../src/commands/ledger.js";
import { parseOwnerRepo } from "../src/commands/ledger.js";
import { renderAnchorBody } from "../src/ledger/anchor.js";
import {
  git,
  createBareRepo,
  seedBareRepo,
  cloneRepo,
  makeRuntime,
} from "./helpers.js";

function comment(id, anchor) {
  return { id, created_at: "x", body: renderAnchorBody(anchor) };
}

describe("ledger command (real git remote, mock gh)", () => {
  let bare;
  let wikiDir;
  let parent;

  beforeEach(() => {
    bare = createBareRepo();
    seedBareRepo(bare);
    const cloned = cloneRepo(bare, "ledger");
    wikiDir = cloned.wikiDir;
    parent = cloned.parent;
    git(wikiDir, "checkout", "master");
    // Point origin at a github-shaped URL so slug resolution has something to parse.
    git(
      wikiDir,
      "remote",
      "set-url",
      "origin",
      "https://github.com/forwardimpact/monorepo.wiki.git",
    );
  });

  function ctxFor({ gh, options = {}, args = {} }) {
    const harness = makeRuntime({ cwd: parent });
    const ctx = {
      deps: {
        runtime: harness.runtime,
        gitClient: new GitClient({ runtime: harness.runtime }),
        ghClient: gh,
      },
      options: { "wiki-root": wikiDir, ...options },
      args,
    };
    return { harness, ctx };
  }

  test("parseOwnerRepo handles https .wiki and ssh forms", () => {
    assert.deepEqual(
      parseOwnerRepo("https://github.com/forwardimpact/monorepo.wiki.git"),
      { owner: "forwardimpact", repo: "monorepo" },
    );
    assert.deepEqual(parseOwnerRepo("git@github.com:o/r.git"), {
      owner: "o",
      repo: "r",
    });
  });

  test("allocate posts exactly one anchor and writes no projection", async () => {
    const gh = createMockGhClient({
      responses: {
        apiGetPaginated: [
          comment(100, { kind: "occ", ids: ["#96"], event: "old" }),
        ],
      },
    });
    const { harness, ctx } = ctxFor({
      gh,
      args: { subcommand: "allocate" },
      options: { kind: "occ", count: "2", event: "deadbeef" },
    });
    const result = await runLedgerCommand(ctx);
    assert.equal(result.ok, true);
    // Next free after #96 is #97, #98.
    assert.match(harness.stdout, /#97 #98/);
    const posts = gh.calls.filter((c) => c.method === "apiPost");
    assert.equal(posts.length, 1);
    assert.equal(
      posts[0].args[0],
      "repos/forwardimpact/monorepo/issues/1564/comments",
    );
    // No ledger page was written at allocation time — the anchor post is the
    // only side effect; projections derive from the published sequence later.
    assert.equal(
      existsSync(join(wikiDir, "parallel-collision-ledger.md")),
      false,
    );
    // The posted body round-trips through the parser (KD2 body fidelity).
    assert.match(posts[0].args[1].body, /```yaml alloc/);
    assert.match(posts[0].args[1].body, /ids: \["#97", "#98"\]/);
  });

  test("rebuild projects the anchor record onto the ledger page", async () => {
    const gh = createMockGhClient({
      responses: {
        apiGetPaginated: [
          comment(100, { kind: "occ", ids: ["#97"], event: "aaa" }),
          comment(110, { kind: "fold", ids: ["n=99"], event: "bbb" }),
        ],
      },
    });
    const { harness, ctx } = ctxFor({ gh, args: { subcommand: "rebuild" } });
    const result = await runLedgerCommand(ctx);
    assert.equal(result.ok, true);
    const page = readFileSync(
      join(wikiDir, "parallel-collision-ledger.md"),
      "utf-8",
    );
    assert.match(page, /#97 \(event aaa\)/);
    assert.match(page, /n=99 \(event bbb\)/);
    assert.match(harness.stdout, /rebuilt: 2 ids/);
  });

  test("rebuild preserves anchor-cited prose from the existing page", async () => {
    const gh = createMockGhClient({
      responses: {
        apiGetPaginated: [
          comment(100, { kind: "meta", ids: ["M47"], event: "aaa" }),
        ],
      },
    });
    // Seed an existing page carrying a cited convention block.
    writeFileSync(
      join(wikiDir, "parallel-collision-ledger.md"),
      "# Parallel-Collision Ledger\n\n## Conventions and floors (binding)\n\n<!-- anchor:100 -->\nA lost claim row voids no allocation.\n",
    );
    const { ctx } = ctxFor({ gh, args: { subcommand: "rebuild" } });
    const result = await runLedgerCommand(ctx);
    assert.equal(result.ok, true);
    const page = readFileSync(
      join(wikiDir, "parallel-collision-ledger.md"),
      "utf-8",
    );
    assert.match(page, /<!-- anchor:100 -->/);
    assert.match(page, /A lost claim row voids no allocation\./);
  });

  test("rebuild writes the MEMORY row projection without clobbering narrative", async () => {
    const gh = createMockGhClient({
      responses: {
        apiGetPaginated: [
          comment(100, { kind: "occ", ids: ["#97"], event: "aaa" }),
        ],
      },
    });
    // Seed a narrative-heavy MEMORY.md and delete any prior region.
    writeFileSync(
      join(wikiDir, "MEMORY.md"),
      "# Memory Index\n\n| Authored collision narrative the rebuild must not erase |\n",
    );
    const { ctx } = ctxFor({ gh, args: { subcommand: "rebuild" } });
    assert.equal((await runLedgerCommand(ctx)).ok, true);
    const memory = readFileSync(join(wikiDir, "MEMORY.md"), "utf-8");
    // Narrative preserved; derived row landed in a delimited region.
    assert.match(
      memory,
      /Authored collision narrative the rebuild must not erase/,
    );
    assert.match(memory, /<!-- ledger:memory-row -->/);
    assert.match(memory, /next free #98/);

    // Round-trip: a verify against the just-written projection is clean.
    const v = ctxFor({ gh, args: { subcommand: "verify" } });
    assert.equal((await runLedgerCommand(v.ctx)).ok, true);
    assert.match(v.harness.stdout, /verify: clean/);
  });

  test("verify flags a MEMORY row diverging from the anchor record", async () => {
    const gh = createMockGhClient({
      responses: {
        apiGetPaginated: [
          comment(100, { kind: "occ", ids: ["#97"], event: "aaa" }),
          comment(110, { kind: "occ", ids: ["#98"], event: "bbb" }),
        ],
      },
    });
    // A region whose counters predate the anchor record (stale projection).
    writeFileSync(
      join(wikiDir, "MEMORY.md"),
      "narrative\n\n<!-- ledger:memory-row -->\nstale counters\n<!-- /ledger:memory-row -->\n",
    );
    // Page must also match so the failure is attributable to the row alone.
    const seed = ctxFor({ gh, args: { subcommand: "rebuild" } });
    await runLedgerCommand(seed.ctx);
    writeFileSync(
      join(wikiDir, "MEMORY.md"),
      "narrative\n\n<!-- ledger:memory-row -->\nstale counters\n<!-- /ledger:memory-row -->\n",
    );
    const v = ctxFor({ gh, args: { subcommand: "verify" } });
    const result = await runLedgerCommand(v.ctx);
    assert.equal(result.ok, false);
    assert.match(v.harness.stderr, /MEMORY row diverges/);
  });

  test("allocate --ids backfills explicit ids and refuses an already-anchored id", async () => {
    const gh = createMockGhClient({
      responses: {
        apiGetPaginated: [
          comment(100, { kind: "occ", ids: ["#50"], event: "have" }),
        ],
      },
    });
    const ok = ctxFor({
      gh,
      args: { subcommand: "allocate" },
      options: { kind: "occ", ids: "#23,#24", event: "backfilled" },
    });
    assert.equal((await runLedgerCommand(ok.ctx)).ok, true);
    assert.match(ok.harness.stdout, /#23 #24/);

    const dup = ctxFor({
      gh,
      args: { subcommand: "allocate" },
      options: { kind: "occ", ids: "#50", event: "x" },
    });
    const dupResult = await runLedgerCommand(dup.ctx);
    assert.equal(dupResult.ok, false);
    assert.match(dupResult.error, /already anchored/);
  });

  test("verify flags a double-allocation", async () => {
    const gh = createMockGhClient({
      responses: {
        apiGetPaginated: [
          comment(100, { kind: "occ", ids: ["#97"], event: "first" }),
          comment(150, { kind: "occ", ids: ["#97"], event: "second" }),
        ],
      },
    });
    const { harness, ctx } = ctxFor({ gh, args: { subcommand: "verify" } });
    const result = await runLedgerCommand(ctx);
    assert.equal(result.ok, false);
    assert.match(harness.stderr, /double-allocation/);
  });

  test("unknown subcommand is a usage error", async () => {
    const gh = createMockGhClient();
    const { ctx } = ctxFor({ gh, args: { subcommand: "bogus" } });
    const result = await runLedgerCommand(ctx);
    assert.equal(result.ok, false);
    assert.equal(result.code, 2);
  });
});
