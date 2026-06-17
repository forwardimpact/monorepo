import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { GitClient } from "@forwardimpact/libutil/git-client";
import { WikiSync, WikiPullConflict } from "../src/wiki-sync.js";
import { appendClaim, parseClaims } from "../src/active-claims.js";
import { git, createBareRepo, seedBareRepo, cloneRepo } from "./helpers.js";

const CLAIMS_HEADER =
  "## Active Claims\n\n| agent | target | branch | pr | claimed_at | expires_at |\n| --- | --- | --- | --- | --- | --- |\n";

function claimRow(agent, target, pr = null) {
  return {
    agent,
    target,
    branch: `feat/${target}`,
    pr,
    claimed_at: "2026-06-12",
    expires_at: "2026-06-19",
  };
}

function makeSync(wikiDir, parentDir, resolveToken = () => null) {
  const runtime = createDefaultRuntime();
  const gitClient = new GitClient({ runtime });
  return new WikiSync({ runtime, gitClient, wikiDir, parentDir, resolveToken });
}

describe("WikiSync (real git)", () => {
  let bare;

  beforeEach(() => {
    bare = createBareRepo();
    seedBareRepo(bare);
  });

  test("isCloned returns false for an empty dir", () => {
    const dir = mkdtempSync(join(tmpdir(), "wiki-empty-"));
    assert.equal(makeSync(join(dir, "wiki"), dir).isCloned(), false);
  });

  test("ensureCloned clones and isCloned then returns true", async () => {
    const parent = mkdtempSync(join(tmpdir(), "wiki-parent-"));
    const wikiDir = join(parent, "wiki");
    const ws = makeSync(wikiDir, parent);
    const result = await ws.ensureCloned(bare);
    assert.equal(result.cloned, true);
    assert.equal(ws.isCloned(), true);
  });

  test("ensureCloned is a no-op when already cloned", async () => {
    const { parent, wikiDir } = cloneRepo(bare, "noop");
    const result = await makeSync(wikiDir, parent).ensureCloned(bare);
    assert.deepEqual(result, { cloned: true, reason: "already-cloned" });
  });

  test("ensureCloned returns cloned:false for a bad URL", async () => {
    const parent = mkdtempSync(join(tmpdir(), "wiki-bad-"));
    const ws = makeSync(join(parent, "wiki"), parent);
    const result = await ws.ensureCloned("/nonexistent/path.git");
    assert.equal(result.cloned, false);
  });

  test("isClean detects a dirty tree", async () => {
    const { parent, wikiDir } = cloneRepo(bare, "dirty");
    git(wikiDir, "checkout", "master");
    const ws = makeSync(wikiDir, parent);
    assert.equal(await ws.isClean(), true);
    writeFileSync(join(wikiDir, "new.md"), "content");
    assert.equal(await ws.isClean(), false);
  });

  test("inheritIdentity propagates parent config", async () => {
    const { parent, wikiDir } = cloneRepo(bare, "identity");
    git(parent, "init");
    git(parent, "config", "user.name", "Parent Name");
    git(parent, "config", "user.email", "parent@example.com");

    await makeSync(wikiDir, parent).inheritIdentity();

    assert.equal(git(wikiDir, "config", "--get", "user.name"), "Parent Name");
    assert.equal(
      git(wikiDir, "config", "--get", "user.email"),
      "parent@example.com",
    );
  });

  test("pull picks up remote changes", async () => {
    const { wikiDir: w1 } = cloneRepo(bare, "pull1");
    const { parent: p2, wikiDir: w2 } = cloneRepo(bare, "pull2");
    git(w1, "checkout", "master");
    git(w2, "checkout", "master");

    writeFileSync(join(w1, "change.md"), "from clone1");
    git(w1, "add", "-A");
    git(w1, "commit", "-m", "clone1 change");
    git(w1, "push", "origin", "master");

    await makeSync(w2, p2).pull();

    assert.equal(
      readFileSync(join(w2, "change.md"), "utf-8").trim(),
      "from clone1",
    );
  });

  test("pull throws WikiPullConflict on divergence", async () => {
    const { wikiDir: w1 } = cloneRepo(bare, "conflict1");
    const { parent: p2, wikiDir: w2 } = cloneRepo(bare, "conflict2");
    git(w1, "checkout", "master");
    git(w2, "checkout", "master");

    writeFileSync(join(w1, "README.md"), "clone1 edit");
    git(w1, "add", "-A");
    git(w1, "commit", "-m", "clone1");
    git(w1, "push", "origin", "master");

    writeFileSync(join(w2, "README.md"), "clone2 edit");
    git(w2, "add", "-A");
    git(w2, "commit", "-m", "clone2");

    await assert.rejects(() => makeSync(w2, p2).pull(), WikiPullConflict);
  });

  test("commitAndPush is a no-op on a clean tree", async () => {
    const { parent, wikiDir } = cloneRepo(bare, "clean");
    git(wikiDir, "checkout", "master");
    const result = await makeSync(wikiDir, parent).commitAndPush("test");
    assert.deepEqual(result, {
      pushed: false,
      reason: "clean",
      detections: [],
    });
  });

  test("commitAndPush commits and pushes a dirty tree", async () => {
    const { parent, wikiDir } = cloneRepo(bare, "push");
    git(wikiDir, "checkout", "master");

    writeFileSync(join(wikiDir, "update.md"), "new content");
    const result = await makeSync(wikiDir, parent).commitAndPush(
      "wiki: test push",
    );
    assert.equal(result.pushed, true);
    assert.ok(
      git(wikiDir, "log", "-1", "--oneline").includes("wiki: test push"),
    );
    assert.equal(git(wikiDir, "diff", "origin/master"), "");
  });

  test("commitAndPush pushes pre-existing local commits on a clean tree", async () => {
    const { parent, wikiDir } = cloneRepo(bare, "ahead");
    git(wikiDir, "checkout", "master");

    writeFileSync(join(wikiDir, "inline.md"), "committed inline by caller");
    git(wikiDir, "add", "-A");
    git(wikiDir, "commit", "-m", "inline commit by caller");
    const headBefore = git(wikiDir, "rev-parse", "HEAD");

    const result = await makeSync(wikiDir, parent).commitAndPush(
      "wiki: should not be used",
    );
    assert.deepEqual(result, {
      pushed: true,
      reason: "pushed",
      detections: [],
    });
    assert.equal(
      git(wikiDir, "rev-parse", "HEAD"),
      headBefore,
      "no new commit object should be created when the tree is clean",
    );
    assert.equal(git(wikiDir, "diff", "origin/master"), "");
    assert.equal(
      git(wikiDir, "log", "-1", "--format=%s"),
      "inline commit by caller",
    );
  });

  test("commitAndPush with paths commits only the pathspec and leaves foreign dirt", async () => {
    const { parent, wikiDir } = cloneRepo(bare, "scoped");
    git(wikiDir, "checkout", "master");
    writeFileSync(join(wikiDir, "MEMORY.md"), "# Memory\n");
    git(wikiDir, "add", "-A");
    git(wikiDir, "commit", "-m", "seed memory");
    git(wikiDir, "push", "origin", "master");

    writeFileSync(join(wikiDir, "MEMORY.md"), "# Memory\nclaim row\n");
    writeFileSync(join(wikiDir, "README.md"), "foreign tracked edit");
    writeFileSync(join(wikiDir, "residue.md"), "foreign untracked");

    const result = await makeSync(wikiDir, parent).commitAndPush(
      "wiki: claim x",
      ["MEMORY.md"],
    );
    assert.deepEqual(result, {
      pushed: true,
      reason: "pushed",
      detections: [],
    });
    assert.equal(
      git(wikiDir, "show", "--name-only", "--format=", "HEAD"),
      "MEMORY.md",
    );
    const status = git(wikiDir, "status", "--porcelain");
    assert.match(status, /^ ?M README\.md$/m);
    assert.match(status, /^\?\? residue\.md$/m);
  });

  test("commitAndPush with paths is a no-op when only foreign files are dirty", async () => {
    const { parent, wikiDir } = cloneRepo(bare, "scoped-noop");
    git(wikiDir, "checkout", "master");
    writeFileSync(join(wikiDir, "README.md"), "foreign tracked edit");

    const result = await makeSync(wikiDir, parent).commitAndPush(
      "wiki: claim x",
      ["MEMORY.md"],
    );
    assert.deepEqual(result, {
      pushed: false,
      reason: "clean",
      detections: [],
    });
    assert.match(
      git(wikiDir, "status", "--porcelain"),
      /^ ?M README\.md$/m,
      "foreign dirt must survive the no-op",
    );
  });

  test("commitAndPush with paths rebases over remote changes despite foreign dirt", async () => {
    const { wikiDir: w1 } = cloneRepo(bare, "scoped-r1");
    git(w1, "checkout", "master");
    writeFileSync(join(w1, "MEMORY.md"), "# Memory\n");
    git(w1, "add", "-A");
    git(w1, "commit", "-m", "seed memory");
    git(w1, "push", "origin", "master");

    const { parent: p2, wikiDir: w2 } = cloneRepo(bare, "scoped-r2");
    git(w2, "checkout", "master");

    writeFileSync(join(w1, "remote-change.md"), "from clone1");
    git(w1, "add", "-A");
    git(w1, "commit", "-m", "remote change");
    git(w1, "push", "origin", "master");

    writeFileSync(join(w2, "MEMORY.md"), "# Memory\nclaim row\n");
    writeFileSync(join(w2, "README.md"), "foreign tracked edit");

    const result = await makeSync(w2, p2).commitAndPush("wiki: claim x", [
      "MEMORY.md",
    ]);
    assert.deepEqual(result, {
      pushed: true,
      reason: "pushed",
      detections: [],
    });
    assert.equal(
      readFileSync(join(w2, "remote-change.md"), "utf-8").trim(),
      "from clone1",
    );
    assert.match(
      git(w2, "status", "--porcelain"),
      /^ ?M README\.md$/m,
      "autostash must restore foreign dirt after the rebase",
    );
  });

  test("commitAndPush recovers via merge -X ours on divergence", async () => {
    const { wikiDir: w1 } = cloneRepo(bare, "merge1");
    const { parent: p2, wikiDir: w2 } = cloneRepo(bare, "merge2");
    git(w1, "checkout", "master");
    git(w2, "checkout", "master");

    writeFileSync(join(w1, "README.md"), "remote change");
    git(w1, "add", "-A");
    git(w1, "commit", "-m", "remote");
    git(w1, "push", "origin", "master");

    writeFileSync(join(w2, "README.md"), "local wins");
    const result = await makeSync(w2, p2).commitAndPush("wiki: local update");
    assert.equal(result.pushed, true);
    assert.equal(
      readFileSync(join(w2, "README.md"), "utf-8").trim(),
      "local wins",
    );
  });
});

describe("WikiSync resolveToken (real git)", () => {
  let bare;

  beforeEach(() => {
    bare = createBareRepo();
    seedBareRepo(bare);
  });

  test("invokes resolveToken on network operations", async () => {
    const { parent, wikiDir } = cloneRepo(bare, "tokencb");
    git(wikiDir, "checkout", "master");
    let calls = 0;
    const ws = makeSync(wikiDir, parent, () => {
      calls++;
      return "ghp_fromcallback";
    });
    await ws.fetch();
    assert.ok(calls >= 1, "resolveToken should be called by fetch()");
  });

  test("does not invoke resolveToken on local-only operations", async () => {
    const { parent, wikiDir } = cloneRepo(bare, "tokenlocal");
    git(wikiDir, "checkout", "master");
    let calls = 0;
    const ws = makeSync(wikiDir, parent, () => {
      calls++;
      return "ghp_unused";
    });
    ws.isCloned();
    await ws.isClean();
    await ws.inheritIdentity();
    assert.equal(calls, 0);
  });

  test("propagates errors thrown by resolveToken", async () => {
    const { parent, wikiDir } = cloneRepo(bare, "tokenthrow");
    git(wikiDir, "checkout", "master");
    const ws = makeSync(wikiDir, parent, () => {
      throw new Error("not configured");
    });
    await assert.rejects(() => ws.fetch(), /not configured/);
  });

  // Seed the bare origin with a one-row Active Claims table on master.
  function seedClaims(seedClone) {
    const memPath = join(seedClone, "MEMORY.md");
    writeFileSync(memPath, CLAIMS_HEADER);
    git(seedClone, "add", "-A");
    git(seedClone, "commit", "-m", "seed claims");
    git(seedClone, "push", "origin", "master");
  }

  test("storm geometry: a stale-base claim re-applies, conserving the sibling row", async () => {
    // Seed origin with the claims table.
    const { wikiDir: seed } = cloneRepo(bare, "claimseed");
    git(seed, "checkout", "master");
    seedClaims(seed);

    // Clone A lands a sibling's row on the tip first — with a POPULATED pr
    // field, so the field-revert path (a populated field reverting to unset)
    // has a non-null value to exercise.
    const { wikiDir: wa } = cloneRepo(bare, "claimA");
    git(wa, "checkout", "master");
    const aText = readFileSync(join(wa, "MEMORY.md"), "utf-8");
    writeFileSync(
      join(wa, "MEMORY.md"),
      appendClaim(aText, claimRow("product-manager", "1900", "1681")).text,
    );
    git(wa, "add", "-A");
    git(wa, "commit", "-m", "wiki: claim 1900");
    git(wa, "push", "origin", "master");

    // Clone B, on the now-stale base, writes its own row and commits, then
    // commitAndPush with a reapply closure. Its rebase conflicts on the tail.
    // It also carries a foreign uncommitted edit to another file — the residue
    // resetSoft (HEAD-only) must preserve through the loop.
    const { parent: pb, wikiDir: wb } = cloneRepo(bare, "claimB");
    git(wb, "checkout", "master");
    const bClaim = claimRow("staff-engineer", "1910");
    const bText = readFileSync(join(wb, "MEMORY.md"), "utf-8");
    writeFileSync(join(wb, "MEMORY.md"), appendClaim(bText, bClaim).text);
    writeFileSync(join(wb, "README.md"), "# Wiki\nforeign uncommitted edit\n");

    const ws = makeSync(wb, pb);
    const reapply = (fresh) => {
      const r = appendClaim(fresh, bClaim);
      return r.inserted ? r.text : null;
    };
    const result = await ws.commitAndPush("wiki: claim 1910", ["MEMORY.md"], {
      reapply,
    });
    assert.equal(result.pushed, true);

    // The foreign uncommitted edit to README.md survived the re-apply loop
    // (resetSoft is HEAD-only; checkoutPaths is scoped to MEMORY.md).
    assert.match(
      readFileSync(join(wb, "README.md"), "utf-8"),
      /foreign uncommitted edit/,
      "resetSoft + path-scoped checkout preserved foreign residue",
    );

    // The bare origin tip now holds BOTH rows — the sibling's was conserved,
    // not erased; the resolution is the re-applied row set, never textual.
    const { wikiDir: verify } = cloneRepo(bare, "claimverify");
    git(verify, "checkout", "master");
    const tip = readFileSync(join(verify, "MEMORY.md"), "utf-8");
    const claims = parseClaims(tip);
    const targets = claims.map((c) => `${c.agent}/${c.target}`);
    assert.ok(
      targets.includes("product-manager/1900"),
      "sibling row conserved",
    );
    assert.ok(targets.includes("staff-engineer/1910"), "own row landed");
    // The sibling's populated pr field is intact — not reverted (criterion 4).
    const sibling = claims.find((c) => c.target === "1900");
    assert.equal(sibling.pr, "1681", "sibling pr field not reverted");
    assert.ok(!tip.includes("<<<<<<<"), "no conflict markers / textual merge");
  });
});

// Concurrent appends to metrics CSVs must keep both sides' rows on every
// publish path (rebase and the merge -X ours fallback), while non-CSV surfaces
// keep their keep-local behavior.
describe("WikiSync metrics-CSV union merge", () => {
  const CSV = "metrics/coach/2026.csv";
  const HEADER = "date,metric,value,unit,run,note,event_type\n";

  // Read a file at the remote tip without disturbing the working clones.
  function remoteFile(bare, relPath) {
    const { wikiDir } = cloneRepo(bare, "reader");
    git(wikiDir, "checkout", "master");
    return readFileSync(join(wikiDir, relPath), "utf-8");
  }

  function appendLine(dir, relPath, line) {
    const full = join(dir, relPath);
    writeFileSync(full, readFileSync(full, "utf-8") + line);
  }

  test("concurrent distinct appends both survive the rebase path", async () => {
    const bare = createBareRepo();
    seedBareRepo(bare, { files: { [CSV]: HEADER } });

    const { parent: pA, wikiDir: wA } = cloneRepo(bare, "u-rebaseA");
    const { parent: pB, wikiDir: wB } = cloneRepo(bare, "u-rebaseB");
    git(wA, "checkout", "master");
    git(wB, "checkout", "master");

    appendLine(wA, CSV, "2026-06-01,a,1,count,,,\n");
    await makeSync(wA, pA).commitAndPush("wiki: A append", [CSV]);

    // B diverged from the same base; its publish rebases over A's tip.
    appendLine(wB, CSV, "2026-06-01,b,2,count,,,\n");
    await makeSync(wB, pB).commitAndPush("wiki: B append", [CSV]);

    const tip = remoteFile(bare, CSV);
    assert.match(tip, /,a,1,/, "A's row survived");
    assert.match(tip, /,b,2,/, "B's row survived");
  });

  test("the merge -X ours fallback also preserves both CSV rows", async () => {
    const bare = createBareRepo();
    seedBareRepo(bare, {
      files: { [CSV]: HEADER, "notes.md": "# Notes\nshared line\n" },
    });

    const { parent: pA, wikiDir: wA } = cloneRepo(bare, "u-mergeA");
    const { parent: pB, wikiDir: wB } = cloneRepo(bare, "u-mergeB");
    git(wA, "checkout", "master");
    git(wB, "checkout", "master");

    appendLine(wA, CSV, "2026-06-01,a,1,count,,,\n");
    writeFileSync(join(wA, "notes.md"), "# Notes\nA edits the shared line\n");
    await makeSync(wA, pA).commitAndPush("wiki: A append+note");

    // B conflicts with A on the SAME markdown line, forcing the rebase to fail
    // and the merge -X ours fallback to run. The CSV must still union.
    appendLine(wB, CSV, "2026-06-01,b,2,count,,,\n");
    writeFileSync(join(wB, "notes.md"), "# Notes\nB edits the shared line\n");
    await makeSync(wB, pB).commitAndPush("wiki: B append+note");

    const tip = remoteFile(bare, CSV);
    assert.match(tip, /,a,1,/, "A's row survived the fallback merge");
    assert.match(tip, /,b,2,/, "B's row survived the fallback merge");
  });

  test("non-CSV conflicts still resolve local-side on the fallback path", async () => {
    const bare = createBareRepo();
    seedBareRepo(bare, { files: { "notes.md": "# Notes\nshared line\n" } });

    const { parent: pA, wikiDir: wA } = cloneRepo(bare, "u-mdA");
    const { parent: pB, wikiDir: wB } = cloneRepo(bare, "u-mdB");
    git(wA, "checkout", "master");
    git(wB, "checkout", "master");

    writeFileSync(join(wA, "notes.md"), "# Notes\nremote line\n");
    await makeSync(wA, pA).commitAndPush("wiki: A note");

    writeFileSync(join(wB, "notes.md"), "# Notes\nlocal wins\n");
    await makeSync(wB, pB).commitAndPush("wiki: B note");

    // B published last; the fallback keeps B's local side, exactly as today.
    assert.match(remoteFile(bare, "notes.md"), /local wins/);
  });

  test("existing wiki acquires the declaration in exactly one commit, idempotently", async () => {
    const bare = createBareRepo();
    seedBareRepo(bare, { gitattributes: false });

    const { parent, wikiDir } = cloneRepo(bare, "u-provision");
    git(wikiDir, "checkout", "master");
    const baseHead = git(wikiDir, "rev-parse", "HEAD");

    // No payload: the ensure introduces .gitattributes in one commit and pushes.
    const first = await makeSync(wikiDir, parent).commitAndPush(
      "wiki: provision",
    );
    assert.equal(first.pushed, true);
    assert.notEqual(git(wikiDir, "rev-parse", "HEAD"), baseHead);
    assert.equal(
      git(wikiDir, "show", "--name-only", "--format=", "HEAD").trim(),
      ".gitattributes",
    );
    assert.equal(git(wikiDir, "diff", "origin/master"), "");

    // Steady state (pushed): a second sync is a clean no-op, zero commits.
    const headAfter = git(wikiDir, "rev-parse", "HEAD");
    const second = await makeSync(wikiDir, parent).commitAndPush(
      "wiki: provision",
    );
    assert.deepEqual(second, {
      pushed: false,
      reason: "clean",
      detections: [],
    });
    assert.equal(git(wikiDir, "rev-parse", "HEAD"), headAfter);
  });

  test("scoped-payload sync commits both the payload and the declaration", async () => {
    const bare = createBareRepo();
    seedBareRepo(bare, {
      gitattributes: false,
      files: { "MEMORY.md": "# M\n" },
    });

    const { parent, wikiDir } = cloneRepo(bare, "u-scoped");
    git(wikiDir, "checkout", "master");

    writeFileSync(join(wikiDir, "MEMORY.md"), "# M\nclaim row\n");
    const result = await makeSync(wikiDir, parent).commitAndPush(
      "wiki: claim",
      ["MEMORY.md"],
    );
    assert.equal(result.pushed, true);
    const committed = git(wikiDir, "show", "--name-only", "--format=", "HEAD")
      .split("\n")
      .filter(Boolean)
      .sort();
    assert.deepEqual(committed, [".gitattributes", "MEMORY.md"]);
  });

  test("a wiki provisioned from scratch survives concurrent appends end-to-end", async () => {
    // Spec criterion 3: bootstrap a wiki with no declaration, let provisioning
    // introduce it, then run the two-clone append with no further setup — both
    // rows survive. Proves the fresh-creation path end-to-end, not by composition.
    const bare = createBareRepo();
    seedBareRepo(bare, { gitattributes: false, files: { [CSV]: HEADER } });

    // First clone provisions the declaration (the ensure writes and commits it),
    // exactly as init/the first sync of a fresh wiki would.
    const { parent: pP, wikiDir: wP } = cloneRepo(bare, "u-fresh-provision");
    git(wP, "checkout", "master");
    await makeSync(wP, pP).commitAndPush("wiki: provision");

    // Two fresh clones taken AFTER provisioning each append a distinct row.
    const { parent: pA, wikiDir: wA } = cloneRepo(bare, "u-freshA");
    const { parent: pB, wikiDir: wB } = cloneRepo(bare, "u-freshB");
    git(wA, "checkout", "master");
    git(wB, "checkout", "master");

    appendLine(wA, CSV, "2026-06-01,a,1,count,,,\n");
    await makeSync(wA, pA).commitAndPush("wiki: A append", [CSV]);

    appendLine(wB, CSV, "2026-06-01,b,2,count,,,\n");
    await makeSync(wB, pB).commitAndPush("wiki: B append", [CSV]);

    const tip = remoteFile(bare, CSV);
    assert.match(tip, /,a,1,/, "A's row survived on a from-scratch wiki");
    assert.match(tip, /,b,2,/, "B's row survived on a from-scratch wiki");
  });
});
