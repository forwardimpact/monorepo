import { test, describe } from "node:test";
import assert from "node:assert";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { GitClient } from "@forwardimpact/libutil/git-client";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

import { sweepTier2 } from "../src/integrity.js";
import { runPullCommand, runPushCommand } from "../src/commands/sync.js";
import { WikiSync } from "../src/wiki-sync.js";
import {
  git,
  createBareRepo,
  seedBareRepo,
  cloneRepo,
  makeRuntime,
  ctxFor,
} from "./helpers.js";

const AGENT = "staff-engineer";
const EMAIL = "lane@example.com";

// Author a lane file commit at `dir`, optionally back-dated by `when` (ISO).
function laneCommit(dir, file, content, message, when) {
  writeFileSync(join(dir, file), content);
  git(dir, "add", "-A");
  const env = when
    ? { env: { GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when } }
    : undefined;
  if (env) git(dir, "commit", "-m", message, env);
  else git(dir, "commit", "-m", message);
}

function seedLane(wikiDir, email = EMAIL) {
  git(wikiDir, "checkout", "master");
  git(wikiDir, "config", "user.email", email);
}

function realGitClient() {
  return new GitClient({ runtime: createDefaultRuntime() });
}

describe("tier-2 boot sweep (real git)", () => {
  let bare;
  test.beforeEach(() => {
    bare = createBareRepo();
    seedBareRepo(bare);
  });

  test("vacuous on empty lane history (criterion 7 first clause)", async () => {
    const { wikiDir } = cloneRepo(bare, "fresh");
    seedLane(wikiDir);
    const detections = await sweepTier2({
      runtime: createDefaultRuntime(),
      gitClient: realGitClient(),
      wikiDir,
      agent: AGENT,
      now: Date.now(),
    });
    assert.deepEqual(detections, []);
  });

  test("clean previous session yields no detection", async () => {
    const { wikiDir } = cloneRepo(bare, "clean");
    seedLane(wikiDir);
    laneCommit(wikiDir, `${AGENT}-2026-W21.md`, "# Log\nrow one\n", "session");
    git(wikiDir, "push", "origin", "master");
    const detections = await sweepTier2({
      runtime: createDefaultRuntime(),
      gitClient: realGitClient(),
      wikiDir,
      agent: AGENT,
      now: Date.now(),
    });
    assert.deepEqual(detections, []);
  });

  test("erased previous-session content is detected (criterion 3)", async () => {
    const { wikiDir } = cloneRepo(bare, "victim");
    seedLane(wikiDir);
    laneCommit(
      wikiDir,
      `${AGENT}-2026-W21.md`,
      "# Log\nimportant row\n",
      "session push",
    );
    git(wikiDir, "push", "origin", "master");

    // A sibling clone erases the content at origin.
    const { wikiDir: eraser } = cloneRepo(bare, "eraser");
    git(eraser, "checkout", "master");
    git(eraser, "pull", "origin", "master");
    writeFileSync(join(eraser, `${AGENT}-2026-W21.md`), "# Log\n");
    git(eraser, "add", "-A");
    git(eraser, "commit", "-m", "erase");
    git(eraser, "push", "origin", "master");

    // Victim's next boot fetches+rebases, then sweeps.
    git(wikiDir, "fetch", "origin", "master");
    git(wikiDir, "rebase", "origin/master");

    const detections = await sweepTier2({
      runtime: createDefaultRuntime(),
      gitClient: realGitClient(),
      wikiDir,
      agent: AGENT,
      now: Date.now(),
    });
    assert.equal(detections.length, 1);
    assert.equal(detections[0].tier, 2);
    assert.equal(detections[0].contentId, "important row");
    assert.equal(detections[0].pushHome, `${AGENT}-2026-W21.md`);
    assert.match(detections[0].detectedAt, /^\d{4}-\d{2}-\d{2}T/);
  });

  test("content relocated by a part split is reported present (criterion 4)", async () => {
    const { wikiDir } = cloneRepo(bare, "rotated");
    seedLane(wikiDir);
    laneCommit(
      wikiDir,
      `${AGENT}-2026-W21.md`,
      "# Log\nrotated row\n",
      "session push",
    );
    git(wikiDir, "push", "origin", "master");

    // A rotation moves the row into a sealed part file at origin.
    const { wikiDir: rot } = cloneRepo(bare, "rotator");
    git(rot, "checkout", "master");
    git(rot, "pull", "origin", "master");
    writeFileSync(join(rot, `${AGENT}-2026-W21.md`), "# Log\n");
    writeFileSync(
      join(rot, `${AGENT}-2026-W21-part1.md`),
      "# Log (part 1 of 1)\nrotated row\n",
    );
    git(rot, "add", "-A");
    git(rot, "commit", "-m", "rotate");
    git(rot, "push", "origin", "master");

    git(wikiDir, "fetch", "origin", "master");
    git(wikiDir, "rebase", "origin/master");
    const detections = await sweepTier2({
      runtime: createDefaultRuntime(),
      gitClient: realGitClient(),
      wikiDir,
      agent: AGENT,
      now: Date.now(),
    });
    assert.deepEqual(detections, []);
  });

  test("own-trim across a window never reports the trimmed line absent (criterion 5)", async () => {
    const { wikiDir } = cloneRepo(bare, "trim");
    seedLane(wikiDir);
    laneCommit(wikiDir, `${AGENT}-2026-W21.md`, "# Log\ndraft row\n", "add");
    laneCommit(wikiDir, `${AGENT}-2026-W21.md`, "# Log\n", "trim");
    git(wikiDir, "push", "origin", "master");
    const detections = await sweepTier2({
      runtime: createDefaultRuntime(),
      gitClient: realGitClient(),
      wikiDir,
      agent: AGENT,
      now: Date.now(),
    });
    assert.deepEqual(detections, []);
  });

  test("recursive victim: an erased detection record is caught by the next sweep (criterion 6)", async () => {
    const { wikiDir } = cloneRepo(bare, "recursive");
    seedLane(wikiDir);
    // The lane lands a detection RECORD as an ordinary memory entry.
    laneCommit(
      wikiDir,
      `${AGENT}-2026-W21.md`,
      "# Log\ndetection record evidence\n",
      "record",
    );
    git(wikiDir, "push", "origin", "master");

    const { wikiDir: eraser } = cloneRepo(bare, "recursive-eraser");
    git(eraser, "checkout", "master");
    git(eraser, "pull", "origin", "master");
    writeFileSync(join(eraser, `${AGENT}-2026-W21.md`), "# Log\n");
    git(eraser, "add", "-A");
    git(eraser, "commit", "-m", "erase the record");
    git(eraser, "push", "origin", "master");

    git(wikiDir, "fetch", "origin", "master");
    git(wikiDir, "rebase", "origin/master");
    const detections = await sweepTier2({
      runtime: createDefaultRuntime(),
      gitClient: realGitClient(),
      wikiDir,
      agent: AGENT,
      now: Date.now(),
    });
    assert.equal(detections.length, 1);
    assert.equal(detections[0].contentId, "detection record evidence");
  });

  test("identical semantics across lanes (criterion 11, tier 2)", async () => {
    for (const agent of ["staff-engineer", "product-manager"]) {
      const { wikiDir } = cloneRepo(bare, `lane-${agent}`);
      git(wikiDir, "checkout", "master");
      git(wikiDir, "config", "user.email", `${agent}@example.com`);
      laneCommit(wikiDir, `${agent}-2026-W21.md`, "# Log\nlane row\n", "push");
      git(wikiDir, "push", "origin", "master");
      const { wikiDir: eraser } = cloneRepo(bare, `lane-${agent}-er`);
      git(eraser, "checkout", "master");
      git(eraser, "pull", "origin", "master");
      writeFileSync(join(eraser, `${agent}-2026-W21.md`), "# Log\n");
      git(eraser, "add", "-A");
      git(eraser, "commit", "-m", "erase");
      git(eraser, "push", "origin", "master");
      git(wikiDir, "fetch", "origin", "master");
      git(wikiDir, "rebase", "origin/master");
      const detections = await sweepTier2({
        runtime: createDefaultRuntime(),
        gitClient: realGitClient(),
        wikiDir,
        agent,
        now: Date.now(),
      });
      assert.equal(detections.length, 1, `lane ${agent}`);
      assert.equal(detections[0].pushHome, `${agent}-2026-W21.md`);
      // Reset origin between lanes.
      git(eraser, "push", "origin", "master", "--force");
    }
  });

  test("the sweep writes nothing (criterion 9)", async () => {
    const { wikiDir } = cloneRepo(bare, "nowrite");
    seedLane(wikiDir);
    laneCommit(wikiDir, `${AGENT}-2026-W21.md`, "# Log\nrow\n", "push");
    git(wikiDir, "push", "origin", "master");
    const { wikiDir: eraser } = cloneRepo(bare, "nowrite-er");
    git(eraser, "checkout", "master");
    git(eraser, "pull", "origin", "master");
    writeFileSync(join(eraser, `${AGENT}-2026-W21.md`), "# Log\n");
    git(eraser, "add", "-A");
    git(eraser, "commit", "-m", "erase");
    git(eraser, "push", "origin", "master");
    git(wikiDir, "fetch", "origin", "master");
    git(wikiDir, "rebase", "origin/master");
    const tipBefore = git(wikiDir, "rev-parse", "HEAD");
    await sweepTier2({
      runtime: createDefaultRuntime(),
      gitClient: realGitClient(),
      wikiDir,
      agent: AGENT,
      now: Date.now(),
    });
    assert.equal(git(wikiDir, "status", "--porcelain"), "");
    assert.equal(git(wikiDir, "rev-parse", "HEAD"), tipBefore);
  });
});

describe("tier-2 in runPullCommand (real git)", () => {
  test("a detection surfaces in pull output without gating (criteria 12, 13)", async () => {
    const bare = createBareRepo();
    seedBareRepo(bare);
    const { parent, wikiDir } = cloneRepo(bare, "pc-victim");
    git(wikiDir, "checkout", "master");
    git(wikiDir, "config", "user.email", EMAIL);
    laneCommit(wikiDir, `${AGENT}-2026-W21.md`, "# Log\npulled row\n", "push");
    git(wikiDir, "push", "origin", "master");

    const { wikiDir: eraser } = cloneRepo(bare, "pc-eraser");
    git(eraser, "checkout", "master");
    git(eraser, "pull", "origin", "master");
    writeFileSync(join(eraser, `${AGENT}-2026-W21.md`), "# Log\n");
    git(eraser, "add", "-A");
    git(eraser, "commit", "-m", "erase");
    git(eraser, "push", "origin", "master");

    const harness = makeRuntime({ cwd: parent });
    const gitClient = new GitClient({ runtime: harness.runtime });
    const wikiSync = new WikiSync({
      runtime: harness.runtime,
      gitClient,
      wikiDir,
      parentDir: parent,
    });
    const ctx = ctxFor({
      runtime: harness.runtime,
      wikiSync,
      gitClient,
      options: { agent: AGENT, "wiki-root": wikiDir },
    });
    const result = await runPullCommand(ctx);
    assert.equal(result.ok, true); // never gates the flow
    assert.match(harness.stdout, /integrity\[tier 2\]/);
    assert.match(harness.stdout, /pulled row/);
  });
});

describe("tier-1 post-push probe (real git)", () => {
  let bare;
  test.beforeEach(() => {
    bare = createBareRepo();
    seedBareRepo(bare);
  });

  // A GitClient whose push is a no-op, modelling the fire-and-forget push
  // silently failing: HEAD never reaches origin, so the post-push probe's fetch
  // sees a tip without the just-"pushed" content — a deterministic tier-1
  // absence. The probe's own read path (fetch + showFile) runs for real.
  class DroppedPushGitClient extends GitClient {
    async push() {
      return { stdout: "", stderr: "", exitCode: 0 };
    }
  }

  function syncWithDroppedPush(wikiDir, parent, runtime) {
    const gitClient = new DroppedPushGitClient({ runtime });
    return new WikiSync({ runtime, gitClient, wikiDir, parentDir: parent });
  }

  test("clean push surfaces no tier-1 detection (criterion 1)", async () => {
    const { parent, wikiDir } = cloneRepo(bare, "t1-clean");
    git(wikiDir, "checkout", "master");
    git(wikiDir, "config", "user.email", EMAIL);
    writeFileSync(join(wikiDir, `${AGENT}-2026-W21.md`), "# Log\nclean row\n");
    const runtime = createDefaultRuntime();
    const gitClient = new GitClient({ runtime });
    const ws = new WikiSync({ runtime, gitClient, wikiDir, parentDir: parent });
    const result = await ws.commitAndPush("wiki: push");
    assert.equal(result.pushed, true);
    assert.deepEqual(result.detections, []);
  });

  test("a push absent at the origin tip surfaces a named tier-1 detection (criterion 2)", async () => {
    const { parent, wikiDir } = cloneRepo(bare, "t1-absent");
    git(wikiDir, "checkout", "master");
    git(wikiDir, "config", "user.email", EMAIL);
    writeFileSync(join(wikiDir, `${AGENT}-2026-W21.md`), "# Log\nlost row\n");
    const runtime = createDefaultRuntime();
    const ws = syncWithDroppedPush(wikiDir, parent, runtime);
    const result = await ws.commitAndPush("wiki: push");
    assert.equal(result.pushed, true); // never gates
    const lost = result.detections.find((d) => d.contentId === "lost row");
    assert.ok(lost, "the absent lane row should be detected");
    assert.equal(lost.tier, 1);
    assert.equal(lost.pushHome, `${AGENT}-2026-W21.md`);
    assert.match(lost.detectedAt, /^\d{4}-\d{2}-\d{2}T/);
    // The probe wrote nothing.
    assert.equal(git(wikiDir, "status", "--porcelain"), "");
  });

  test("a successful push erased same-window at origin is detected (418b scenario, criterion 2)", async () => {
    // Push succeeds for real; a sibling erases the pushed content at origin
    // before the probe's post-push fetch observes the tip — the 42s same-window
    // erasure the corpus's 418b member exhibits. A GitClient subclass triggers
    // the real erasure exactly when the probe calls fetch().
    const { parent, wikiDir } = cloneRepo(bare, "t1-samewindow");
    git(wikiDir, "checkout", "master");
    git(wikiDir, "config", "user.email", EMAIL);
    writeFileSync(join(wikiDir, `${AGENT}-2026-W21.md`), "# Log\nwindow row\n");

    let erased = false;
    class ErasingFetchGitClient extends GitClient {
      async fetch(remote, refspec, opts) {
        // The first fetch is commitAndPush's pre-push fetch; the second is the
        // probe's post-push fetch — erase at origin just before it resolves.
        if (!erased && remote === "origin") {
          const after = await super.fetch(remote, refspec, opts);
          erased = true;
          return after;
        }
        // Probe fetch: a sibling erases the just-pushed content at origin first.
        const { wikiDir: er } = cloneRepo(bare, "t1-sw-eraser");
        git(er, "checkout", "master");
        git(er, "pull", "origin", "master");
        writeFileSync(join(er, `${AGENT}-2026-W21.md`), "# Log\n");
        git(er, "add", "-A");
        git(er, "commit", "-m", "same-window erase");
        git(er, "push", "origin", "master");
        return super.fetch(remote, refspec, opts);
      }
    }
    const runtime = createDefaultRuntime();
    const ws = new WikiSync({
      runtime,
      gitClient: new ErasingFetchGitClient({ runtime }),
      wikiDir,
      parentDir: parent,
    });
    const result = await ws.commitAndPush("wiki: push");
    assert.equal(result.pushed, true); // never gates
    const lost = result.detections.find((d) => d.contentId === "window row");
    assert.ok(lost, "the same-window-erased row should be detected");
    assert.equal(lost.tier, 1);
    assert.equal(lost.pushHome, `${AGENT}-2026-W21.md`);
    assert.equal(git(wikiDir, "status", "--porcelain"), "");
  });

  test("a merge-HEAD landing still captures and verifies its delta (merge-HEAD coverage)", async () => {
    // Victim clones first, then a sibling pushes a conflicting README change, so
    // the victim's pre-push rebase conflicts and falls back to mergeOursStrategy,
    // making HEAD a merge commit.
    const { parent, wikiDir } = cloneRepo(bare, "t1-merge");
    git(wikiDir, "checkout", "master");
    git(wikiDir, "config", "user.email", EMAIL);

    const { wikiDir: other } = cloneRepo(bare, "t1-merge-other");
    git(other, "checkout", "master");
    writeFileSync(join(other, "README.md"), "# Wiki\nremote edit\n");
    git(other, "add", "-A");
    git(other, "commit", "-m", "remote");
    git(other, "push", "origin", "master");

    writeFileSync(join(wikiDir, "README.md"), "# Wiki\nvictim edit\n");
    writeFileSync(join(wikiDir, `${AGENT}-2026-W21.md`), "# Log\nmerge row\n");

    const runtime = createDefaultRuntime();
    const ws = syncWithDroppedPush(wikiDir, parent, runtime);
    const result = await ws.commitAndPush("wiki: push");
    assert.equal(result.pushed, true);
    // HEAD is a merge commit; diffRange captured the real delta, so the probe
    // names the absent lane row (would be empty under a single-commit `show`).
    const ids = result.detections.map((d) => d.contentId);
    assert.ok(
      ids.includes("merge row"),
      `expected merge-HEAD delta captured, got ${JSON.stringify(ids)}`,
    );
    // HEAD has two parents — a merge commit — confirming diffRange (a two-tree
    // range diff) captured the delta a single-commit `git show` would miss.
    const parents = git(wikiDir, "rev-list", "--parents", "-1", "HEAD").split(
      " ",
    );
    assert.equal(
      parents.length,
      3,
      "HEAD should be a merge commit (2 parents)",
    );
  });

  test("a probe git failure degrades to no detections; push still succeeds (criterion 13)", async () => {
    const { parent, wikiDir } = cloneRepo(bare, "t1-degrade");
    git(wikiDir, "checkout", "master");
    git(wikiDir, "config", "user.email", EMAIL);
    writeFileSync(join(wikiDir, `${AGENT}-2026-W21.md`), "# Log\nrow\n");
    const runtime = createDefaultRuntime();
    // The probe's tip read throws; the probe must swallow it (never gates).
    class BrokenShowFileGitClient extends GitClient {
      async showFile() {
        throw new Error("simulated git failure");
      }
    }
    const ws = new WikiSync({
      runtime,
      gitClient: new BrokenShowFileGitClient({ runtime }),
      wikiDir,
      parentDir: parent,
    });
    const result = await ws.commitAndPush("wiki: push");
    assert.equal(result.pushed, true);
    assert.deepEqual(result.detections, []);
  });

  test("identical tier-1 semantics across lanes (criterion 11)", async () => {
    for (const agent of ["staff-engineer", "product-manager"]) {
      const b = createBareRepo();
      seedBareRepo(b);
      const { parent, wikiDir } = cloneRepo(b, `t1-lane-${agent}`);
      git(wikiDir, "checkout", "master");
      git(wikiDir, "config", "user.email", `${agent}@example.com`);
      writeFileSync(
        join(wikiDir, `${agent}-2026-W21.md`),
        `# Log\nrow for ${agent}\n`,
      );
      const runtime = createDefaultRuntime();
      const ws = syncWithDroppedPush(wikiDir, parent, runtime);
      const result = await ws.commitAndPush("wiki: push");
      const laneRow = result.detections.find(
        (d) => d.contentId === `row for ${agent}`,
      );
      assert.ok(laneRow, `lane ${agent} row should be detected`);
      assert.equal(laneRow.tier, 1);
      assert.equal(laneRow.pushHome, `${agent}-2026-W21.md`);
    }
  });

  test("runPushCommand renders a tier-1 detection in its output", async () => {
    const { parent, wikiDir } = cloneRepo(bare, "t1-render");
    git(wikiDir, "checkout", "master");
    git(wikiDir, "config", "user.email", EMAIL);
    writeFileSync(join(wikiDir, `${AGENT}-2026-W21.md`), "# Log\nrender row\n");
    const harness = makeRuntime({ cwd: parent });
    const ws = syncWithDroppedPush(wikiDir, parent, harness.runtime);
    const ctx = ctxFor({ runtime: harness.runtime, wikiSync: ws });
    const result = await runPushCommand(ctx);
    assert.equal(result.ok, true);
    assert.match(harness.stdout, /push: committed and pushed/);
    assert.match(harness.stdout, /integrity\[tier 1\]/);
    assert.match(harness.stdout, /render row/);
  });
});
