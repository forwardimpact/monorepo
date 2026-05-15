import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { WikiRepo } from "../src/wiki-repo.js";
import { listSkills } from "../src/skill-roster.js";
import { deriveWikiUrl } from "../src/commands/init.js";
import { git, createBareRepo, seedBareRepo } from "./helpers.js";

describe("init command", () => {
  let projectDir;
  let bare;
  let wikiDir;
  let skillsDir;

  beforeEach(() => {
    bare = createBareRepo();
    seedBareRepo(bare);

    projectDir = mkdtempSync(join(tmpdir(), "wiki-project-"));
    wikiDir = join(projectDir, "wiki");
    skillsDir = join(projectDir, ".claude", "skills");
    mkdirSync(skillsDir, { recursive: true });
    mkdirSync(join(skillsDir, "kata-spec"));
    mkdirSync(join(skillsDir, "kata-plan"));
    mkdirSync(join(skillsDir, "fit-wiki"));

    git(projectDir, "init");
    git(projectDir, "config", "user.name", "Project User");
    git(projectDir, "config", "user.email", "project@example.com");
  });

  test("clones wiki and creates metrics directories", () => {
    const repo = new WikiRepo({
      wikiDir,
      parentDir: projectDir,
      resolveToken: () => null,
    });
    const result = repo.ensureCloned(bare);
    assert.equal(result.cloned, true);

    repo.inheritIdentity();

    const skills = listSkills({ skillsDir });
    for (const slug of skills) {
      mkdirSync(join(wikiDir, "metrics", slug), { recursive: true });
    }

    const gitDir = git(wikiDir, "rev-parse", "--git-dir");
    assert.ok(gitDir);

    assert.ok(existsSync(join(wikiDir, "metrics", "kata-spec")));
    assert.ok(existsSync(join(wikiDir, "metrics", "kata-plan")));
    assert.ok(!existsSync(join(wikiDir, "metrics", "fit-wiki")));
  });

  test("idempotent — second run produces no error", () => {
    const repo = new WikiRepo({
      wikiDir,
      parentDir: projectDir,
      resolveToken: () => null,
    });
    repo.ensureCloned(bare);
    repo.inheritIdentity();

    const skills = listSkills({ skillsDir });
    for (const slug of skills) {
      mkdirSync(join(wikiDir, "metrics", slug), { recursive: true });
    }

    const result = repo.ensureCloned(bare);
    assert.equal(result.cloned, true);
    assert.equal(result.reason, "already-cloned");

    for (const slug of skills) {
      mkdirSync(join(wikiDir, "metrics", slug), { recursive: true });
    }

    assert.ok(existsSync(join(wikiDir, "metrics", "kata-spec")));
  });

  test("ensureCloned returns cloned:false for unreachable URL", () => {
    const repo = new WikiRepo({
      wikiDir,
      parentDir: projectDir,
      resolveToken: () => null,
    });
    const result = repo.ensureCloned("/nonexistent/repo.git");
    assert.equal(result.cloned, false);
  });
});

describe("deriveWikiUrl", () => {
  let projectDir;
  let priorEnv;

  beforeEach(() => {
    priorEnv = process.env.FIT_WIKI_URL;
    delete process.env.FIT_WIKI_URL;

    projectDir = mkdtempSync(join(tmpdir(), "wiki-derive-"));
    git(projectDir, "init");
  });

  test("FIT_WIKI_URL env var takes precedence over origin remote", () => {
    git(projectDir, "remote", "add", "origin", "https://example.com/foo/bar");
    process.env.FIT_WIKI_URL =
      "https://github.com/forwardimpact/monorepo.wiki.git";
    try {
      assert.equal(
        deriveWikiUrl(projectDir),
        "https://github.com/forwardimpact/monorepo.wiki.git",
      );
    } finally {
      if (priorEnv === undefined) delete process.env.FIT_WIKI_URL;
      else process.env.FIT_WIKI_URL = priorEnv;
    }
  });

  test("derives wiki URL by appending .wiki.git to origin", () => {
    git(projectDir, "remote", "add", "origin", "https://github.com/foo/bar");
    assert.equal(
      deriveWikiUrl(projectDir),
      "https://github.com/foo/bar.wiki.git",
    );
  });

  test("strips trailing .git before appending .wiki.git", () => {
    git(
      projectDir,
      "remote",
      "add",
      "origin",
      "https://github.com/foo/bar.git",
    );
    assert.equal(
      deriveWikiUrl(projectDir),
      "https://github.com/foo/bar.wiki.git",
    );
  });

  test("returns null when no origin remote configured", () => {
    assert.equal(deriveWikiUrl(projectDir), null);
  });
});
