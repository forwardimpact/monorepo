import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  existsSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GitClient } from "@forwardimpact/libutil/git-client";
import { createMockGitClient } from "@forwardimpact/libmock";
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

  test("declares the metrics-CSV union merge in a fresh wiki .gitattributes", async () => {
    // Re-seed the bare repo without the declaration so init must introduce it.
    bare = createBareRepo();
    seedBareRepo(bare, { gitattributes: false });
    await runInit();
    const attrs = readFileSync(join(wikiDir, ".gitattributes"), "utf-8");
    assert.ok(attrs.includes("metrics/**/*.csv merge=union"));
    // A second init leaves it unchanged (no duplicate line).
    await runInit();
    const after = readFileSync(join(wikiDir, ".gitattributes"), "utf-8");
    const count = after
      .split("\n")
      .filter((l) => l.trim() === "metrics/**/*.csv merge=union").length;
    assert.equal(count, 1);
  });
});

// Real-fs scaffolding: init resolves the project root via the real finder over
// proc.cwd() (a tmpdir holding package.json), so this stays an integration test
// even though the wiki clone is mocked.
describe("init Active Claims scaffolding (local fs)", () => {
  let dir;
  let wikiRoot;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "init-active-"));
    wikiRoot = join(dir, "wiki");
    mkdirSync(wikiRoot, { recursive: true });
    writeFileSync(join(dir, "package.json"), '{"name":"root"}');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  async function runInit() {
    const harness = makeRuntime({
      cwd: dir,
      // FIT_WIKI_URL points at a non-existent path so the clone fails cleanly;
      // the handler falls through to the local-only scaffolding.
      env: { FIT_WIKI_URL: "/nonexistent/repo.git" },
    });
    const wikiSync = {
      isCloned: () => false,
      ensureCloned: async () => ({ cloned: false, reason: "no such repo" }),
      inheritIdentity: async () => {},
    };
    return runInitCommand(
      ctxFor({
        runtime: harness.runtime,
        wikiSync,
        gitClient: createMockGitClient(),
        options: {},
      }),
    );
  }

  test("scaffolds ## Active Claims in MEMORY.md when absent", async () => {
    writeFileSync(
      join(wikiRoot, "MEMORY.md"),
      "## Cross-Cutting Priorities\n\n| Item | Agents | Owner | Status | Added |\n| --- | --- | --- | --- | --- |\n| *None* | — | — | — | — |\n",
    );
    await runInit();
    const text = readFileSync(join(wikiRoot, "MEMORY.md"), "utf-8");
    assert.match(text, /## Active Claims/);
    assert.match(
      text,
      /\| agent \| target \| branch \| pr \| claimed_at \| expires_at \|/,
    );
  });

  test("idempotent — second init does not duplicate Active Claims", async () => {
    writeFileSync(
      join(wikiRoot, "MEMORY.md"),
      "## Cross-Cutting Priorities\n\n| Item | Agents | Owner | Status | Added |\n| --- | --- | --- | --- | --- |\n| *None* | — | — | — | — |\n",
    );
    await runInit();
    await runInit();
    const text = readFileSync(join(wikiRoot, "MEMORY.md"), "utf-8");
    assert.equal((text.match(/## Active Claims/g) || []).length, 1);
  });
});
