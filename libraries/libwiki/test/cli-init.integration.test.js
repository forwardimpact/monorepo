import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GitClient } from "@forwardimpact/libutil/git-client";
import { runInitCommand } from "../src/commands/init.js";
import { WikiSync } from "../src/wiki-sync.js";
import {
  git,
  createBareRepo,
  seedBareRepo,
  makeRuntime,
  ctxFor,
} from "./helpers.js";

describe("init command (real git)", () => {
  let projectDir;
  let bare;
  let wikiDir;

  beforeEach(() => {
    bare = createBareRepo();
    seedBareRepo(bare);
    projectDir = mkdtempSync(join(tmpdir(), "wiki-project-"));
    wikiDir = join(projectDir, "wiki");
    writeFileSync(join(projectDir, "package.json"), '{"name":"root"}');
    const skillsDir = join(projectDir, ".claude", "skills");
    mkdirSync(skillsDir, { recursive: true });
    mkdirSync(join(skillsDir, "kata-spec"));
    mkdirSync(join(skillsDir, "kata-plan"));
    mkdirSync(join(skillsDir, "fit-wiki"));
    git(projectDir, "init");
    git(projectDir, "config", "user.name", "Project User");
    git(projectDir, "config", "user.email", "project@example.com");
  });

  function runInit() {
    // FIT_WIKI_URL points the clone at the local bare repo.
    const harness = makeRuntime({
      cwd: projectDir,
      env: { FIT_WIKI_URL: bare },
    });
    const gitClient = new GitClient({ runtime: harness.runtime });
    const wikiSync = new WikiSync({
      runtime: harness.runtime,
      gitClient,
      wikiDir,
      parentDir: projectDir,
      resolveToken: () => null,
    });
    return runInitCommand(
      ctxFor({ runtime: harness.runtime, wikiSync, gitClient, options: {} }),
    );
  }

  test("clones wiki and creates kata-* metrics directories", async () => {
    await runInit();
    assert.ok(existsSync(join(wikiDir, ".git")));
    assert.ok(existsSync(join(wikiDir, "metrics", "kata-spec")));
    assert.ok(existsSync(join(wikiDir, "metrics", "kata-plan")));
    assert.ok(!existsSync(join(wikiDir, "metrics", "fit-wiki")));
  });

  test("idempotent — a second init produces no error", async () => {
    await runInit();
    const result = await runInit();
    assert.equal(result.ok, true);
    assert.ok(existsSync(join(wikiDir, "metrics", "kata-spec")));
  });
});
