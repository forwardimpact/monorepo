import { test, describe } from "node:test";
import assert from "node:assert";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { GitClient } from "@forwardimpact/libutil/git-client";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

import { sweepTier2 } from "../src/integrity.js";
import { runPullCommand } from "../src/commands/sync.js";
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
