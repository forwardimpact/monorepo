import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createMockGitClient } from "@forwardimpact/libmock";
import { deriveWikiUrl, runInitCommand } from "../src/commands/init.js";
import { makeRuntime, ctxFor } from "./helpers.js";

describe("deriveWikiUrl", () => {
  test("FIT_WIKI_URL env var takes precedence over origin remote", async () => {
    const git = createMockGitClient({
      responses: { remoteGetUrl: "https://example.com/foo/bar" },
    });
    const url = await deriveWikiUrl(git, "/p", {
      FIT_WIKI_URL: "https://github.com/forwardimpact/monorepo.wiki.git",
    });
    assert.equal(url, "https://github.com/forwardimpact/monorepo.wiki.git");
  });

  test("derives wiki URL by appending .wiki.git to origin", async () => {
    const git = createMockGitClient({
      responses: { remoteGetUrl: "https://github.com/foo/bar" },
    });
    assert.equal(
      await deriveWikiUrl(git, "/p", {}),
      "https://github.com/foo/bar.wiki.git",
    );
  });

  test("strips trailing .git before appending .wiki.git", async () => {
    const git = createMockGitClient({
      responses: { remoteGetUrl: "https://github.com/foo/bar.git" },
    });
    assert.equal(
      await deriveWikiUrl(git, "/p", {}),
      "https://github.com/foo/bar.wiki.git",
    );
  });

  test("returns null when no origin remote configured", async () => {
    const git = createMockGitClient({ responses: { remoteGetUrl: "" } });
    assert.equal(await deriveWikiUrl(git, "/p", {}), null);
  });
});

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
